"""Rule-based detection over authentication events.

Each rule is a plain function: events in -> list of alerts out. No database
needed, so rules can be tested and scored offline (see score_detection.py).
The thresholds below mirror the seed rows in supabase/schema.sql.

An alert is a dict: rule, severity, ts, src_ip, username, description.
"""
import csv
from collections import Counter, defaultdict
from datetime import datetime, timedelta

# Keep in sync with the detection_rules seed data in supabase/schema.sql
RULES = {
    "brute_force":            {"severity": "high",     "min_failures": 10, "window_seconds": 120},
    "credential_stuffing":    {"severity": "high",     "min_usernames": 6, "window_seconds": 300},
    "success_after_failures": {"severity": "critical", "min_failures": 5,  "window_seconds": 60},
    "unusual_country":        {"severity": "medium"},
    "slow_brute_force":       {"severity": "medium",   "min_failures": 12, "window_seconds": 1800},
    "distributed_attack":     {"severity": "high",     "min_ips": 6,      "window_seconds": 300},
}


def load_events(path="events.csv"):
    events = []
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            row["ts"] = datetime.fromisoformat(row["occurred_at"])
            events.append(row)
    events.sort(key=lambda e: e["ts"])
    return events


def _alert(rule, ts, src_ip, username, description):
    return {"rule": rule, "severity": RULES[rule]["severity"], "ts": ts,
            "src_ip": src_ip, "username": username, "description": description}


def _bursts(events, key_fn, measure, threshold, window):
    """Slide a time window over each group of events. When the measure reaches
    the threshold, fire once, then stay quiet for one window so a single long
    burst produces one alert instead of dozens."""
    groups = defaultdict(list)
    for e in events:
        groups[key_fn(e)].append(e)
    for key, evs in groups.items():
        lo, quiet_until = 0, None
        for hi, e in enumerate(evs):
            while (e["ts"] - evs[lo]["ts"]).total_seconds() > window:
                lo += 1
            if quiet_until and e["ts"] < quiet_until:
                continue
            if measure(evs[lo:hi + 1]) >= threshold:
                yield key, e, evs[lo:hi + 1]
                quiet_until = e["ts"] + timedelta(seconds=window)


def brute_force(events):
    p = RULES["brute_force"]
    failures = [e for e in events if e["event_type"] == "login_failure"]
    for (ip, user), e, win in _bursts(failures, lambda e: (e["src_ip"], e["username"]),
                                      len, p["min_failures"], p["window_seconds"]):
        yield _alert("brute_force", e["ts"], ip, user,
                     f"{len(win)} failed logins for '{user}' from {ip} "
                     f"within {p['window_seconds']}s")


def credential_stuffing(events):
    p = RULES["credential_stuffing"]
    failures = [e for e in events if e["event_type"] == "login_failure"]
    distinct = lambda win: len({x["username"] for x in win})
    for ip, e, win in _bursts(failures, lambda e: e["src_ip"], distinct,
                              p["min_usernames"], p["window_seconds"]):
        yield _alert("credential_stuffing", e["ts"], ip, None,
                     f"{ip} failed against {distinct(win)} different usernames "
                     f"within {p['window_seconds']}s")


def success_after_failures(events):
    """A login succeeds right after a rapid burst of failures: the attacker got in."""
    p = RULES["success_after_failures"]
    by_pair = defaultdict(list)
    for e in events:
        by_pair[(e["src_ip"], e["username"])].append(e)
    for (ip, user), evs in by_pair.items():
        for i, e in enumerate(evs):
            if e["event_type"] != "login_success":
                continue
            recent = [x for x in evs[:i]
                      if x["event_type"] == "login_failure"
                      and (e["ts"] - x["ts"]).total_seconds() <= p["window_seconds"]]
            if len(recent) >= p["min_failures"]:
                yield _alert("success_after_failures", e["ts"], ip, user,
                             f"'{user}' logged in from {ip} after {len(recent)} "
                             f"failures in {p['window_seconds']}s")


def unusual_country(events):
    """Successful login from a country that isn't the user's usual one.
    Baseline = the most common country in that user's successful logins.
    (Limitation: baseline uses the whole dataset. A production rule would use
    only history before the event.)"""
    seen = defaultdict(Counter)
    for e in events:
        if e["event_type"] == "login_success":
            seen[e["username"]][e["country"]] += 1
    baseline = {u: c.most_common(1)[0][0] for u, c in seen.items()}
    for e in events:
        if e["event_type"] == "login_success" and e["country"] != baseline[e["username"]]:
            yield _alert("unusual_country", e["ts"], e["src_ip"], e["username"],
                         f"'{e['username']}' logged in from {e['country']} "
                         f"(usual: {baseline[e['username']]})")


def slow_brute_force(events):
    """Same idea as brute_force but over a long window, to catch attackers who
    deliberately guess slowly. Costs: a wider window can catch legitimate retry
    loops (e.g. a service account with an expired password)."""
    p = RULES["slow_brute_force"]
    failures = [e for e in events if e["event_type"] == "login_failure"]
    for (ip, user), e, win in _bursts(failures, lambda e: (e["src_ip"], e["username"]),
                                      len, p["min_failures"], p["window_seconds"]):
        minutes = (win[-1]["ts"] - win[0]["ts"]).total_seconds() / 60
        yield _alert("slow_brute_force", e["ts"], ip, user,
                     f"{len(win)} failed logins for '{user}' from {ip} "
                     f"spread over {minutes:.0f} minutes")


def distributed_attack(events):
    """Many different IPs failing against ONE account. Per-IP rules cannot see
    this, so the rule groups by the target account instead of by source."""
    p = RULES["distributed_attack"]
    failures = [e for e in events if e["event_type"] == "login_failure"]
    distinct_ips = lambda win: len({x["src_ip"] for x in win})
    for user, e, win in _bursts(failures, lambda e: e["username"], distinct_ips,
                                p["min_ips"], p["window_seconds"]):
        yield _alert("distributed_attack", e["ts"], None, user,
                     f"'{user}' hit by failed logins from {distinct_ips(win)} different IPs "
                     f"within {p['window_seconds']}s")


ALL_RULES = [brute_force, credential_stuffing, success_after_failures, unusual_country,
             slow_brute_force, distributed_attack]


def run_detection(events):
    alerts = [a for rule in ALL_RULES for a in rule(events)]

    # De-duplicate: if brute_force already flagged this IP+account, the slow
    # rule adds nothing but noise for the analyst.
    fast = [a for a in alerts if a["rule"] == "brute_force"]
    window = timedelta(seconds=RULES["slow_brute_force"]["window_seconds"])
    alerts = [a for a in alerts
              if a["rule"] != "slow_brute_force"
              or not any(f["src_ip"] == a["src_ip"] and f["username"] == a["username"]
                         and abs(f["ts"] - a["ts"]) <= window for f in fast)]

    alerts.sort(key=lambda a: a["ts"])
    return alerts