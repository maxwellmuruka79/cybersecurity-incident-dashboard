import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useProfiles } from "../lib/useProfiles";
import { SEVERITIES, STATUSES, STATUS_LABEL } from "../types";
import type { AlertRow, Incident, Note, Severity, Status } from "../types";
import { SeverityBadge, StatusBadge } from "./Badges";
import AlertTimeline from "./AlertTimeline";
import { formatDate } from "../lib/format";

interface Props {
  id: string;
  onChanged?: () => void; // lets a parent list refresh after an edit
}

type Patch = Partial<Pick<Incident, "status" | "severity" | "assignee">>;

// Everything about one incident. Used by the side panel AND the full-page view.
export default function IncidentView({ id, onChanged }: Props) {
  const { session, canWrite } = useAuth();
  const { profiles, nameOf } = useProfiles();
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
      supabase.from("alerts").select("*, detection_rules(name, description, params)").eq("incident_id", id).order("created_at"),
      supabase.from("incident_notes").select("*").eq("incident_id", id).order("created_at"),
    ]);
    if (inc.error) setError(inc.error.message);
    setIncident((inc.data as Incident | null) ?? null);
    setAlerts((al.data ?? []) as unknown as AlertRow[]);
    setNotes((nt.data ?? []) as Note[]);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // One path for every edit: update the incident, then log it in the audit trail.
  async function update(patch: Patch, auditNote: string) {
    if (!incident || !session) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from("incidents")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", incident.id)
      .select();
    if (error) {
      setError(error.message);
    } else if (!data || data.length === 0) {
      // Row Level Security blocks silently: zero rows updated, no error.
      setError("Not allowed: your role cannot change incidents.");
    } else {
      const { error: noteError } = await supabase.from("incident_notes").insert({
        incident_id: incident.id, author: session.user.id, note: auditNote,
      });
      if (noteError) setError(noteError.message);
      await load();
      onChanged?.();
    }
    setBusy(false);
  }

  const changeStatus = (next: Status) =>
    incident && next !== incident.status &&
    update({ status: next }, `Status changed from ${STATUS_LABEL[incident.status]} to ${STATUS_LABEL[next]}`);

  const changeSeverity = (next: Severity) =>
    incident && next !== incident.severity &&
    update({ severity: next }, `Severity changed from ${incident.severity} to ${next}`);

  const changeAssignee = (next: string | null) =>
    incident && next !== incident.assignee &&
    update({ assignee: next }, next ? `Assigned to ${nameOf(next)}` : "Unassigned");

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
  if (!incident) return <p className="text-slate-400">Incident not found.</p>;

  const select =
    "w-full rounded bg-slate-800 px-3 py-2 text-sm transition-colors hover:bg-slate-700 disabled:opacity-50";
  const assignable = profiles.filter((p) => p.role === "admin" || p.role === "analyst");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">{incident.title}</h2>
        <SeverityBadge severity={incident.severity} />
        <StatusBadge status={incident.status} />
      </div>
      <p className="mt-2 text-sm text-slate-400">{incident.description}</p>
      <p className="mt-1 text-xs text-slate-500">
        Detected {formatDate(incident.created_at)} &middot; Last activity {formatDate(incident.updated_at)}
      </p>

      {error && <p className="mt-4 rounded bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

      <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block text-xs text-slate-400">
          Status
          <select className={`${select} mt-1`} value={incident.status} disabled={!canWrite || busy}
            onChange={(e) => changeStatus(e.target.value as Status)}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="block text-xs text-slate-400">
          Severity
          <select className={`${select} mt-1 capitalize`} value={incident.severity} disabled={!canWrite || busy}
            onChange={(e) => changeSeverity(e.target.value as Severity)}>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="block text-xs text-slate-400">
          Assigned to
          <select className={`${select} mt-1`} value={incident.assignee ?? ""} disabled={!canWrite || busy}
            onChange={(e) => changeAssignee(e.target.value || null)}>
            <option value="">Unassigned</option>
            {assignable.map((p) => <option key={p.id} value={p.id}>{nameOf(p.id)}</option>)}
          </select>
        </label>
      </section>
      {!canWrite && <p className="mt-2 text-xs text-slate-500">Read-only access</p>}

      <section className="mt-8">
        <h3 className="mb-1 font-medium">Investigation timeline ({alerts.length} alert{alerts.length === 1 ? "" : "s"})</h3>
        <p className="mb-4 text-xs text-slate-500">
          How the raw login events became an alert and then this incident. Click "Events" to see the evidence.
        </p>
        <AlertTimeline alerts={alerts} incident={incident} />
      </section>

      <section className="mt-8">
        <h3 className="mb-3 font-medium">Notes and activity</h3>
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-slate-900 p-3">
              <p className="text-sm">{n.note}</p>
              <p className="mt-1 text-xs text-slate-500">
                {n.author === session?.user.id ? "You" : nameOf(n.author)} &middot; {formatDate(n.created_at)}
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
              className="rounded bg-cyan-600 px-4 py-2 text-sm font-medium transition-colors hover:bg-cyan-500 disabled:opacity-50"
            >
              Add note
            </button>
          </form>
        )}
      </section>
    </div>
  );
}