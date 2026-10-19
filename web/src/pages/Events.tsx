import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";
import type { EventType, SecurityEvent } from "../types";
import { formatDate } from "../lib/format";

const PAGE_SIZE = 50;

interface Filters {
  type: "all" | EventType;
  username: string;
  ip: string;
  country: string;
}
const EMPTY: Filters = { type: "all", username: "", ip: "", country: "" };
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export default function Events() {
  const [draft, setDraft] = useState<Filters>(EMPTY);      // what the form shows
  const [applied, setApplied] = useState<Filters>(EMPTY);  // what the query uses
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<SecurityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      let q = supabase
        .from("security_events")
        .select("*", { count: "exact" })
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false });
      if (applied.type !== "all") q = q.eq("event_type", applied.type);
      if (applied.username) q = q.ilike("username", `%${applied.username}%`);
      if (applied.ip) q = q.eq("src_ip", applied.ip);
      if (applied.country) q = q.eq("country", applied.country.toUpperCase());
      const { data, count, error } = await q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (cancelled) return;
      if (error) setError(error.message);
      else {
        setRows((data ?? []) as SecurityEvent[]);
        setTotal(count ?? 0);
      }
      setLoading(false);
    }
    run();
    return () => {
      cancelled = true; // ignore stale responses if filters changed mid-request
    };
  }, [applied, page]);

  function search(e: FormEvent) {
    e.preventDefault();
    const ip = draft.ip.trim();
    if (ip && !IPV4.test(ip)) {
      setError("IP filter must be a full IPv4 address, e.g. 192.0.2.9");
      return;
    }
    setPage(0);
    setApplied({ ...draft, ip, username: draft.username.trim(), country: draft.country.trim() });
  }

  function reset() {
    setDraft(EMPTY);
    setApplied(EMPTY);
    setPage(0);
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const field = "rounded bg-slate-800 px-3 py-2 text-sm";

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-semibold">Security events</h1>
      <p className="mb-6 text-sm text-slate-400">
        {total.toLocaleString()} event{total === 1 ? "" : "s"} match your filters
      </p>

      <form onSubmit={search} className="mb-4 flex flex-wrap gap-3">
        <select className={field} value={draft.type}
          onChange={(e) => setDraft({ ...draft, type: e.target.value as Filters["type"] })}>
          <option value="all">All outcomes</option>
          <option value="login_failure">Failed logins</option>
          <option value="login_success">Successful logins</option>
        </select>
        <input className={`${field} w-40`} placeholder="Username contains" value={draft.username}
          onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
        <input className={`${field} w-44`} placeholder="Exact IP address" value={draft.ip}
          onChange={(e) => setDraft({ ...draft, ip: e.target.value })} />
        <input className={`${field} w-28`} placeholder="Country (KE)" maxLength={2} value={draft.country}
          onChange={(e) => setDraft({ ...draft, country: e.target.value })} />
        <button className="rounded bg-cyan-600 px-4 py-2 text-sm font-medium hover:bg-cyan-500">Search</button>
        <button type="button" onClick={reset} className="rounded bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700">
          Reset
        </button>
      </form>

      {error && <p className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

      <div className={`overflow-hidden rounded-xl border border-slate-800 ${loading ? "opacity-60" : ""}`}>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Source IP</th>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-800">
                <td className="whitespace-nowrap px-4 py-2 text-slate-400">{formatDate(r.occurred_at)}</td>
                <td className="px-4 py-2">{r.username}</td>
                <td className="px-4 py-2 font-mono text-xs text-cyan-300">{String(r.src_ip).split("/")[0]}</td>
                <td className="px-4 py-2">{r.country}</td>
                <td className="px-4 py-2">
                  <span className={r.event_type === "login_failure" ? "text-red-400" : "text-emerald-400"}>
                    {r.event_type === "login_failure" ? "Failed" : "Success"}
                  </span>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No events match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
        <button disabled={page === 0 || loading} onClick={() => setPage(page - 1)}
          className="rounded bg-slate-800 px-3 py-2 hover:bg-slate-700 disabled:opacity-40">Previous</button>
        <span>Page {page + 1} of {pages}</span>
        <button disabled={page + 1 >= pages || loading} onClick={() => setPage(page + 1)}
          className="rounded bg-slate-800 px-3 py-2 hover:bg-slate-700 disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}
