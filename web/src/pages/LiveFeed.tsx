import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useSettings } from "../lib/settings";
import { useNotify } from "../lib/notifications";
import { formatDateTime, localDateKey, shortDay } from "../lib/format";
import { SeverityBadge } from "../components/Badges";
import type { SecurityEvent, Severity } from "../types";

interface LiveAlert {
  id: number;
  severity: Severity;
  description: string;
  created_at: string;
  incident_id: number | null;
  detection_rules: { name: string } | null;
}

type FeedItem =
  | { kind: "event"; key: string; event: SecurityEvent }
  | { kind: "alert"; key: string; alert: LiveAlert };

const MAX_ROWS = 150;
const SPEEDS = [0.5, 1, 2, 5];

async function fetchAllEvents(): Promise<SecurityEvent[]> {
  const out: SecurityEvent[] = [];
  for (let page = 0; page < 10; page++) {
    const { data, error } = await supabase
      .from("security_events").select("*")
      .order("occurred_at").order("id")
      .range(page * 1000, page * 1000 + 999);
    if (error || !data) throw new Error(error?.message ?? "No data returned");
    out.push(...(data as SecurityEvent[]));
    if (data.length < 1000) break;
  }
  return out;
}

export default function LiveFeed() {
  const { severityColors } = useSettings();
  const { notify } = useNotify();

  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [alertNotices, setAlertNotices] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [stats, setStats] = useState({ events: 0, failures: 0, alerts: 0, clock: null as string | null, done: 0 });

  const [outcome, setOutcome] = useState<"all" | "login_failure" | "login_success">("all");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [search, setSearch] = useState("");

  // Values the replay loop reads without restarting every time they change
  const eventsRef = useRef<SecurityEvent[]>([]);
  const alertsRef = useRef<LiveAlert[]>([]);
  const speedRef = useRef(1);
  const noticesRef = useRef(true);
  const idx = useRef(0);
  const alertIdx = useRef(0);

  useEffect(() => {
    speedRef.current = speed;
    noticesRef.current = alertNotices;
  }, [speed, alertNotices]);

  useEffect(() => {
    Promise.all([
      fetchAllEvents(),
      supabase.from("alerts").select("id, severity, description, created_at, incident_id, detection_rules(name)").order("created_at"),
    ])
      .then(([evs, al]) => {
        if (al.error) throw new Error(al.error.message);
        eventsRef.current = evs;
        alertsRef.current = (al.data ?? []) as unknown as LiveAlert[];
        setEvents(evs);
        setAlerts(alertsRef.current);
        if (evs.length) setStartDate(localDateKey(new Date(evs[0].occurred_at)));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // The replay loop. Each event is shown, then the next one is scheduled using the real
  // gap between them (squeezed): attack bursts rush past, quiet stretches pause briefly.
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let handle: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (cancelled) return;
      const evs = eventsRef.current;
      const e = evs[idx.current];
      if (!e) {
        setRunning(false);
        return;
      }
      idx.current += 1;
      const done = idx.current;

      // Show any alerts raised at or before this event, directly above it
      const items: FeedItem[] = [{ kind: "event", key: `e${e.id}`, event: e }];
      let fired = 0;
      const eventTime = new Date(e.occurred_at).getTime();
      while (alertIdx.current < alertsRef.current.length &&
             new Date(alertsRef.current[alertIdx.current].created_at).getTime() <= eventTime) {
        const a = alertsRef.current[alertIdx.current];
        alertIdx.current += 1;
        fired += 1;
        items.unshift({ kind: "alert", key: `a${a.id}`, alert: a });
        if (noticesRef.current) {
          notify({
            severity: a.severity,
            title: `${a.severity.toUpperCase()} alert: ${a.detection_rules?.name ?? "detection"}`,
            body: a.description,
          });
        }
      }

      setFeed((f) => [...items, ...f].slice(0, MAX_ROWS));
      setStats((s) => ({
        events: s.events + 1,
        failures: s.failures + (e.event_type === "login_failure" ? 1 : 0),
        alerts: s.alerts + fired,
        clock: e.occurred_at,
        done,
      }));

      const next = evs[idx.current];
      if (!next) {
        setRunning(false);
        return;
      }
      const gap = new Date(next.occurred_at).getTime() - eventTime;
      const delay = Math.max(30, Math.min(900, gap / 20) / speedRef.current);
      handle = setTimeout(tick, delay);
    };

    handle = setTimeout(tick, 0);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [running, notify]);

  const restart = useCallback((fromDate?: string) => {
    const evs = eventsRef.current;
    let start = 0;
    if (fromDate) {
      const i = evs.findIndex((e) => localDateKey(new Date(e.occurred_at)) >= fromDate);
      start = i === -1 ? 0 : i;
    }
    idx.current = start;
    const t0 = evs[start] ? new Date(evs[start].occurred_at).getTime() : 0;
    alertIdx.current = alertsRef.current.filter((a) => new Date(a.created_at).getTime() < t0).length;
    setFeed([]);
    setStats({ events: 0, failures: 0, alerts: 0, clock: null, done: start });
    setRunning(true);
  }, []);

  const finished = events.length > 0 && stats.done >= events.length && !running;
  const toggle = () => {
    if (running) setRunning(false);
    else if (finished || stats.events === 0) restart(startDate);
    else setRunning(true);
  };

  const q = search.trim().toLowerCase();
  const visible = feed.filter((item) => {
    if (item.kind === "alert") {
      return !q || item.alert.description.toLowerCase().includes(q);
    }
    if (alertsOnly) return false;
    const e = item.event;
    return (outcome === "all" || e.event_type === outcome) &&
      (!q || e.username.toLowerCase().includes(q) || String(e.src_ip).includes(q) || e.country.toLowerCase().includes(q));
  });

  const field = "rounded bg-slate-800 px-3 py-2 text-sm transition-colors hover:bg-slate-700";
  const progress = events.length ? Math.min(100, (stats.done / events.length) * 100) : 0;

  return (
    <div className="max-w-5xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Live feed</h1>
          <p className="text-sm text-slate-400">Watch events arrive and alerts fire as the detection rules catch attacks.</p>
        </div>
        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs tracking-widest text-amber-300">
          SIMULATED REPLAY
        </span>
      </div>
      <p className="mb-4 rounded bg-slate-900 p-3 text-xs text-slate-500">
        This replays the stored demo events in time order, with quiet gaps squeezed out. It is not a live view of any
        real network.
      </p>

      {loading && <p className="text-slate-400">Loading events...</p>}
      {error && <p className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

      {!loading && !error && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <button onClick={toggle}
              className="rounded bg-cyan-600 px-5 py-2 text-sm font-medium transition-colors hover:bg-cyan-500">
              {running ? "Pause" : finished ? "Replay" : stats.events === 0 ? "Start" : "Resume"}
            </button>
            <button onClick={() => restart(startDate)} className={field}>Restart</button>
            <label className="flex items-center gap-2 text-sm text-slate-400">
              Speed
              <select className={field} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                {SPEEDS.map((s) => <option key={s} value={s}>{s}x</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-400">
              Start from
              <input type="date" className={field} value={startDate}
                min={events.length ? localDateKey(new Date(events[0].occurred_at)) : undefined}
                max={events.length ? localDateKey(new Date(events[events.length - 1].occurred_at)) : undefined}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (e.target.value) restart(e.target.value);
                }} />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <input type="checkbox" className="accent-cyan-500" checked={alertNotices}
                onChange={(e) => setAlertNotices(e.target.checked)} />
              Pop-ups and sounds for alerts
            </label>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Events replayed", stats.events.toLocaleString()],
              ["Failed logins", `${stats.failures.toLocaleString()}${stats.events ? ` (${Math.round((stats.failures / stats.events) * 100)}%)` : ""}`],
              ["Alerts raised", String(stats.alerts)],
              ["Replay clock", stats.clock ? formatDateTime(stats.clock) : "not started"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                <p className="text-xs text-slate-500">{k}</p>
                <p className="mt-1 text-sm font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>

          <div className="mb-4 h-1.5 overflow-hidden rounded bg-slate-800" aria-hidden="true">
            <div className="h-full rounded bg-cyan-500 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>

          <div className="mb-3 flex flex-wrap gap-3">
            <input className={`${field} w-56`} placeholder="Filter by user, IP or country" value={search}
              onChange={(e) => setSearch(e.target.value)} />
            <select className={field} value={outcome}
              onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
              <option value="all">All outcomes</option>
              <option value="login_failure">Failed logins</option>
              <option value="login_success">Successful logins</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <input type="checkbox" className="accent-cyan-500" checked={alertsOnly}
                onChange={(e) => setAlertsOnly(e.target.checked)} />
              Alerts only
            </label>
          </div>

          <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-2" aria-live="off">
            {visible.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-500">
                {stats.events === 0 ? 'Press Start to begin the replay.' : "Nothing matches the current filters yet."}
              </p>
            )}
            {visible.map((item) =>
              item.kind === "alert" ? (
                <div key={item.key}
                  className="sx-fadein my-1 flex flex-wrap items-center gap-3 rounded-lg border bg-slate-900 p-3 text-sm"
                  style={{ borderColor: severityColors[item.alert.severity] }}>
                  <SeverityBadge severity={item.alert.severity} />
                  <span className="font-mono text-xs text-cyan-300">{item.alert.detection_rules?.name ?? "alert"}</span>
                  <span className="min-w-0 flex-1 text-slate-300">{item.alert.description}</span>
                  {item.alert.incident_id && (
                    <Link to={`/incidents/${item.alert.incident_id}`} className="text-xs text-cyan-300 hover:underline">
                      Open incident #{item.alert.incident_id}
                    </Link>
                  )}
                </div>
              ) : (
                <div key={item.key}
                  className={`sx-fadein flex flex-wrap items-center gap-x-4 gap-y-0.5 border-l-2 px-3 py-1.5 text-xs ${
                    item.event.event_type === "login_failure" ? "border-red-500/70" : "border-emerald-500/70"
                  }`}>
                  <span className="w-36 shrink-0 text-slate-500">{formatDateTime(item.event.occurred_at)}</span>
                  <span className="w-24 shrink-0">{item.event.username}</span>
                  <span className="w-32 shrink-0 font-mono text-cyan-300">{String(item.event.src_ip).split("/")[0]}</span>
                  <span className="w-8 shrink-0">{item.event.country}</span>
                  <span className={item.event.event_type === "login_failure" ? "text-red-400" : "text-emerald-400"}>
                    {item.event.event_type === "login_failure" ? "Failed" : "Success"}
                  </span>
                </div>
              ),
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Showing the latest {MAX_ROWS} rows. Replay clock starts at {events.length ? shortDay(localDateKey(new Date(events[0].occurred_at))) : "-"}.
            {alerts.length ? ` ${alerts.length} alerts will fire during the full replay.` : ""}
          </p>
        </>
      )}
    </div>
  );
}