import { useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { friendlyCodeError, verifyCode } from "../lib/mfa";
import EyeLogo from "../components/EyeLogo";

// Shown after a correct password when the account has an authenticator app set up.
export default function MfaChallenge() {
  const { refreshMfa, session } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const factors = await supabase.auth.mfa.listFactors();
    const factor = factors.data?.totp[0];
    if (!factor) {
      setError("No authenticator app is set up for this account.");
    } else {
      const message = await verifyCode(factor.id, code.trim());
      if (message) setError(friendlyCodeError(message));
      else await refreshMfa(); // the account is now at aal2 and the app opens
    }
    setBusy(false);
  }

  return (
    <main className="keep-dark flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div className="text-center">
          <EyeLogo className="mx-auto mb-2 w-32" />
          <h1 className="text-xl font-semibold tracking-[0.3em]">SENTRIX</h1>
          <p className="mt-1 text-sm text-slate-400">Two-factor verification</p>
        </div>
        <p className="text-sm text-slate-400">
          Open your authenticator app and enter the 6-digit code for SENTRIX.
          {session?.user.email && <span className="block text-xs text-slate-500">Signed in as {session.user.email}</span>}
        </p>
        <input
          className="w-full rounded bg-slate-800 p-3 text-center font-mono text-2xl tracking-[0.5em] outline-none ring-cyan-500 focus:ring-1"
          inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000"
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus required
        />
        {error && <p className="rounded bg-red-500/10 p-2 text-sm text-red-300">{error}</p>}
        <button disabled={busy || code.length !== 6}
          className="w-full rounded bg-cyan-600 p-2 font-medium transition-colors hover:bg-cyan-500 disabled:opacity-50">
          {busy ? "Verifying..." : "Verify"}
        </button>
        <button type="button" onClick={() => supabase.auth.signOut()}
          className="w-full text-center text-sm text-slate-500 transition-colors hover:text-slate-300">
          Sign out
        </button>
      </form>
    </main>
  );
}