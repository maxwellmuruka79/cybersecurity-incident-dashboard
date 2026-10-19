import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { SEVERITIES } from "../types";
import type { AlertRow, Severity } from "../types";
import { SeverityBadge } from "../components/Badges";
import { formatDate } from "../lib/format";

export default function Alerts() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rule, setRule] = useState("all");
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase
      .from("alerts")
      .select("*, detection_rules(name)")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setAlerts((data ?? []) as unknown as AlertRow[]);
        setLoading(false);
      });
  }, []);

  const ruleNames = useMemo(
    () => [...new Set(alerts.map((a) => a.detection_rules?.name ?? `rule ${a.rule_id}`))].sort(),
    [alerts],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return alerts.filter((a) => {
      const name = a.detection_rules?.name ?? `rule ${a.rule_id}`;
      return (
        (rule === "all" || name === rule) &&
        (severity === "all" || a.severity === severity) &&
        (q === "" ||
          a.description.toLowerCase().includes(q) ||
          (a.username ?? "").toLowerCase().includes(q) ||
          (a.src_ip ?? "").includes(q))
      );
    });
  }, [alerts, rule, severity, search]);

  const field = "rounded bg-slate-800 px-3 py-2 text-sm";

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-semibold">Alerts</h1>
      <p className="mb-6 text-sm text-slate-400">
        Showing {filtered.length} of {alerts.length}
      </p>

      <div className="mb-4 flex flex-wrap gap-3">
        <input className={`${field} w-64`} placeholder="Search description, user or IP..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={field} value={rule} onChange={(e) => setRule(e.target.value)}>
          <option value="all">All rules</option>
          {ruleNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select className={field} value={severity}
          onChange={(e) => setSeverity(e.target.value as Severity | "all")}>
          <option value="all">All severities</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading && <p className="text-slate-400">Loading...</p>}
      {error && <p className="text-red-400">{error}</p>}

      {!loading && !error && (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Rule</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Incident</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-t border-slate-800">
                  <td className="px-4 py-2"><SeverityBadge severity={a.severity} /></td>
                  <td className="px-4 py-2 font-mono text-xs text-cyan-300">
                    {a.detection_rules?.name ?? `rule ${a.rule_id}`}
                  </td>
                  <td className="px-4 py-2">{a.description}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-400">{formatDate(a.created_at)}</td>
                  <td className="px-4 py-2">
                    {a.incident_id ? (
                      <Link to={`/incidents/${a.incident_id}`} className="text-cyan-300 hover:underline">
                        #{a.incident_id}
                      </Link>
                    ) : (
                      <span className="text-slate-500">none</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No alerts match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
