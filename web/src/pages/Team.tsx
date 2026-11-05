import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { formatDate } from "../lib/format";

type Role = "admin" | "analyst" | "viewer";

interface Person {
  id: string;
  full_name: string | null;
  email: string | null;
  role: Role;
  created_at: string;
}

const ROLE_INFO: { role: Role; text: string }[] = [
  { role: "admin", text: "Manages the team and roles, plus everything an analyst can do." },
  { role: "analyst", text: "Triages, assigns, investigates and resolves incidents. Can add notes." },
  { role: "viewer", text: "Read-only: can see dashboards, events, alerts and reports." },
];

export default function Team() {
  const { role, session } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, created_at")
      .order("created_at");
    if (error) setError(`${error.message}. Have you run supabase/migration_02_roles.sql?`);
    else setPeople((data ?? []) as Person[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function changeRole(person: Person, next: Role) {
    if (next === person.role) return;
    const admins = people.filter((p) => p.role === "admin").length;
    if (person.role === "admin" && admins <= 1) {
      setError("There must always be at least one admin.");
      return;
    }
    setBusyId(person.id);
    setError(null);
    const { data, error } = await supabase.from("profiles").update({ role: next }).eq("id", person.id).select();
    if (error) setError(error.message);
    else if (!data || data.length === 0) setError("Not allowed: only admins can change roles.");
    await load();
    setBusyId(null);
  }

  if (role !== null && role !== "admin") {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="mt-2 text-slate-400">Only administrators can manage the team.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">Team</h1>
      <p className="mb-6 text-sm text-slate-400">Everyone with an account, and what they are allowed to do.</p>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {ROLE_INFO.map((r) => (
          <div key={r.role} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="font-medium capitalize">{r.role}</p>
            <p className="mt-1 text-xs text-slate-400">{r.text}</p>
          </div>
        ))}
      </div>

      {error && <p className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      {loading && <p className="text-slate-400">Loading...</p>}

      {!loading && (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Role</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const isMe = p.id === session?.user.id;
                return (
                  <tr key={p.id} className="border-t border-slate-800">
                    <td className="px-4 py-3">
                      {p.full_name || <span className="text-slate-500">No name</span>}
                      {isMe && <span className="ml-2 rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs text-cyan-300">you</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{p.email ?? "unknown"}</td>
                    <td className="px-4 py-3 text-slate-400">{formatDate(p.created_at)}</td>
                    <td className="px-4 py-3">
                      <select
                        className="rounded bg-slate-800 px-3 py-1.5 text-sm capitalize transition-colors hover:bg-slate-700 disabled:opacity-50"
                        value={p.role}
                        disabled={busyId === p.id || isMe}
                        title={isMe ? "You cannot change your own role" : undefined}
                        onChange={(e) => changeRole(p, e.target.value as Role)}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="analyst">Analyst</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}