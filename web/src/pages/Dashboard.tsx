import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useSettings } from "../lib/settings";
import type { WidgetId } from "../lib/settings";
import { useCountUp } from "../lib/useCountUp";
import { SEVERITIES, STATUSES, STATUS_LABEL } from "../types";
import type { Incident } from "../types";
import { SeverityBadge, StatusBadge } from "../components/Badges";
import { CategoricalChart, TimelineChart } from "../components/charts";
import type { Datum } from "../components/charts";
import { formatDate, localDateKey } from "../lib/format";

interface AlertLite {
  src_ip: string | null;
  incident_id: number | null;
}

function Card({ title, subtitle, children, wide }: { title: string; subtitle?: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`rounded-xl border border-slate-800 bg-slate-900 p-5 ${wide ? "lg:col-span-2" : ""}`}>
      <h2 className="font-medium">{title}</h2>
      {subtitle && <p className="mb-4 text-xs text-slate-500">{subtitle}</p>}
      <div className={subtitle ? "" : "mt-4"}>{children}</div>
    </section>
  );
}

function Kpi({ label, value, to, tone = "" }: { label: string; value: number; to: string; tone?: string }) {
  const shown = useCountUp(value);
  return (
    <Link
      to={to}
      className="group rounded-xl border border-slate-800 bg-slate-900 p-5 transition-all hover:-translate-y-0.5 hover:border-cyan-500/50"
    >
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${tone}`}>{shown.toLocaleString()}</p>
      <p className="mt-1 text-xs text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">View records &rarr;</p>
    </Link>
  );
}

export default function Dashboard() {
  const { settings, severityColors, categoryColors } = useSettings();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [alerts, setAlerts] = useState<AlertLite[]>([]);
  const [eventCount, setEventCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(() => {
    Promise.all([
      supabase.from("incidents").select("*").order("created_at", { ascending: false }),
      supabase.from("alerts").select("src_ip, incident_id"),
      supabase.from("security_events").select("*", { count: "exact", head: true }),
    ]).then(([inc, al, ev]) => {
      const err = inc.error ?? al.error ?? ev.error;
      setError(err ? err.message : null);
      setIncidents((inc.data ?? []) as Incident[]);
      setAlerts((al.data ?? []) as AlertLite[]);
      setEventCount(ev.count ?? 0);
      setUpdatedAt(new Date());
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Auto refresh, as chosen in Settings
  useEffect(() => {
    if (settings.refresh === "30s" || settings.refresh === "5m") {
      const id = setInterval(load, settings.refresh === "30s" ? 30_000 : 300_000);
      return () => clearInterval(id);
    }
    if (settings.refresh === "realtime") {
      const channel = supabase
        .channel("dashboard-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, load)
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
    return undefined;
  }, [settings.refresh, load]);

  const stats = useMemo(() => {
    const isOpen = (i: Incident) => i.status !== "resolved" && i.status !== "false_positive";
    const open = incidents.filter(isOpen);

    const bySeverity: Record<string, number> = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
    const byStatus: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    const byCategory = new Map<string, number>();
    for (const i of incidents) {
      bySeverity[i.severity]++;
      byStatus[i.status]++;
      byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + 1);
    }
    const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

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

    // Incidents per LOCAL day over the 30 days ending at the most recent incident.
    const latest = incidents.length ? new Date(incidents[0].created_at) : new Date();
    const perDay = new Map<string, number>();
    for (const i of incidents) {
      const k = localDateKey(new Date(i.created_at));
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
    }
    const timeline = Array.from({ length: 30 }, (_, n) => {
      const key = localDateKey(new Date(latest.getFullYear(), latest.getMonth(), latest.getDate() - (29 - n)));
      return { key, count: perDay.get(key) ?? 0 };
    });

    return {
      open: open.length,
      openCritical: open.filter((i) => i.severity === "critical").length,
      resolved: byStatus["resolved"],
      bySeverity, byStatus, categories, topIps, timeline,
      maxPerDay: Math.max(1, ...timeline.map((t) => t.count)),
    };
  }, [incidents, alerts]);

  const total = Math.max(1, incidents.length);
  const catColor = (idx: number) => categoryColors[idx % categoryColors.length];

  // The same chart component renders all three, in whichever style is set in Settings
  const categoryData: Datum[] = stats.categories.map(([label, value], i) => ({
    label, value, color: catColor(i), href: `/incidents?category=${encodeURIComponent(label)}`,
  }));
  const severityData: Datum[] = SEVERITIES.map((s) => ({
    label: s.charAt(0).toUpperCase() + s.slice(1), value: stats.bySeverity[s],
    color: severityColors[s], href: `/incidents?severity=${s}`,
  }));
  const statusData: Datum[] = STATUSES.map((s, i) => ({
    label: STATUS_LABEL[s], value: stats.byStatus[s], color: catColor(i), href: `/incidents?status=${s}`,
  }));

  const widgets: Record<WidgetId, ReactNode> = {
    kpis: (
      <div key="kpis" className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-5">
        <Kpi label="Events analysed" value={eventCount} to="/events" />
        <Kpi label="Alerts raised" value={alerts.length} to="/alerts" />
        <Kpi label="Open incidents" value={stats.open} to="/incidents?open=1" tone="text-cyan-300" />
        <Kpi label="Open critical" value={stats.openCritical} to="/incidents?open=1&severity=critical" tone="text-red-400" />
        <Kpi label="Resolved cases" value={stats.resolved} to="/incidents?status=resolved" tone="text-emerald-400" />
      </div>
    ),

    categories: (
      <Card key="categories" title="Attack categories" subtitle="What kinds of attacks were detected. Click to filter the incident list.">
        <CategoricalChart data={categoryData} style={settings.chartStyle} centerLabel="incidents" total={total} />
      </Card>
    ),

    severity: (
      <Card key="severity" title="Incidents by severity" subtitle="Click a bar, slice or point to see those incidents.">
        <CategoricalChart data={severityData} style={settings.chartStyle} centerLabel="incidents" total={total} />
      </Card>
    ),

    status: (
      <Card key="status" title="Open versus resolved" subtitle="Where each incident stands in the workflow.">
        <CategoricalChart data={statusData} style={settings.chartStyle} centerLabel="incidents" total={total} />
      </Card>
    ),

    timeline: (
      <Card key="timeline" wide title="Incidents per day (last 30 days)" subtitle="Click a bar, point or slice to see those incidents.">
        <TimelineChart days={stats.timeline} style={settings.chartStyle} palette={categoryColors} />
      </Card>
    ),

    offenders: (
      <Card key="offenders" title="Repeat offenders" subtitle="Source IPs behind the most incidents">
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
      </Card>
    ),

    recent: (
      <Card key="recent" title="Most recent incidents">
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
      </Card>
    ),
  };

  if (loading) return <p className="text-slate-400">Loading...</p>;

  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-400">Overview of detected security activity (simulated data)</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {updatedAt && <span>Updated {updatedAt.toLocaleTimeString()}</span>}
          <button onClick={load}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-slate-700">
            Refresh
          </button>
        </div>
      </div>
      {error && <p className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        {settings.widgets.filter((w) => w.visible).map((w) => widgets[w.id])}
      </div>
      {settings.widgets.every((w) => !w.visible) && (
        <p className="text-sm text-slate-500">All widgets are hidden. Turn some on in Settings.</p>
      )}
    </div>
  );
}