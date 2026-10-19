import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { SEVERITIES, STATUSES, STATUS_LABEL } from "../types";
import type { Incident, Severity } from "../types";
import { SeverityBadge, StatusBadge } from "../components/Badges";
import { formatDate } from "../lib/format";

interface AlertLite {
  src_ip: string | null;
  incident_id: number | null;
}

const SEVERITY_BAR: Record<Severity, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-400",
  low: "bg-slate-500",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

function StatCard({ label, value, tone = "text-slate-100" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tone}`}>{value.toLocaleString()}</p>
    </div>
  );
}

export default function Dashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [alerts, setAlerts] = useState<AlertLite[]>([]);
  const [eventCount, setEventCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("incidents").select("*").order("created_at", { ascending: false }),
      supabase.from("alerts").select("src_ip, incident_id"),
      supabase.from("security_events").select("*", { count: "exact", head: true }),
    ]).then(([inc, al, ev]) => {
      const err = inc.error ?? al.error ?? ev.error;
      if (err) setError(err.message);
      setIncidents((inc.data ?? []) as Incident[]);
      setAlerts((al.data ?? []) as AlertLite[]);
      setEventCount(ev.count ?? 0);
      setLoading(false);
    });
  }, []);

  const stats = useMemo(() => {
    const open = incidents.filter((i) => i.status !== "resolved" && i.status !== "false_positive");
    const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
    const byStatus: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const i of incidents) {
      bySeverity[i.severity]++;
      byStatus[i.status]++;
    }

    // Repeat offenders: source IPs ranked by how many separate incidents they caused.
    const ips = new Map<string, { alerts: number; incidents: Set<number> }>();
    for (const a of alerts) {
      if (!a.src_ip) continue;
      const row = ips.get(a.src_ip) ?? { alerts: 0, incidents: new Set<number>() };
      row.alerts++;
      if (a.incident_id !== null) row.incidents.add(a.incident_id);
      ips.set(a.src_ip, row);
    }
    const topIps = [...ips.entries()]
      .map(([ip, r]) => ({ ip, alerts: r.alerts, incidents: r.incidents.size }))
      .sort((a, b) => b.incidents - a.incidents || b.alerts - a.alerts)
      .slice(0, 5);

    // Incidents per day over the 30 days ending at the most recent incident.
    const latest = incidents.length ? new Date(incidents[0].created_at) : new Date();
    const counts = new Map<string, number>();
    for (const i of incidents) {
      const k = dayKey(new Date(i.created_at));
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const timeline = Array.from({ length: 30 }, (_, n) => {
      const day = new Date(latest.getTime() - (29 - n) * DAY_MS);
      const key = dayKey(day);
      return { key, count: counts.get(key) ?? 0 };
    });

    return {
      open: open.length,
      openCritical: open.filter((i) => i.severity === "critical").length,
      bySeverity, byStatus, topIps, timeline,
      maxPerDay: Math.max(1, ...timeline.map((t) => t.count)),
    };
  }, [incidents, alerts]);

  const shortDate = (key: string) =>
    new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

  if (loading) return <p className="text-slate-400">Loading...</p>;

  const total = Math.max(1, incidents.length);

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mb-6 text-sm text-slate-400">Overview of detected security activity</p>
      {error && <p className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Events analysed" value={eventCount} />
        <StatCard label="Alerts raised" value={alerts.length} />
        <StatCard label="Incidents" value={incidents.length} />
        <StatCard label="Open incidents" value={stats.open} tone="text-cyan-300" />
        <StatCard label="Open critical" value={stats.openCritical} tone="text-red-400" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 font-medium">Incidents by severity</h2>
          <div className="space-y-3">
            {SEVERITIES.map((s) => (
              <Link key={s} to={`/incidents?severity=${s}`} className="block rounded p-1 hover:bg-slate-800">
                <div className="mb-1 flex justify-between text-sm">
                  <span className="capitalize">{s}</span>
                  <span className="text-slate-400">{stats.bySeverity[s]}</span>
                </div>
                <div className="h-2 rounded bg-slate-800">
                  <div className={`h-2 rounded ${SEVERITY_BAR[s]}`}
                    style={{ width: `${(stats.bySeverity[s] / total) * 100}%` }} />
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 font-medium">Incidents by status</h2>
          <div className="space-y-3">
            {STATUSES.map((s) => (
              <Link key={s} to={`/incidents?status=${s}`} className="block rounded p-1 hover:bg-slate-800">
                <div className="mb-1 flex justify-between text-sm">
                  <span>{STATUS_LABEL[s]}</span>
                  <span className="text-slate-400">{stats.byStatus[s]}</span>
                </div>
                <div className="h-2 rounded bg-slate-800">
                  <div className="h-2 rounded bg-cyan-500"
                    style={{ width: `${(stats.byStatus[s] / total) * 100}%` }} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 font-medium">Incidents per day (last 30 days)</h2>
        <div className="flex h-32 items-end gap-1">
          {stats.timeline.map((t) => (
            <div key={t.key} className="flex h-full flex-1 items-end"
              title={`${shortDate(t.key)}: ${t.count} incident${t.count === 1 ? "" : "s"}`}>
              <div className={`w-full rounded-t ${t.count ? "bg-cyan-500 hover:bg-cyan-400" : "bg-slate-800"}`}
                style={{ height: `${t.count ? (t.count / stats.maxPerDay) * 100 : 3}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate-500">
          <span>{shortDate(stats.timeline[0].key)}</span>
          <span>{shortDate(stats.timeline[29].key)}</span>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-1 font-medium">Repeat offenders</h2>
          <p className="mb-4 text-xs text-slate-500">Source IPs behind the most incidents</p>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400">
              <tr><th className="pb-2">IP address</th><th className="pb-2">Incidents</th><th className="pb-2">Alerts</th></tr>
            </thead>
            <tbody>
              {stats.topIps.map((r) => (
                <tr key={r.ip} className="border-t border-slate-800">
                  <td className="py-2 font-mono text-xs text-cyan-300">{r.ip}</td>
                  <td className="py-2">{r.incidents}</td>
                  <td className="py-2 text-slate-400">{r.alerts}</td>
                </tr>
              ))}
              {stats.topIps.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-slate-500">No data yet.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 font-medium">Most recent incidents</h2>
          <ul className="space-y-3">
            {incidents.slice(0, 5).map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to={`/incidents/${i.id}`} className="block truncate text-sm text-cyan-300 hover:underline">
                    {i.title}
                  </Link>
                  <span className="text-xs text-slate-500">{formatDate(i.created_at)}</span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <SeverityBadge severity={i.severity} />
                  <StatusBadge status={i.status} />
                </div>
              </li>
            ))}
            {incidents.length === 0 && <li className="text-sm text-slate-500">No incidents yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
