"""Score the detection rules against ground_truth.json.

    python score_detection.py

An alert "matches" a scenario when it has the same source IP and fires within
60 seconds of the scenario's time span. Reports:
  - attacks detected / missed (per scenario type)
  - false alerts on bait scenarios (benign look-alikes)
  - stray alerts that match nothing (noise on normal traffic)
"""
import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta

from detection import load_events, run_detection

SLACK = timedelta(seconds=60)


def matches(alert, truth):
    start = datetime.fromisoformat(truth["start"]) - SLACK
    end = datetime.fromisoformat(truth["end"]) + SLACK
    if not start <= alert["ts"] <= end:
        return False
    if alert["src_ip"] is None:   # account-centric alert (no single source IP)
        return alert["username"] in truth["usernames"]
    return alert["src_ip"] in (truth.get("src_ips") or [truth["src_ip"]])


def main():
    events = load_events()
    truths = json.load(open("ground_truth.json"))
    alerts = run_detection(events)

    attacks = [t for t in truths if t["malicious"]]
    bait = [t for t in truths if not t["malicious"]]

    print(f"{len(events)} events -> {len(alerts)} alerts\n")
    print("ATTACKS")
    by_type = defaultdict(lambda: [0, 0])
    missed = []
    for t in attacks:
        hit = [a for a in alerts if matches(a, t)]
        by_type[t["scenario"]][1] += 1
        if hit:
            by_type[t["scenario"]][0] += 1
        else:
            missed.append(t)
    caught = sum(v[0] for v in by_type.values())
    for name, (c, n) in sorted(by_type.items()):
        print(f"  {name:<22} {c}/{n}")
    print(f"  {'TOTAL':<22} {caught}/{len(attacks)}")
    for t in missed:
        print(f"  MISSED: {t['scenario']} from {t['src_ip']} at {t['start']}")

    print("\nBAIT (benign look-alikes; any alert here is a false positive)")
    fp_total = 0
    for t in bait:
        hit = [a for a in alerts if matches(a, t)]
        fp_total += len(hit)
        if hit:
            rules = Counter(a["rule"] for a in hit)
            print(f"  FALSE POSITIVE: {t['scenario']} {t['start']} -> {dict(rules)}")
    print(f"  false positives on bait: {fp_total} alerts across {len(bait)} scenarios")

    stray = [a for a in alerts if not any(matches(a, t) for t in truths)]
    print(f"\nSTRAY ALERTS (match no scenario): {len(stray)}")
    for a in stray[:10]:
        print(f"  {a['ts']} {a['rule']}: {a['description']}")

    print("\nALERTS BY RULE")
    for rule, n in Counter(a["rule"] for a in alerts).most_common():
        print(f"  {rule:<24} {n}")


if __name__ == "__main__":
    main()