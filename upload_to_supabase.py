"""Load events.csv into the Supabase `security_events` table.

Setup:
    pip install -r requirements.txt
    copy .env.example to .env and fill in your project URL + service role key

Usage:
    python upload_to_supabase.py          # append events
    python upload_to_supabase.py --wipe   # delete existing events first

SECURITY: the service role key bypasses Row Level Security. It lives ONLY in
your local .env (which is git-ignored). Never put it in the React app.
"""
import argparse
import csv
import os
import sys

from dotenv import load_dotenv
from supabase import create_client

BATCH = 500


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wipe", action="store_true", help="delete existing events first")
    ap.add_argument("--file", default="events.csv")
    args = ap.parse_args()

    load_dotenv()
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")

    client = create_client(url, key)

    if args.wipe:
        client.table("security_events").delete().gt("id", 0).execute()
        print("Existing events deleted.")

    with open(args.file, newline="") as f:
        rows = list(csv.DictReader(f))

    for i in range(0, len(rows), BATCH):
        client.table("security_events").insert(rows[i:i + BATCH]).execute()
        print(f"  inserted {min(i + BATCH, len(rows))}/{len(rows)}")
    print("Done.")


if __name__ == "__main__":
    main()