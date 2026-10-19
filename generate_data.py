"""Generate simulated authentication events for the incident dashboard.

Outputs:
    events.csv         one row per security event (importable into Supabase)
    ground_truth.json  every injected scenario, attacks AND benign "bait"

Bait scenarios look suspicious but are harmless. A good detection rule
must catch the attacks and stay quiet on the bait.

Usage:
    python generate_data.py                       # 30 days, 24 attacks, 6 stealth, 8 bait
    python generate_data.py --attacks 40 --bait 12 --days 45 --seed 7
"""
import argparse
import csv
import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Documentation-reserved IP ranges (RFC 5737): safe, never routable.
USERS = {
    # username: (home_country, [home IPs])
    "amina.k":   ("KE", ["203.0.113.10", "203.0.113.11"]),
    "brian.o":   ("KE", ["203.0.113.12"]),
    "cynthia.w": ("KE", ["203.0.113.13", "203.0.113.14"]),
    "david.m":   ("KE", ["203.0.113.15"]),
    "esther.n":  ("KE", ["203.0.113.16"]),
    "felix.a":   ("UG", ["203.0.113.40"]),
    "grace.t":   ("UG", ["203.0.113.41", "203.0.113.42"]),
    "hassan.j":  ("TZ", ["203.0.113.60"]),
    "irene.l":   ("TZ", ["203.0.113.61"]),
    "john.k":    ("KE", ["203.0.113.17"]),
    "kamau.p":   ("KE", ["203.0.113.18", "203.0.113.19"]),
    "lucy.s":    ("KE", ["203.0.113.20"]),
    "admin":     ("KE", ["203.0.113.5"]),
}
OFFICE_NAT_IP = "203.0.113.99"   # shared office gateway (bait)

ATTACKER_IPS = [
    ("198.51.100.23", "RU"), ("198.51.100.77", "CN"), ("198.51.100.140", "BR"),
    ("192.0.2.9", "RO"), ("192.0.2.88", "VN"), ("192.0.2.201", "IR"),
]
SPRAY_NAMES = ["admin", "root", "test", "user", "guest", "support", "info", "backup"]


def iso(ts):
    return ts.replace(microsecond=0).isoformat()


def pick_time(start, days, rng, night=False, morning=False):
    day = start + timedelta(days=rng.randint(1, days - 1))
    if night:
        hour = rng.choice([1, 2, 3, 4])
    elif morning:
        hour = rng.choice([7, 8])
    else:
        hour = rng.randint(0, 23)
    return day.replace(hour=hour, minute=rng.randint(0, 59), second=rng.randint(0, 59))


def normal_activity(start, days, rng):
    """Working-hours logins from usual IPs; occasional one-off typo."""
    events = []
    for d in range(days):
        day = start + timedelta(days=d)
        if day.weekday() >= 5 and rng.random() < 0.8:
            continue
        for user, (country, ips) in USERS.items():
            for _ in range(rng.randint(1, 4)):
                ts = day.replace(hour=rng.randint(7, 18), minute=rng.randint(0, 59),
                                 second=rng.randint(0, 59))
                ip = rng.choice(ips)
                if rng.random() < 0.04:
                    events.append((iso(ts), user, ip, country, "login_failure"))
                    ts += timedelta(seconds=rng.randint(4, 20))
                events.append((iso(ts), user, ip, country, "login_success"))
    return events


# ---------------------------------------------------------------- attacks
def brute_force(start, days, rng):
    ip, country = rng.choice(ATTACKER_IPS)
    user = rng.choice(list(USERS))
    t0 = pick_time(start, days, rng)
    ts, events = t0, []
    for _ in range(rng.randint(25, 45)):
        events.append((iso(ts), user, ip, country, "login_failure"))
        ts += timedelta(seconds=rng.randint(1, 4))
    return events, dict(scenario="brute_force", malicious=True, src_ip=ip,
                        usernames=[user], start=iso(t0), end=iso(ts))


def credential_stuffing(start, days, rng):
    ip, country = rng.choice(ATTACKER_IPS)
    targets = rng.sample(SPRAY_NAMES + rng.sample(list(USERS), 6), rng.randint(10, 14))
    t0 = pick_time(start, days, rng)
    ts, events = t0, []
    for user in targets:
        for _ in range(rng.randint(1, 2)):
            events.append((iso(ts), user, ip, country, "login_failure"))
            ts += timedelta(seconds=rng.randint(3, 10))
    return events, dict(scenario="credential_stuffing", malicious=True, src_ip=ip,
                        usernames=targets, start=iso(t0), end=iso(ts))


def account_compromise(start, days, rng):
    ip, country = rng.choice(ATTACKER_IPS)
    user = rng.choice([u for u in USERS if u != "admin"])
    t0 = pick_time(start, days, rng)
    ts, events = t0, []
    for _ in range(rng.randint(8, 14)):
        events.append((iso(ts), user, ip, country, "login_failure"))
        ts += timedelta(seconds=rng.randint(2, 6))
    events.append((iso(ts), user, ip, country, "login_success"))
    return events, dict(scenario="account_compromise", malicious=True, src_ip=ip,
                        usernames=[user], start=iso(t0), end=iso(ts))


def unusual_country(start, days, rng):
    ip, country = rng.choice(ATTACKER_IPS)
    user = rng.choice([u for u in USERS if u != "admin"])
    t0 = pick_time(start, days, rng, night=True)
    return ([(iso(t0), user, ip, country, "login_success")],
            dict(scenario="unusual_country", malicious=True, src_ip=ip,
                 usernames=[user], start=iso(t0), end=iso(t0)))


# ----------------------------------------------------------------- stealth
def low_and_slow(start, days, rng):
    """Brute force that stays under per-minute thresholds: one guess every 25-40s."""
    ip, country = rng.choice(ATTACKER_IPS)
    user = rng.choice(list(USERS))
    t0 = pick_time(start, days, rng)
    ts, events = t0, []
    for _ in range(rng.randint(14, 20)):
        events.append((iso(ts), user, ip, country, "login_failure"))
        ts += timedelta(seconds=rng.randint(25, 40))
    return events, dict(scenario="low_and_slow", malicious=True, stealth=True,
                        src_ip=ip, usernames=[user], start=iso(t0), end=iso(ts))


def distributed_spray(start, days, rng):
    """Botnet-style: 8-12 different IPs each try an account just twice.
    No single IP looks suspicious; only the target account tells the story."""
    user = rng.choice([u for u in USERS if u != "admin"])
    octets = rng.sample(range(2, 250), rng.randint(8, 12))
    ips = [(f"198.18.0.{o}", rng.choice(["RU", "CN", "BR", "RO", "VN", "IR", "NG", "UA"]))
           for o in octets]
    t0 = pick_time(start, days, rng)
    events = []
    for ip, country in ips:
        for _ in range(2):
            ts = t0 + timedelta(seconds=rng.randint(0, 180))
            events.append((iso(ts), user, ip, country, "login_failure"))
    ends = max(e[0] for e in events)
    return events, dict(scenario="distributed_spray", malicious=True, stealth=True,
                        src_ip=ips[0][0], src_ips=[ip for ip, _ in ips],
                        usernames=[user], start=iso(t0), end=ends)


# ------------------------------------------------------------------- bait
def forgetful_user(start, days, rng):
    """Legit user fumbles a password 4-7 times from their own IP, then gets in.
    A threshold of 'any 3 failures' would wrongly flag this."""
    user = rng.choice([u for u in USERS if u != "admin"])
    country, ips = USERS[user]
    ip = rng.choice(ips)
    t0 = pick_time(start, days, rng).replace(hour=rng.randint(8, 17))
    ts, events = t0, []
    for _ in range(rng.randint(4, 7)):
        events.append((iso(ts), user, ip, country, "login_failure"))
        ts += timedelta(seconds=rng.randint(20, 60))
    events.append((iso(ts), user, ip, country, "login_success"))
    return events, dict(scenario="forgetful_user", malicious=False, src_ip=ip,
                        usernames=[user], start=iso(t0), end=iso(ts))


def office_nat(start, days, rng):
    """Many different users sign in from one shared office IP in the morning.
    A naive 'many usernames from one IP' rule would wrongly flag this."""
    ke_users = [u for u, (c, _) in USERS.items() if c == "KE"]   # staff based at this office
    names = rng.sample(ke_users, rng.randint(6, min(9, len(ke_users))))
    t0 = pick_time(start, days, rng, morning=True)
    ts, events = t0, []
    for user in names:
        events.append((iso(ts), user, OFFICE_NAT_IP, "KE", "login_success"))
        ts += timedelta(seconds=rng.randint(10, 50))
    return events, dict(scenario="office_nat", malicious=False, src_ip=OFFICE_NAT_IP,
                        usernames=names, start=iso(t0), end=iso(ts))


ATTACK_ORDER = [brute_force, credential_stuffing, account_compromise, unusual_country]
BAIT_ORDER = [forgetful_user, office_nat]
STEALTH_ORDER = [low_and_slow, distributed_spray]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--attacks", type=int, default=24, help="number of malicious scenarios")
    ap.add_argument("--bait", type=int, default=8, help="number of benign look-alikes")
    ap.add_argument("--stealth", type=int, default=6,
                    help="number of evasive attacks (low-and-slow, distributed)")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    if args.days < 3:
        ap.error("--days must be at least 3")

    rng = random.Random(args.seed)
    end_day = datetime(2026, 10, 10, tzinfo=timezone.utc)
    start = end_day - timedelta(days=args.days)

    events = normal_activity(start, args.days, rng)
    truths = []
    for i in range(args.attacks):
        ev, truth = ATTACK_ORDER[i % len(ATTACK_ORDER)](start, args.days, rng)
        events += ev
        truths.append(truth)
    for i in range(args.bait):
        ev, truth = BAIT_ORDER[i % len(BAIT_ORDER)](start, args.days, rng)
        events += ev
        truths.append(truth)

    for i in range(args.stealth):   # generated last so older scenarios keep their data
        ev, truth = STEALTH_ORDER[i % len(STEALTH_ORDER)](start, args.days, rng)
        events += ev
        truths.append(truth)

    events.sort(key=lambda e: e[0])
    truths.sort(key=lambda t: t["start"])

    with open("events.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["occurred_at", "username", "src_ip", "country", "event_type"])
        w.writerows(events)
    Path("ground_truth.json").write_text(json.dumps(truths, indent=2))

    fails = sum(1 for e in events if e[4] == "login_failure")
    print(f"events.csv: {len(events)} events ({fails} failures) over {args.days} days")
    print(f"ground_truth.json: {args.attacks} attacks + {args.stealth} stealth + {args.bait} bait")


if __name__ == "__main__":
    main()