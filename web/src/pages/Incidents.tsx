import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { SEVERITIES, STATUSES, STATUS_LABEL } from "../types";
import type { Incident, Severity, Status } from "../types";
import { SeverityBadge, StatusBadge } from "../components/Badges";
import { formatDate } from "../lib/format";

export default function Incidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | "all">("all");
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase
      .from("incidents")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setIncidents((data ?? []) as Incident[]);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return incidents.filter(
      (i) =>
        (status === "all" || i.status === status) &&
        (severity === "all" || i.severity === severity) &&
        (q === "" || i.title.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)),
    );
  }, [incidents, status, severity, search]);

  const field = "rounded bg-slate-800 px-3 py-2 text-sm";

  return (
    <div>
      <h1 className="text-2xl font-semibold">Incidents</h1>
      <p className="mb-6 text-sm text-slate-400">
        Showing {filtered.length} of {incidents.length}
      </p>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          className={`${field} w-64`}
          placeholder="Search title or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={field} value={severity}
          onChange={(e) => setSeverity(e.target.value as Severity | "all")}>
          <option value="all">All severities</option>
          {SEVERITIES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
        <select className={field} value={status}
          onChange={(e) => setStatus(e.target.value as Status | "all")}>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
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
                <th className="px-4 py-3">Incident</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Detected</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className="border-t border-slate-800 hover:bg-slate-900/60">
                  <td className="px-4 py-3"><SeverityBadge severity={i.severity} /></td>
                  <td className="px-4 py-3">
                    <Link to={`/incidents/${i.id}`} className="font-medium text-cyan-300 hover:underline">
                      {i.title}
                    </Link>
                    <div className="text-xs text-slate-500">{i.category}</div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={i.status} /></td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(i.created_at)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    No incidents match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
