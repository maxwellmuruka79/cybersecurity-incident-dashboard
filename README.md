# Cybersecurity Incident Monitoring and Management Dashboard

A SOC-style tool that ingests simulated
authentication events, detects suspicious patterns with rule-based detection,
turns alerts into incidents, and lets an analyst triage them.

**Status:** in development. All data is simulated.

## Stack (per project proposal)

- Frontend: React + TypeScript + Tailwind CSS
- Backend/DB/Auth: Supabase (PostgreSQL)
- Python: event generation and detection rules

## Setup

1. Create a Supabase project, then run `supabase/schema.sql` in the SQL Editor.
2. `pip install -r requirements.txt`
3. Copy `.env.example` to `.env` and fill in your project URL and service role key.
4. Generate and load data:
   ```bash
   python generate_data.py
   python upload_to_supabase.py --wipe
   ```
   No API key yet? Import `events.csv` through Supabase: Table Editor ->
   `security_events` -> Insert -> Import data from CSV.

`ground_truth.json` lists every injected attack and every benign look-alike
("bait"), so detection can be scored: attacks caught, attacks missed,
false positives on bait.

## Roadmap

- [x] Supabase schema + simulated data generator
- [ ] Python detection rules, scored against ground truth
- [ ] Alert -> incident grouping
- [ ] React dashboard: login, incident list, incident detail
- [ ] Charts, filtering, reporting
- [ ] Testing (functional, integration, security / RLS)