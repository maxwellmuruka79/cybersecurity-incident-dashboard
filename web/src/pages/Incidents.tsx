import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useProfiles } from "../lib/useProfiles";
import { SEVERITIES, STATUSES, STATUS_LABEL } from "../types";
import type { Incident, Severity, Status } from "../types";
import { SeverityBadge, StatusBadge } from "../components/Badges";
import Drawer from "../components/Drawer";
import IncidentView from "../components/IncidentView";
import { formatDate, localDateKey, shortDay } from "../lib/format";

export default function Incidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Dashboard links like /incidents?severity=critical pre-set the filters.
  const [params] = useSearchParams();
  const startStatus = params.get("status");
  const startSeverity = params.get("severity");
  const [status, setStatus] = useState<Status | "all">(
    STATUSES.includes(startStatus as Status) ? (startStatus as Status) : "all");
  const [severity, setSeverity] = useState<Severity | "all">(
    SEVERITIES.includes(startSeverity as Severity) ? (startSeverity as Severity) : "all");
  const [search, setSearch] = useState("");
  // Quick filters arriving from the dashboard: a specific day, open cases only, one category
  const [date, setDate] = useState(params.get("date") ?? "");
  const [openOnly, setOpenOnly] = useState(params.get("open") === "1");
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [range, setRange] = useState<{ from: string; to: string } | null>(
    params.get("from") && params.get("to")
      ? { from: params.get("from") as string, to: params.get("to") as string }
      : null,
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false); // selectedId is kept so the panel can slide out with content
  const { nameOf } = useProfiles();

  const load = useCallback(() => {
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

  useEffect(() => {
    load();
  }, [load]);

  const openPanel = (id: number) => {
    setSelectedId(id);
    setPanelOpen(true);
  };
  const closePanel = useCallback(() => setPanelOpen(false), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return incidents.filter(
      (i) =>
        (status === "all" || i.status === status) &&
        (severity === "all" || i.severity === severity) &&
        (!openOnly || (i.status !== "resolved" && i.status !== "false_positive")) &&
        (!date || localDateKey(new Date(i.created_at)) === date) &&
        (!range || (localDateKey(new Date(i.created_at)) >= range.from && localDateKey(new Date(i.created_at)) <= range.to)) &&
        (!category || i.category === category) &&
        (q === "" || i.title.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)),
    );
  }, [incidents, status, severity, search, openOnly, date, category, range]);

  const field = "rounded bg-slate-800 px-3 py-2 text-sm";

  return (
    <div>
      <h1 className="text-2xl font-semibold">Incidents</h1>
      <p className="mb-6 text-sm text-slate-400">
        Showing {filtered.length} of {incidents.length}. Click a row to investigate.
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
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={field} value={status}
          onChange={(e) => setStatus(e.target.value as Status | "all")}>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      {(date || openOnly || category || range) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {date && (
            <button onClick={() => setDate("")}
              className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs text-cyan-300 transition-colors hover:bg-cyan-500/25">
              Day: {shortDay(date)} &times;
            </button>
          )}
          {range && (
            <button onClick={() => setRange(null)}
              className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs text-cyan-300 transition-colors hover:bg-cyan-500/25">
              {shortDay(range.from)} to {shortDay(range.to)} &times;
            </button>
          )}
          {openOnly && (
            <button onClick={() => setOpenOnly(false)}
              className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs text-cyan-300 transition-colors hover:bg-cyan-500/25">
              Open cases only &times;
            </button>
          )}
          {category && (
            <button onClick={() => setCategory("")}
              className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs text-cyan-300 transition-colors hover:bg-cyan-500/25">
              Category: {category} &times;
            </button>
          )}
        </div>
      )}

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
                <th className="px-4 py-3">Assigned</th>
                <th className="px-4 py-3">Detected</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr
                  key={i.id}
                  tabIndex={0}
                  onClick={() => openPanel(i.id)}
                  onKeyDown={(e) => e.key === "Enter" && openPanel(i.id)}
                  className={`cursor-pointer border-t border-slate-800 transition-colors ${
                    panelOpen && selectedId === i.id ? "bg-cyan-500/10" : "hover:bg-slate-900/70"
                  }`}
                >
                  <td className="px-4 py-3"><SeverityBadge severity={i.severity} /></td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-cyan-300">{i.title}</span>
                    <div className="text-xs text-slate-500">{i.category}</div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={i.status} /></td>
                  <td className="px-4 py-3 text-slate-400">{nameOf(i.assignee)}</td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(i.created_at)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No incidents match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={panelOpen} onClose={closePanel}>
        {selectedId !== null && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <Link to={`/incidents/${selectedId}`} className="text-sm text-cyan-300 hover:underline">
                Open full page
              </Link>
              <button
                onClick={closePanel}
                aria-label="Close panel"
                className="rounded bg-slate-800 px-3 py-1 text-sm transition-colors hover:bg-slate-700"
              >
                Close
              </button>
            </div>
            <IncidentView id={String(selectedId)} onChanged={load} />
          </>
        )}
      </Drawer>
    </div>
  );
}