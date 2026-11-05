import { Fragment, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useSettings } from "../lib/settings";
import { SeverityBadge } from "./Badges";
import { formatDateTime, formatTime } from "../lib/format";
import type { AlertRow, Incident, SecurityEvent } from "../types";

const LIMIT = 60; // the most recent events shown per alert

function fmtWindow(seconds: number): string {
  if (seconds % 60 === 0) {
    const m = seconds / 60;
    return `${m} minute${m === 1 ? "" : "s"}`;
  }
  return `${seconds} seconds`;
}

// Plain-English version of a rule, built from the thresholds stored in the database
function describeRule(a: AlertRow): string {
  const r = a.detection_rules;
  const p = r?.params ?? {};
  const win = p.window_seconds ? fmtWindow(p.window_seconds) : "a short time";
  switch (r?.name) {
    case "brute_force":
      return `Fires when ${p.min_failures ?? "many"} or more failed logins hit one account from one IP address within ${win}.`;
    case "slow_brute_force":
      return `Fires when ${p.min_failures ?? "many"} or more failed logins hit one account from one IP address within ${win}, even if they are spread out. It catches slow, patient attackers.`;
    case "credential_stuffing":
      return `Fires when one IP address fails against ${p.min_usernames ?? "many"} or more different usernames within ${win}.`;
    case "distributed_attack":
      return `Fires when one account is hit by failed logins from ${p.min_ips ?? "many"} or more different IP addresses within ${win}.`;
    case "success_after_failures":
      return `Fires when a login succeeds right after ${p.min_failures ?? "several"} or more failures within ${win}. The attacker may have got in.`;
    case "unusual_country":
      return "Fires when a login succeeds from a country the user does not normally sign in from.";
    default:
      return r?.description ?? "Detection rule";
  }
}

// The time span the rule looked at, ending at the moment the alert fired
function evidenceWindow(a: AlertRow): { start: Date; end: Date } {
  const end = new Date(a.created_at);
  const seconds =
    a.detection_rules?.name === "unusual_country" ? 1 : Number(a.detection_rules?.params?.window_seconds ?? 120);
  return { start: new Date(end.getTime() - seconds * 1000), end };
}

function Arrow() {
  return <span className="text-slate-600" aria-hidden="true">&rarr;</span>;
}

function EvidenceStrip({ events, start, end }: { events: SecurityEvent[]; start: Date; end: Date }) {
  const span = Math.max(1, end.getTime() - start.getTime());
  return (
    <svg viewBox="0 0 300 36" className="w-full" role="img" aria-label="Events on a time axis, ending at the alert">
      <line x1="4" y1="22" x2="296" y2="22" stroke="currentColor" className="text-slate-700" strokeWidth="1" />
      {events.map((e) => {
        const x = 4 + ((new Date(e.occurred_at).getTime() - start.getTime()) / span) * 292;
        return (
          <rect key={e.id} x={x - 1.2} y="7" width="2.4" height="14" rx="1"
            fill={e.event_type === "login_failure" ? "#ef4444" : "#34d399"}>
            <title>{`${formatTime(e.occurred_at)}  ${e.event_type === "login_failure" ? "failed" : "success"}`}</title>
          </rect>
        );
      })}
      <line x1="296" y1="2" x2="296" y2="26" stroke="#fbbf24" strokeWidth="2" />
      <text x="4" y="34" className="fill-slate-500 text-[7px]">{formatTime(start.toISOString())}</text>
      <text x="296" y="34" textAnchor="end" className="fill-slate-500 text-[7px]">{formatTime(end.toISOString())} alert fired</text>
    </svg>
  );
}

function AlertFlow({ alert, incident, defaultOpen }: { alert: AlertRow; incident: Incident; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawId, setRawId] = useState<number | null>(null);
  const ruleName = alert.detection_rules?.name ?? `rule ${alert.rule_id}`;
  const { start, end } = evidenceWindow(alert);

  // Rebuild the evidence: the events this rule examined, ending at the alert time.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      const name = alert.detection_rules?.name;
      const w = evidenceWindow(alert);
      let q = supabase
        .from("security_events")
        .select("*", { count: "exact" })
        .gte("occurred_at", w.start.toISOString())
        .lte("occurred_at", w.end.toISOString())
        .order("occurred_at", { ascending: false });
      if (alert.src_ip && name !== "distributed_attack") q = q.eq("src_ip", alert.src_ip);
      if (alert.username && name !== "credential_stuffing") q = q.eq("username", alert.username);
      if (name !== "success_after_failures" && name !== "unusual_country") q = q.eq("event_type", "login_failure");
      const { data, count, error } = await q.limit(LIMIT);
      if (cancelled) return;
      if (error) setError(error.message);
      else {
        setEvents(((data ?? []) as SecurityEvent[]).reverse()); // oldest first for reading
        setTotal(count ?? 0);
      }
      setLoading(false);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [alert]);

  const triggerTime = end.getTime();

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-left transition-colors hover:bg-cyan-500/20"
        >
          <span className="block text-[10px] uppercase tracking-widest text-slate-500">1. Events</span>
          <span className="font-medium text-cyan-300">
            {loading ? "loading..." : `${total} login event${total === 1 ? "" : "s"}`} {open ? "\u25B4" : "\u25BE"}
          </span>
        </button>
        <Arrow />
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
          <span className="block text-[10px] uppercase tracking-widest text-slate-500">2. Rule matched</span>
          <span className="font-mono text-slate-100">{ruleName}</span>
        </div>
        <Arrow />
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
          <span className="block text-[10px] uppercase tracking-widest text-slate-500">3. Alert</span>
          <SeverityBadge severity={alert.severity} />
        </div>
        <Arrow />
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
          <span className="block text-[10px] uppercase tracking-widest text-slate-500">4. Incident</span>
          <span className="text-slate-100">#{incident.id}</span>
        </div>
      </div>

      <p className="mt-3 text-sm">{alert.description}</p>
      <p className="mt-1 text-xs text-slate-500">{describeRule(alert)}</p>

      {open && (
        <div className="sx-fadein mt-4">
          {error && <p className="rounded bg-red-500/10 p-2 text-sm text-red-300">{error}</p>}
          {!error && !loading && events.length === 0 && (
            <p className="text-sm text-slate-500">No matching events were found for this alert.</p>
          )}
          {events.length > 0 && (
            <>
              <EvidenceStrip events={events} start={start} end={end} />
              <p className="mb-2 mt-1 text-xs text-slate-500">
                {total > events.length ? `Showing the latest ${events.length} of ${total} events. ` : ""}
                <span className="text-red-400">Red</span> = failed login, <span className="text-emerald-400">green</span> = success. Click a row for its raw record.
              </p>
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Time</th>
                      <th className="px-3 py-2">User</th>
                      <th className="px-3 py-2">Source IP</th>
                      <th className="px-3 py-2">Country</th>
                      <th className="px-3 py-2">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => {
                      const isTrigger = new Date(e.occurred_at).getTime() === triggerTime;
                      return (
                        <Fragment key={e.id}>
                          <tr
                            onClick={() => setRawId(rawId === e.id ? null : e.id)}
                            className="cursor-pointer border-t border-slate-800 transition-colors hover:bg-slate-800/60"
                          >
                            <td className="whitespace-nowrap px-3 py-1.5 text-slate-300">
                              {formatTime(e.occurred_at)}
                              {isTrigger && (
                                <span className="ml-2 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">trigger</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5">{e.username}</td>
                            <td className="px-3 py-1.5 font-mono text-cyan-300">{String(e.src_ip).split("/")[0]}</td>
                            <td className="px-3 py-1.5">{e.country}</td>
                            <td className={`px-3 py-1.5 ${e.event_type === "login_failure" ? "text-red-400" : "text-emerald-400"}`}>
                              {e.event_type === "login_failure" ? "Failed" : "Success"}
                            </td>
                          </tr>
                          {rawId === e.id && (
                            <tr className="border-t border-slate-800 bg-slate-950">
                              <td colSpan={5} className="px-3 py-2">
                                <p className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">Raw event record, as stored</p>
                                <pre className="overflow-x-auto font-mono text-[11px] text-slate-300">{JSON.stringify(e, null, 2)}</pre>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function AlertTimeline({ alerts, incident }: { alerts: AlertRow[]; incident: Incident }) {
  const { severityColors } = useSettings();

  return (
    <ol className="relative ml-2 border-l border-slate-700 pl-6">
      <li className="relative mb-6">
        <span className="absolute -left-[30px] top-1 h-2.5 w-2.5 rounded-full bg-cyan-400 ring-4 ring-cyan-400/20" />
        <p className="text-xs text-slate-500">{formatDateTime(incident.created_at)}</p>
        <p className="text-sm">Incident opened: {incident.title}</p>
      </li>

      {alerts.map((a, i) => (
        <li key={a.id} className="relative mb-6">
          <span
            className="absolute -left-[30px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-slate-700/40"
            style={{ background: severityColors[a.severity] }}
          />
          <p className="mb-2 text-xs text-slate-500">{formatDateTime(a.created_at)}</p>
          <AlertFlow alert={a} incident={incident} defaultOpen={i === 0} />
        </li>
      ))}

      {alerts.length === 0 && <li className="text-sm text-slate-500">This incident has no alerts attached.</li>}
    </ol>
  );
}