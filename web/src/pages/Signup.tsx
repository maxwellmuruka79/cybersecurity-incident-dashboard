import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import EyeLogo from "../components/EyeLogo";

export default function Signup() {
  const { session, loading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/dashboard" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() } }, // stored in the profile by a database trigger
    });
    setBusy(false);
    if (error) {
      setError(error.message);
    } else if (!data.session) {
      // Email confirmation is switched on in Supabase: no session until the link is clicked
      setNotice("Account created. Check your email and click the confirmation link, then sign in.");
    }
    // If a session came back, the auth listener signs the person in and redirects automatically
  }

  const input = "w-full rounded bg-slate-800 p-2 outline-none ring-cyan-500 focus:ring-1";

  return (
    <main className="keep-dark flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div className="text-center">
          <Link to="/"><EyeLogo className="mx-auto mb-2 w-32" /></Link>
          <h1 className="text-xl font-semibold tracking-[0.3em]">SENTRIX</h1>
          <p className="text-xs text-slate-400">Create your account</p>
        </div>
        <input className={input} placeholder="Full name" autoComplete="name" value={name}
          onChange={(e) => setName(e.target.value)} required />
        <input className={input} type="email" placeholder="Email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} required />
        <input className={input} type="password" placeholder="Password (8+ characters)" autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)} required />
        <input className={input} type="password" placeholder="Confirm password" autoComplete="new-password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        {error && <p className="rounded bg-red-500/10 p-2 text-sm text-red-300">{error}</p>}
        {notice && <p className="rounded bg-emerald-500/10 p-2 text-sm text-emerald-300">{notice}</p>}
        <button disabled={busy} className="w-full rounded bg-cyan-600 p-2 font-medium transition-colors hover:bg-cyan-500 disabled:opacity-60">
          {busy ? "Creating account..." : "Create account"}
        </button>
        <p className="text-xs text-slate-500">
          New accounts start with read-only access. An administrator can promote you to analyst.
        </p>
        <p className="text-center text-sm text-slate-400">
          Already have an account? <Link to="/login" className="text-cyan-300 hover:underline">Sign in</Link>
        </p>
      </form>
    </main>
  );
}