import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useProfiles } from "../lib/useProfiles";
import { downloadCsv } from "../lib/csv";
import { localDateKey } from "../lib/format";
import { SEVERITIES, STATUSES, STATUS_LABEL } from "../types";
import type { AlertRow, Incident, Note } from "../types";

type ActivityRow = Note & { incidents: { title: string } | null };

interface ReportData {
  from: string;
  to: string;
  generatedAt: Date;
  generatedBy: string;
  incidents: Incident[];
  alerts: AlertRow[];
  events: { total: number; failures: number; successes: number };
  topCountries: [string, number][];
  activity: ActivityRow[];
}

// Change this line when SENTRIX is connected to real log sources.
const DATA_NOTE = "All events in this report are simulated for demonstration. No real network is being monitored.";

function tally<T>(items: T[], key: (item: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

async function failedByCountry(fromIso: string, toIso: string): Promise<[string, number][]> {
  const counts = new Map<string, number>();
  for (let page = 0; page < 30; page++) {
    const { data, error } = await supabase
      .from("security_events").select("country")
      .eq("event_type", "login_failure").gte("occurred_at", fromIso).lte("occurred_at", toIso)
      .order("id").range(page * 1000, page * 1000 + 999);
    if (error || !data) break;
    for (const r of data as { country: string }[]) counts.set(r.country, (counts.get(r.country) ?? 0) + 1);
    if (data.length < 1000) break;
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 break-inside-avoid">
      <h2 className="mb-3 border-b border-slate-800 pb-1 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function CountTable({ rows, label, total }: { rows: [string, number][]; label: string; total: number }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-slate-400">
        <tr><th className="pb-1">{label}</th><th className="pb-1">Count</th><th className="pb-1">Share</th></tr>
      </thead>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-t border-slate-800">
            <td className="py-1 capitalize">{k}</td>
            <td className="py-1">{v}</td>
            <td className="py-1 text-slate-500">{total ? Math.round((v / total) * 100) : 0}%</td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={3} className="py-2 text-slate-500">None in this period.</td></tr>}
      </tbody>
    </table>
  );
}

export default function Reports() {
  const { session } = useAuth();
  const { nameOf } = useProfiles();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default the range to the span of the data
  useEffect(() => {
    Promise.all([
      supabase.from("incidents").select("created_at").order("created_at", { ascending: true }).limit(1),
      supabase.from("incidents").select("created_at").order("created_at", { ascending: false }).limit(1),
    ]).then(([first, last]) => {
      const a = (first.data as { created_at: string }[] | null)?.[0]?.created_at;
      const b = (last.data as { created_at: string }[] | null)?.[0]?.created_at;
      const today = localDateKey(new Date());
      setFrom(a ? localDateKey(new Date(a)) : today);
      setTo(b ? localDateKey(new Date(b)) : today);
    });
  }, []);

  const lastDays = (n: number) => {
    if (!to) return;
    const end = new Date(`${to}T00:00:00`);
    setFrom(localDateKey(new Date(end.getFullYear(), end.getMonth(), end.getDate() - (n - 1))));
  };

  async function generate() {
    if (!from || !to || from > to) {
      setError("Choose a valid date range (the start must not be after the end).");
      return;
    }
    setBusy(true);
    setError(null);
    const fromIso = new Date(`${from}T00:00:00`).toISOString();
    const toIso = new Date(`${to}T23:59:59.999`).toISOString();

    const eventCount = (type?: string) => {
      let q = supabase.from("security_events").select("*", { count: "exact", head: true })
        .gte("occurred_at", fromIso).lte("occurred_at", toIso);
      if (type) q = q.eq("event_type", type);
      return q;
    };

    const [inc, al, total, fails, oks, notes, countries] = await Promise.all([
      supabase.from("incidents").select("*").gte("created_at", fromIso).lte("created_at", toIso).order("created_at"),
      supabase.from("alerts").select("*, detection_rules(name)").gte("created_at", fromIso).lte("created_at", toIso).order("created_at"),
      eventCount(), eventCount("login_failure"), eventCount("login_success"),
      supabase.from("incident_notes").select("*, incidents(title)").gte("created_at", fromIso).lte("created_at", toIso).order("created_at", { ascending: false }),
      failedByCountry(fromIso, toIso),
    ]);

    const firstError = inc.error ?? al.error ?? total.error ?? fails.error ?? oks.error ?? notes.error;
    if (firstError) {
      setError(firstError.message);
    } else {
      setReport({
        from, to,
        generatedAt: new Date(),
        generatedBy: session?.user.email ?? "unknown",
        incidents: (inc.data ?? []) as Incident[],
        alerts: (al.data ?? []) as unknown as AlertRow[],
        events: { total: total.count ?? 0, failures: fails.count ?? 0, successes: oks.count ?? 0 },
        topCountries: countries.slice(0, 8),
        activity: (notes.data ?? []) as unknown as ActivityRow[],
      });
    }
    setBusy(false);
  }

  const derived = useMemo(() => {
    if (!report) return null;
    const r = report;
    const ips = new Map<string, { alerts: number; incidents: Set<number> }>();
    for (const a of r.alerts) {
      if (!a.src_ip) continue;
      const row = ips.get(a.src_ip) ?? { alerts: 0, incidents: new Set<number>() };
      row.alerts++;
      if (a.incident_id !== null) row.incidents.add(a.incident_id);
      ips.set(a.src_ip, row);
    }
    const resolved = r.incidents.filter((i) => i.status === "resolved").length;
    return {
      bySeverity: SEVERITIES.map((s) => [s, r.incidents.filter((i) => i.severity === s).length] as [string, number]),
      byStatus: STATUSES.map((s) => [STATUS_LABEL[s], r.incidents.filter((i) => i.status === s).length] as [string, number]),
      byCategory: tally(r.incidents, (i) => i.category),
      byRule: tally(r.alerts, (a) => a.detection_rules?.name ?? `rule ${a.rule_id}`),
      topIps: [...ips.entries()]
        .map(([ip, v]) => ({ ip, alerts: v.alerts, incidents: v.incidents.size }))
        .sort((a, b) => b.incidents - a.incidents || b.alerts - a.alerts).slice(0, 8),
      resolved,
      open: r.incidents.length - resolved - r.incidents.filter((i) => i.status === "false_positive").length,
      byAnalyst: tally(r.activity, (n) => (n.author ? nameOf(n.author) : "System")),
    };
  }, [report, nameOf]);

  const fmt = (d: Date) => d.toLocaleString();
  const field = "rounded bg-slate-800 px-3 py-2 text-sm";

  return (
    <div className="max-w-5xl">
      <div className="no-print">
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="mb-6 text-sm text-slate-400">Generate a summary of detected activity and analyst work for a period.</p>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-400">From
            <input type="date" className={`${field} mt-1 block`} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-xs text-slate-400">To
            <input type="date" className={`${field} mt-1 block`} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button onClick={() => lastDays(7)} className="rounded bg-slate-800 px-3 py-2 text-sm transition-colors hover:bg-slate-700">Last 7 days of data</button>
          <button onClick={() => lastDays(30)} className="rounded bg-slate-800 px-3 py-2 text-sm transition-colors hover:bg-slate-700">Last 30 days of data</button>
          <button onClick={generate} disabled={busy}
            className="rounded bg-cyan-600 px-4 py-2 text-sm font-medium transition-colors hover:bg-cyan-500 disabled:opacity-50">
            {busy ? "Generating..." : "Generate report"}
          </button>
        </div>
        {error && <p className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

        {report && (
          <div className="mb-6 flex flex-wrap gap-2">
            <button onClick={() => window.print()}
              className="rounded bg-slate-800 px-3 py-2 text-sm transition-colors hover:bg-slate-700">
              Print or save as PDF
            </button>
            <button
              onClick={() => downloadCsv(`sentrix-incidents-${report.from}_to_${report.to}.csv`,
                report.incidents.map((i) => ({
                  id: i.id, detected: i.created_at, severity: i.severity, status: i.status,
                  category: i.category, title: i.title, assigned_to: i.assignee ? nameOf(i.assignee) : "",
                })))}
              className="rounded bg-slate-800 px-3 py-2 text-sm transition-colors hover:bg-slate-700">
              Download incidents (CSV)
            </button>
            <button
              onClick={() => downloadCsv(`sentrix-alerts-${report.from}_to_${report.to}.csv`,
                report.alerts.map((a) => ({
                  id: a.id, time: a.created_at, rule: a.detection_rules?.name ?? a.rule_id,
                  severity: a.severity, source_ip: a.src_ip ?? "", username: a.username ?? "",
                  incident_id: a.incident_id ?? "", description: a.description,
                })))}
              className="rounded bg-slate-800 px-3 py-2 text-sm transition-colors hover:bg-slate-700">
              Download alerts (CSV)
            </button>
          </div>
        )}
      </div>

      {report && derived && (
        // The sheet is always light, like paper, whatever theme the app is using
        <article className="print-area keep-light rounded-xl bg-slate-900 p-8 text-slate-100 shadow">
          <header className="border-b border-slate-800 pb-4">
            <p className="text-xs tracking-[0.3em] text-slate-500">SENTRIX</p>
            <h1 className="text-2xl font-bold">Security Operations Report</h1>
            <p className="mt-1 text-sm text-slate-400">Period: {report.from} to {report.to}</p>
            <p className="text-xs text-slate-500">Generated {fmt(report.generatedAt)} by {report.generatedBy}</p>
            <p className="mt-2 rounded bg-slate-950 p-2 text-xs text-slate-400">{DATA_NOTE}</p>
          </header>

          <Section title="Summary">
            <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
              {[
                ["Events analysed", report.events.total],
                ["Failed logins", report.events.failures],
                ["Alerts raised", report.alerts.length],
                ["Incidents", report.incidents.length],
                ["Resolved", derived.resolved],
              ].map(([k, v]) => (
                <div key={String(k)} className="rounded-lg bg-slate-950 p-3">
                  <p className="text-2xl font-bold">{Number(v).toLocaleString()}</p>
                  <p className="text-xs text-slate-500">{k}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-400">
              {derived.open} incident{derived.open === 1 ? " is" : "s are"} still open.
              Failed logins were {report.events.total ? Math.round((report.events.failures / report.events.total) * 100) : 0}% of all
              login events in this period.
            </p>
          </Section>

          <Section title="Incidents by severity"><CountTable rows={derived.bySeverity} label="Severity" total={report.incidents.length} /></Section>
          <Section title="Incidents by status"><CountTable rows={derived.byStatus} label="Status" total={report.incidents.length} /></Section>
          <Section title="Attack categories"><CountTable rows={derived.byCategory} label="Category" total={report.incidents.length} /></Section>
          <Section title="Alerts by detection rule"><CountTable rows={derived.byRule} label="Rule" total={report.alerts.length} /></Section>

          <Section title="Top source IP addresses">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-400"><tr><th className="pb-1">IP address</th><th className="pb-1">Incidents</th><th className="pb-1">Alerts</th></tr></thead>
              <tbody>
                {derived.topIps.map((r) => (
                  <tr key={r.ip} className="border-t border-slate-800">
                    <td className="py-1 font-mono text-xs">{r.ip}</td><td className="py-1">{r.incidents}</td><td className="py-1">{r.alerts}</td>
                  </tr>
                ))}
                {derived.topIps.length === 0 && <tr><td colSpan={3} className="py-2 text-slate-500">None in this period.</td></tr>}
              </tbody>
            </table>
          </Section>

          <Section title="Failed logins by country">
            <CountTable rows={report.topCountries} label="Country" total={report.events.failures} />
          </Section>

          <Section title="Analyst activity">
            <p className="mb-2 text-sm text-slate-400">
              {report.activity.length} recorded action{report.activity.length === 1 ? "" : "s"}
              {derived.byAnalyst.length > 0 && ": " + derived.byAnalyst.map(([n, c]) => `${n} (${c})`).join(", ")}
            </p>
            <table className="w-full text-left text-sm">
              <thead className="text-slate-400"><tr><th className="pb-1">Time</th><th className="pb-1">Who</th><th className="pb-1">Incident</th><th className="pb-1">Action or note</th></tr></thead>
              <tbody>
                {report.activity.slice(0, 40).map((n) => (
                  <tr key={n.id} className="border-t border-slate-800 align-top">
                    <td className="whitespace-nowrap py-1 pr-2 text-slate-500">{fmt(new Date(n.created_at))}</td>
                    <td className="py-1 pr-2">{n.author ? nameOf(n.author) : "System"}</td>
                    <td className="py-1 pr-2">{n.incidents?.title ?? `#${n.incident_id}`}</td>
                    <td className="py-1">{n.note}</td>
                  </tr>
                ))}
                {report.activity.length === 0 && <tr><td colSpan={4} className="py-2 text-slate-500">No analyst activity in this period.</td></tr>}
              </tbody>
            </table>
            {report.activity.length > 40 && <p className="mt-1 text-xs text-slate-500">Showing the latest 40 of {report.activity.length}.</p>}
          </Section>
        </article>
      )}
    </div>
  );
}