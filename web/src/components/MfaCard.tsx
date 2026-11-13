import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { friendlyCodeError, verifyCode } from "../lib/mfa";

// Settings card: turn two-factor authentication on or off for the signed-in account.
export default function MfaCard() {
  const { mfaEnabled, refreshMfa } = useAuth();
  const [setup, setSetup] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    setJustEnabled(false);
    // Clear any half-finished earlier attempt first
    const existing = await supabase.auth.mfa.listFactors();
    for (const f of existing.data?.all ?? []) {
      if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error) setError(error.message);
    else setSetup({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    setBusy(false);
  }

  async function confirm() {
    if (!setup) return;
    setBusy(true);
    setError(null);
    const message = await verifyCode(setup.factorId, code.trim());
    if (message) setError(friendlyCodeError(message));
    else {
      setSetup(null);
      setCode("");
      setJustEnabled(true);
      await refreshMfa();
    }
    setBusy(false);
  }

  async function cancel() {
    if (setup) await supabase.auth.mfa.unenroll({ factorId: setup.factorId });
    setSetup(null);
    setCode("");
    setError(null);
  }

  async function disable() {
    if (!window.confirm("Turn off two-factor authentication? Your account will be protected by your password alone.")) return;
    setBusy(true);
    setError(null);
    const factors = await supabase.auth.mfa.listFactors();
    for (const f of factors.data?.totp ?? []) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
      if (error) setError(error.message);
    }
    setJustEnabled(false);
    await refreshMfa();
    setBusy(false);
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Two-factor authentication</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs ring-1 ring-inset ${
          mfaEnabled ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40" : "bg-slate-500/15 text-slate-300 ring-slate-500/40"
        }`}>
          {mfaEnabled ? "On" : "Off"}
        </span>
      </div>
      <p className="mb-4 mt-1 text-xs text-slate-500">
        Adds a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy) on top of your
        password, so a stolen password alone is not enough to get in.
      </p>

      {error && <p className="mb-3 rounded bg-red-500/10 p-2 text-sm text-red-300">{error}</p>}
      {justEnabled && <p className="mb-3 rounded bg-emerald-500/10 p-2 text-sm text-emerald-300">Two-factor authentication is on. You will be asked for a code each time you sign in.</p>}

      {!mfaEnabled && !setup && (
        <button onClick={start} disabled={busy}
          className="rounded bg-cyan-600 px-4 py-2 text-sm font-medium transition-colors hover:bg-cyan-500 disabled:opacity-60">
          {busy ? "Preparing..." : "Set up two-factor authentication"}
        </button>
      )}

      {setup && (
        <div className="sx-fadein space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
            <li>Open your authenticator app and add a new account.</li>
            <li>Scan this QR code, or type the secret key in by hand.</li>
            <li>Enter the 6-digit code the app shows, to confirm.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-5">
            <img src={setup.qr} alt="QR code for your authenticator app" className="h-40 w-40 rounded bg-white p-2" />
            <div className="min-w-0 text-xs text-slate-400">
              <p>Can&apos;t scan? Enter this key:</p>
              <p className="mt-1 break-all rounded bg-slate-950 p-2 font-mono text-slate-200">{setup.secret}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              className="w-40 rounded bg-slate-800 p-2 text-center font-mono tracking-[0.3em] outline-none ring-cyan-500 focus:ring-1"
              inputMode="numeric" maxLength={6} placeholder="000000" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <button onClick={confirm} disabled={busy || code.length !== 6}
              className="rounded bg-cyan-600 px-4 py-2 text-sm font-medium transition-colors hover:bg-cyan-500 disabled:opacity-50">
              {busy ? "Checking..." : "Confirm and turn on"}
            </button>
            <button onClick={cancel} className="rounded bg-slate-800 px-4 py-2 text-sm transition-colors hover:bg-slate-700">Cancel</button>
          </div>
        </div>
      )}

      {mfaEnabled && (
        <button onClick={disable} disabled={busy}
          className="rounded bg-slate-800 px-4 py-2 text-sm transition-colors hover:bg-slate-700 disabled:opacity-60">
          Turn off two-factor authentication
        </button>
      )}
    </section>
  );
}