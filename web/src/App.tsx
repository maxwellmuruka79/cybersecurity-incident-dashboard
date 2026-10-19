import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";

// Wiring test: log in, then count incidents. If this shows 30, auth and
// Row Level Security both work and we can build the real pages on top.
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [incidentCount, setIncidentCount] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setIncidentCount(null);
      return;
    }
    supabase
      .from("incidents")
      .select("*", { count: "exact", head: true })
      .then(({ count, error }) => {
        if (error) setError(error.message);
        else setIncidentCount(count);
      });
  }, [session]);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <form onSubmit={signIn} className="w-80 space-y-4 rounded-xl bg-slate-900 p-6">
          <h1 className="text-xl font-semibold">Sign in</h1>
          <input
            className="w-full rounded bg-slate-800 p-2"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="w-full rounded bg-slate-800 p-2"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button className="w-full rounded bg-cyan-600 p-2 font-medium hover:bg-cyan-500">
            Sign in
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-4">
      <p className="text-slate-400">Signed in as {session.user.email}</p>
      <p className="text-6xl font-bold text-cyan-400">{incidentCount ?? "..."}</p>
      <p className="text-slate-400">incidents visible to you</p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        className="rounded bg-slate-800 px-4 py-2 hover:bg-slate-700"
        onClick={() => supabase.auth.signOut()}
      >
        Sign out
      </button>
    </main>
  );
}
