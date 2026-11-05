import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import EyeLogo from "../components/EyeLogo";

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) {
    return "That email and password don't match an account. If you haven't registered yet, create an account below.";
  }
  if (m.includes("not confirmed")) {
    return "Please confirm your email first. Check your inbox for the confirmation link.";
  }
  return message;
}

export default function Login() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/dashboard" replace />;

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(friendly(error.message));
    setBusy(false);
  }

  return (
    <main className="keep-dark flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <form onSubmit={signIn} className="w-full max-w-sm space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div className="text-center">
          <Link to="/"><EyeLogo className="mx-auto mb-2 w-32" /></Link>
          <h1 className="text-xl font-semibold tracking-[0.3em]">SENTRIX</h1>
          <p className="text-xs text-slate-400">Sign in to the operations console</p>
        </div>
        <input
          className="w-full rounded bg-slate-800 p-2 outline-none ring-cyan-500 focus:ring-1"
          type="email" placeholder="Email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} required
        />
        <input
          className="w-full rounded bg-slate-800 p-2 outline-none ring-cyan-500 focus:ring-1"
          type="password" placeholder="Password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} required
        />
        {error && <p className="rounded bg-red-500/10 p-2 text-sm text-red-300">{error}</p>}
        <button disabled={busy} className="w-full rounded bg-cyan-600 p-2 font-medium transition-colors hover:bg-cyan-500 disabled:opacity-60">
          {busy ? "Signing in..." : "Sign in"}
        </button>
        <p className="text-center text-sm text-slate-400">
          New here? <Link to="/signup" className="text-cyan-300 hover:underline">Create an account</Link>
        </p>
        <p className="text-center text-xs text-slate-500">
          <Link to="/" className="hover:text-slate-300">&larr; Back to home</Link>
        </p>
      </form>
    </main>
  );
}