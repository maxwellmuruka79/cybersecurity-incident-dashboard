import { useMemo, useState } from "react";
import { analyzePassword, formatDuration, generatePassword } from "../lib/password";
import type { GenOptions } from "../lib/password";
import PasswordMeter from "../components/PasswordMeter";

export default function PasswordAuditor() {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [gen, setGen] = useState<GenOptions>({ length: 18, lower: true, upper: true, digits: true, symbols: true });
  const [copied, setCopied] = useState(false);
  const report = useMemo(() => analyzePassword(password), [password]);

  function makeOne() {
    setPassword(generatePassword(gen));
    setShow(true);
    setCopied(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked by the browser: nothing to do */
    }
  }

  const card = "rounded-xl border border-slate-800 bg-slate-900 p-5";

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Password Auditor</h1>
        <p className="text-sm text-slate-400">
          See how an attacker would go after a password, and why. Everything runs in your browser. What you type is never
          sent anywhere or saved.
        </p>
      </div>

      <section className={card}>
        <label className="text-sm text-slate-400" htmlFor="pw">Try a password</label>
        <div className="mt-2 flex gap-2">
          <input
            id="pw"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="Type or paste a password to test"
            className="flex-1 rounded bg-slate-800 p-3 font-mono outline-none ring-cyan-500 focus:ring-1"
          />
          <button onClick={() => setShow((s) => !s)}
            className="rounded bg-slate-800 px-4 text-sm transition-colors hover:bg-slate-700">
            {show ? "Hide" : "Show"}
          </button>
        </div>
        <div className="mt-4"><PasswordMeter password={password} /></div>
        {!password && <p className="mt-3 text-sm text-slate-500">Try &quot;Password123!&quot;, then a long random phrase, and compare.</p>}
      </section>

      {password && (
        <>
          <section className={card}>
            <h2 className="mb-3 font-medium">Why it scores {report.label.toLowerCase()}</h2>
            <ul className="space-y-2 text-sm">
              {report.findings.length === 0 && <li className="text-slate-500">Nothing notable found.</li>}
              {report.findings.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <span className={f.good ? "text-emerald-400" : "text-red-400"} aria-hidden="true">{f.good ? "\u2713" : "\u2717"}</span>
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className={card}>
            <h2 className="font-medium">How long would it take to crack?</h2>
            <p className="mb-3 text-xs text-slate-500">
              Average time to guess it, under three assumed attack speeds. These are estimates from stated assumptions.
            </p>
            <table className="w-full text-left text-sm">
              <tbody>
                {report.scenarios.map((s) => (
                  <tr key={s.label} className="border-t border-slate-800">
                    <td className="py-2 pr-3">
                      {s.label}
                      <span className="block text-xs text-slate-500">{s.note}</span>
                    </td>
                    <td className="py-2 text-right font-medium">{formatDuration(s.seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      <section className={card}>
        <h2 className="mb-3 font-medium">Generate a strong password</h2>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            Length {gen.length}
            <input type="range" min={12} max={40} value={gen.length} className="accent-cyan-500"
              onChange={(e) => setGen({ ...gen, length: Number(e.target.value) })} />
          </label>
          {(["lower", "upper", "digits", "symbols"] as const).map((k) => (
            <label key={k} className="flex items-center gap-1.5">
              <input type="checkbox" className="accent-cyan-500" checked={gen[k]}
                onChange={(e) => setGen({ ...gen, [k]: e.target.checked })} />
              {k}
            </label>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={makeOne}
            className="rounded bg-cyan-600 px-4 py-2 text-sm font-medium transition-colors hover:bg-cyan-500">
            Generate
          </button>
          <button onClick={copy} disabled={!password}
            className="rounded bg-slate-800 px-4 py-2 text-sm transition-colors hover:bg-slate-700 disabled:opacity-40">
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Made with your browser&apos;s cryptographic random generator. Look-alike characters (l, 1, I, O, 0) are left out so it
          is easy to read back. Store it in a password manager.
        </p>
      </section>
    </div>
  );
}