-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Entities follow Section 3.7 of the proposal:
-- Users, Security Events, Incidents, Alerts, Detection Rules (+ incident notes).

-- ---------- Users (extends Supabase Auth) ----------
create table if not exists profiles (
    id         uuid primary key references auth.users(id) on delete cascade,
    full_name  text,
    role       text not null default 'analyst' check (role in ('admin', 'analyst', 'viewer')),
    created_at timestamptz not null default now()
);

-- Auto-create a profile whenever someone signs up.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    insert into profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name');
    return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
    for each row execute function handle_new_user();

-- ---------- Security events (raw input) ----------
create table if not exists security_events (
    id          bigint generated always as identity primary key,
    occurred_at timestamptz not null,
    username    text not null,
    src_ip      inet not null,
    country     text not null,                       -- simulated geo-lookup
    event_type  text not null check (event_type in ('login_success', 'login_failure'))
);
create index if not exists idx_events_time on security_events (occurred_at);
create index if not exists idx_events_ip   on security_events (src_ip);
create index if not exists idx_events_user on security_events (username);

-- ---------- Detection rules ----------
create table if not exists detection_rules (
    id          bigint generated always as identity primary key,
    name        text not null unique,                -- e.g. 'brute_force'
    description text not null,
    severity    text not null check (severity in ('low', 'medium', 'high', 'critical')),
    params      jsonb not null default '{}',         -- thresholds, windows
    enabled     boolean not null default true
);

insert into detection_rules (name, description, severity, params) values
  ('brute_force',
   'Many failed logins against one account from one IP in a short window',
   'high', '{"min_failures": 10, "window_seconds": 120}'),
  ('credential_stuffing',
   'One IP failing against many different usernames in a short window',
   'high', '{"min_usernames": 6, "window_seconds": 300}'),
  ('success_after_failures',
   'Successful login right after a burst of failures from the same IP',
   'critical', '{"min_failures": 5, "window_seconds": 60}'),
  ('unusual_country',
   'Successful login from a country the user has never logged in from',
   'medium', '{}'),
  ('slow_brute_force',
   'Many failed logins for one account from one IP spread over a long window',
   'medium', '{"min_failures": 12, "window_seconds": 1800}'),
  ('distributed_attack',
   'Failed logins against one account from many different IPs in a short window',
   'high', '{"min_ips": 6, "window_seconds": 300}')
on conflict (name) do nothing;

-- ---------- Incidents ----------
create table if not exists incidents (
    id          bigint generated always as identity primary key,
    title       text not null,
    category    text not null,
    description text,
    severity    text not null check (severity in ('low', 'medium', 'high', 'critical')),
    status      text not null default 'new'
                check (status in ('new', 'triage', 'investigating', 'resolved', 'false_positive')),
    assignee    uuid references profiles(id),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- ---------- Alerts ----------
create table if not exists alerts (
    id          bigint generated always as identity primary key,
    rule_id     bigint not null references detection_rules(id),
    severity    text not null check (severity in ('low', 'medium', 'high', 'critical')),
    src_ip      inet,
    username    text,
    description text not null,
    created_at  timestamptz not null default now(),
    incident_id bigint references incidents(id)      -- null until grouped
);
create index if not exists idx_alerts_incident on alerts (incident_id);

-- ---------- Incident notes (doubles as audit trail) ----------
create table if not exists incident_notes (
    id          bigint generated always as identity primary key,
    incident_id bigint not null references incidents(id) on delete cascade,
    author      uuid references profiles(id),
    note        text not null,
    created_at  timestamptz not null default now()
);

-- ---------- Row Level Security ----------
-- The Python component uses the service_role key, which bypasses RLS.
-- The React app only ever uses the anon key, so these policies are
-- what actually protects your data. Test them (proposal 3.10: security testing).
alter table profiles        enable row level security;
alter table security_events enable row level security;
alter table detection_rules enable row level security;
alter table incidents       enable row level security;
alter table alerts          enable row level security;
alter table incident_notes  enable row level security;

-- Logged-in users can read everything.
create policy "read profiles"   on profiles        for select to authenticated using (true);
create policy "read events"     on security_events for select to authenticated using (true);
create policy "read rules"      on detection_rules for select to authenticated using (true);
create policy "read incidents"  on incidents       for select to authenticated using (true);
create policy "read alerts"     on alerts          for select to authenticated using (true);
create policy "read notes"      on incident_notes  for select to authenticated using (true);

-- Only admins/analysts can change incidents or add notes. Viewers cannot.
create or replace function can_write() returns boolean
language sql stable security definer set search_path = public as $$
    select exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'analyst'));
$$;

create policy "update incidents" on incidents for update to authenticated
    using (can_write()) with check (can_write());
create policy "add notes" on incident_notes for insert to authenticated
    with check (can_write() and author = auth.uid());