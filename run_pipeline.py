"""Detection pipeline: events -> alerts -> incidents.

    python run_pipeline.py --dry-run     # local test: reads events.csv, prints incidents,
                                         # touches nothing, needs no Supabase keys
    python run_pipeline.py               # reads events from Supabase, writes alerts + incidents
    python run_pipeline.py --reset       # wipes alerts, incidents AND notes first, then rebuilds

Grouping: alerts from the same source IP belong to one incident until there is
a quiet gap longer than GROUP_GAP_MINUTES. Four alerts from one attacker in one
sitting become one incident an analyst can act on, not four.

SECURITY: needs the service role key in .env (bypasses Row Level Security).
Run this from your machine only, never from the React app.
"""
import argparse
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta

from detection import load_events, run_detection

GROUP_GAP_MINUTES = 30
SEVERITY_ORDER = ["low", "medium", "high", "critical"]
# Which rule best describes an incident when several rules fired (most serious first)
RULE_PRIORITY = ["success_after_failures", "distributed_attack", "credential_stuffing",
                 "brute_force", "slow_brute_force", "unusual_country"]
CATEGORY = {
    "success_after_failures": "Account compromise",
    "credential_stuffing":    "Credential stuffing",
    "brute_force":            "Brute-force attack",
    "unusual_country":        "Suspicious login location",
    "slow_brute_force":       "Slow brute-force attack",
    "distributed_attack":     "Distributed attack",
}


def group_into_incidents(alerts, gap_minutes=GROUP_GAP_MINUTES):
    """Pure function: list of alerts -> list of incident dicts (each holding its alerts)."""
    by_ip = defaultdict(list)    # key: source IP, or the target account when there is no single IP
    for a in alerts:
        by_ip[a["src_ip"] or f"user:{a['username']}"].append(a)

    clusters = []
    for ip, group in by_ip.items():
        group.sort(key=lambda a: a["ts"])
        current = [group[0]]
        for a in group[1:]:
            if a["ts"] - current[-1]["ts"] > timedelta(minutes=gap_minutes):
                clusters.append((ip, current))
                current = []
            current.append(a)
        clusters.append((ip, current))

    incidents = []
    for ip, cluster in clusters:
        rules = {a["rule"] for a in cluster}
        top_rule = next(r for r in RULE_PRIORITY if r in rules)
        top_alert = next(a for a in cluster if a["rule"] == top_rule)
        user = top_alert["username"]
        category = CATEGORY[top_rule]
        if ip.startswith("user:"):
            title = f"{category} on {user}"
        else:
            title = f"{category}: {user} from {ip}" if user else f"{category} from {ip}"
        severity = max((a["severity"] for a in cluster), key=SEVERITY_ORDER.index)
        first, last = cluster[0]["ts"], cluster[-1]["ts"]
        incidents.append({
            "title": title,
            "category": category,
            "severity": severity,
            "description": (f"{len(cluster)} alert(s) from {ip.replace('user:', 'multiple IPs against ')} between "
                            f"{first:%Y-%m-%d %H:%M} and {last:%H:%M} UTC. "
                            f"Rules triggered: {', '.join(sorted(rules))}."),
            "created_at": first,
            "updated_at": last,
            "alerts": cluster,
        })
    incidents.sort(key=lambda i: i["created_at"])
    return incidents


def fetch_events(client):
    """Supabase returns at most 1000 rows per request, so page through."""
    rows, start, page = [], 0, 1000
    while True:
        chunk = (client.table("security_events").select("*")
                 .order("occurred_at").order("id")
                 .range(start, start + page - 1).execute().data)
        rows += chunk
        if len(chunk) < page:
            break
        start += page
    for r in rows:
        r["ts"] = datetime.fromisoformat(r["occurred_at"])
        r["src_ip"] = str(r["src_ip"]).split("/")[0]
    return rows


def print_incidents(incidents):
    for i in incidents:
        print(f"  [{i['severity']:<8}] {i['created_at']:%Y-%m-%d %H:%M}  "
              f"{i['title']}  ({len(i['alerts'])} alerts)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="use events.csv, write nothing")
    ap.add_argument("--reset", action="store_true",
                    help="delete existing alerts, incidents and notes first")
    args = ap.parse_args()

    if args.dry_run:
        events = load_events("events.csv")
        alerts = run_detection(events)
        incidents = group_into_incidents(alerts)
        print(f"{len(events)} events -> {len(alerts)} alerts -> {len(incidents)} incidents\n")
        print_incidents(incidents)
        return

    from dotenv import load_dotenv
    from supabase import create_client
    load_dotenv()
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
    client = create_client(url, key)

    existing = client.table("incidents").select("id", count="exact").limit(1).execute().count
    if existing and not args.reset:
        sys.exit(f"{existing} incidents already exist. Re-run with --reset to wipe and "
                 f"rebuild (this also deletes analyst notes).")
    if args.reset:
        for table in ("incident_notes", "alerts", "incidents"):   # children first (foreign keys)
            client.table(table).delete().gt("id", 0).execute()
        print("Existing alerts, incidents and notes deleted.")

    events = fetch_events(client)
    if not events:
        sys.exit("Fetched 0 events from security_events, nothing was written.\n"
                 "Most likely cause: the key in .env is the publishable/anon key, not the "
                 "secret key. Row Level Security hides all rows from it without any error.\n"
                 "Fix: use the secret key (sb_secret_...) from Settings > API Keys. "
                 "Otherwise check that SUPABASE_URL is the project where you imported the data.")
    alerts = run_detection(events)
    incidents = group_into_incidents(alerts)
    rule_ids = {r["name"]: r["id"] for r in
                client.table("detection_rules").select("id,name").execute().data}

    rows = []
    for inc in incidents:
        saved = client.table("incidents").insert({
            "title": inc["title"], "category": inc["category"], "severity": inc["severity"],
            "description": inc["description"], "status": "new",
            "created_at": inc["created_at"].isoformat(),
            "updated_at": inc["updated_at"].isoformat(),
        }).execute().data[0]
        for a in inc["alerts"]:
            rows.append({"rule_id": rule_ids[a["rule"]], "severity": a["severity"],
                         "src_ip": a["src_ip"], "username": a["username"],
                         "description": a["description"], "created_at": a["ts"].isoformat(),
                         "incident_id": saved["id"]})
    for i in range(0, len(rows), 500):
        client.table("alerts").insert(rows[i:i + 500]).execute()

    print(f"{len(events)} events -> {len(alerts)} alerts -> {len(incidents)} incidents saved.")
    print_incidents(incidents)


if __name__ == "__main__":
    main()