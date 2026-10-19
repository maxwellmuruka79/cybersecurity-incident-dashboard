import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { STATUSES, STATUS_LABEL } from "../types";
import type { AlertRow, Incident, Note, Status } from "../types";
import { SeverityBadge, StatusBadge } from "../components/Badges";
import { formatDate } from "../lib/format";

export default function IncidentDetail() {
  const { id = "" } = useParams();
  const { session, canWrite } = useAuth();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [inc, al, nt] = await Promise.all([
      supabase.from("incidents").select("*").eq("id", id).maybeSingle(),
      supabase.from("alerts").select("*, detection_rules(name)").eq("incident_id", id).order("created_at"),
      supabase.from("incident_notes").select("*").eq("incident_id", id).order("created_at"),
    ]);
    if (inc.error) setError(inc.error.message);
    setIncident((inc.data as Incident | null) ?? null);
    setAlerts((al.data ?? []) as unknown as AlertRow[]);
    setNotes((nt.data ?? []) as Note[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function changeStatus(next: Status) {
    if (!incident || !session || next === incident.status) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from("incidents")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", incident.id)
      .select();
    if (error) {
      setError(error.message);
    } else if (!data || data.length === 0) {
      // Row Level Security blocks silently: zero rows updated, no error.
      setError("Not allowed: your role cannot change incidents.");
    } else {
      await supabase.from("incident_notes").insert({
        incident_id: incident.id,
        author: session.user.id,
        note: `Status changed from ${STATUS_LABEL[incident.status]} to ${STATUS_LABEL[next]}`,
      });
      await load();
    }
    setBusy(false);
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    const text = newNote.trim();
    if (!text || !incident || !session) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.from("incident_notes").insert({
      incident_id: incident.id, author: session.user.id, note: text,
    });
    if (error) setError(error.message);
    else {
      setNewNote("");
      await load();
    }
    setBusy(false);
  }

  if (loading) return <p className="text-slate-400">Loading...</p>;
  if (!incident) {
    return (
      <div>
        <p className="mb-4 text-slate-400">Incident not found.</p>
        <Link to="/incidents" className="text-cyan-300 hover:underline">Back to incidents</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <Link to="/incidents" className="text-sm text-slate-400 hover:text-slate-200">
        &larr; All incidents
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{incident.title}</h1>
        <SeverityBadge severity={incident.severity} />
        <StatusBadge status={incident.status} />
      </div>
      <p className="mt-2 text-sm text-slate-400">{incident.description}</p>
      <p className="mt-1 text-xs text-slate-500">
        Detected {formatDate(incident.created_at)} &middot; Last activity {formatDate(incident.updated_at)}
      </p>

      {error && <p className="mt-4 rounded bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

      <section className="mt-6">
        <label className="mb-1 block text-sm text-slate-400">Status</label>
        <select
          className="rounded bg-slate-800 px-3 py-2 text-sm disabled:opacity-50"
          value={incident.status}
          disabled={!canWrite || busy}
          onChange={(e) => changeStatus(e.target.value as Status)}
        >
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        {!canWrite && <span className="ml-3 text-xs text-slate-500">Read-only access</span>}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium">Alerts ({alerts.length})</h2>
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-2">Rule</th>
                <th className="px-4 py-2">Details</th>
                <th className="px-4 py-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} className="border-t border-slate-800">
                  <td className="px-4 py-2 font-mono text-xs text-cyan-300">
                    {a.detection_rules?.name ?? `rule ${a.rule_id}`}
                  </td>
                  <td className="px-4 py-2">{a.description}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-400">{formatDate(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium">Notes and activity</h2>
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-slate-900 p-3">
              <p className="text-sm">{n.note}</p>
              <p className="mt-1 text-xs text-slate-500">
                {n.author === session?.user.id ? "You" : "Analyst"} &middot; {formatDate(n.created_at)}
              </p>
            </li>
          ))}
          {notes.length === 0 && <li className="text-sm text-slate-500">No notes yet.</li>}
        </ul>

        {canWrite && (
          <form onSubmit={addNote} className="mt-4 flex gap-2">
            <input
              className="flex-1 rounded bg-slate-800 p-2 text-sm"
              placeholder="Add an investigation note..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
            />
            <button
              disabled={busy || !newNote.trim()}
              className="rounded bg-cyan-600 px-4 py-2 text-sm font-medium hover:bg-cyan-500 disabled:opacity-50"
            >
              Add note
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
