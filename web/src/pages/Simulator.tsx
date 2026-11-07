import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { simulate, DEFAULT_RULES } from "../lib/simulate";
import type { RuleParams, SimInputs } from "../lib/simulate";
import { analyzePassword, formatDuration } from "../lib/password";

const RATES = [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600];
const IPS = [1, 2, 4, 6, 10, 25, 50, 100, 250];
const MINUTES = [5, 15, 30, 60, 180, 360, 720, 1440];
const LOCKOUTS: (number | null)[] = [null, 3, 5, 10, 20];

const START: SimInputs = { ratePerIp: 60, ips: 1, minutes: 60, log10Guesses: 4, lockoutAfter: null, mfa: false };

const PRESETS: { name: string; text: string; inputs: SimInputs }[] = [
  { name: "Single-IP brute force", text: "One address hammering one account", inputs: START },
  { name: "Slow and patient", text: "One guess a minute, all day", inputs: { ...START, ratePerIp: 1, minutes: 720 } },
  { name: "Botnet spray", text: "100 addresses, a guess a minute each", inputs: { ...START, ratePerIp: 1, ips: 100, minutes: 30 } },
  { name: "Hardened account", text: "Strong password, lockout and MFA", inputs: { ...START, log10Guesses: 13, lockoutAfter: 5, mfa: true } },
];

function minutesText(m: number): string {
  return formatDuration(m * 60);
}

function pct(p: number): string {
  if (p === 0) return "0%";
  if (p < 0.001) return "under 0.1%";
  return `${Math.round(p * 1000) / 10}%`;
}

export default function Simulator() {
  const [inputs, setInputs] = useState<SimInputs>(START);
  const [rules, setRules] = useState<RuleParams>(DEFAULT_RULES);
  const [live, setLive] = useState(false);
  const [typed, setTyped] = useState("");

  // Use the real thresholds from the detection rules table when available
  useEffect(() => {
    supabase.from("detection_rules").select("name, params").then(({ data, error }) => {
      if (error || !data) return;
      const by = new Map((data as { name: string; params: Record<string, number> }[]).map((r) => [r.name, r.params]));
      const bf = by.get("brute_force"), sb = by.get("slow_brute_force"), da = by.get("distributed_attack");
      if (bf && sb && da) {
        setRules({
          brute_force: { min_failures: bf.min_failures, window_seconds: bf.window_seconds },
          slow_brute_force: { min_failures: sb.min_failures, window_seconds: sb.window_seconds },
          distributed_attack: { min_ips: da.min_ips, window_seconds: da.window_seconds },
        });
        setLive(true);
      }
    });
  }, []);

  const result = useMemo(() => simulate(inputs, rules), [inputs, rules]);
  const set = (patch: Partial<SimInputs>) => setInputs((i) => ({ ...i, ...patch }));

  function applyTyped(value: string) {
    setTyped(value);
    if (value) set({ log10Guesses: Math.min(20, Math.max(1, analyzePassword(value).log10)) });
  }

  const blindSpot = result.detections.length === 0;
  const lockedFirst = blindSpot && result.lockoutAtMinutes !== null;
  const warnedInTime = result.firstAlertMinutes !== null && result.firstAlertMinutes < result.expectedCrackMinutes;
  const end = Math.max(result.attackEndsAtMinutes, 0.0001);
  const at = (m: number) => `${Math.min(100, (m / inputs.minutes) * 100)}%`;

  const card = "rounded-xl border border-slate-800 bg-slate-900 p-5";
  const sel = "w-full rounded bg-slate-800 px-3 py-2 text-sm transition-colors hover:bg-slate-700";

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">What-if Simulator</h1>
        <p className="text-sm text-slate-400">
          Change the attack and the defences, and see whether the attacker gets in and whether SENTRIX would notice.
          This is a simplified model for learning, not a measurement of real attacks.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p.name} onClick={() => setInputs(p.inputs)} title={p.text}
            className="rounded-full border border-slate-700 px-4 py-1.5 text-sm transition-colors hover:border-cyan-400 hover:text-cyan-300">
            {p.name}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${card} space-y-5`}>
          <h2 className="font-medium">The attack</h2>
          <label className="block text-sm">
            Guesses per minute from each address: <b>{inputs.ratePerIp}</b>
            <input type="range" min={0} max={RATES.length - 1} className="mt-2 w-full accent-cyan-500"
              value={RATES.indexOf(inputs.ratePerIp) === -1 ? 7 : RATES.indexOf(inputs.ratePerIp)}
              onChange={(e) => set({ ratePerIp: RATES[Number(e.target.value)] })} />
          </label>
          <label className="block text-sm">
            Number of attacking addresses: <b>{inputs.ips}</b>
            <input type="range" min={0} max={IPS.length - 1} className="mt-2 w-full accent-cyan-500"
              value={IPS.indexOf(inputs.ips) === -1 ? 0 : IPS.indexOf(inputs.ips)}
              onChange={(e) => set({ ips: IPS[Number(e.target.value)] })} />
          </label>
          <label className="block text-sm">
            How long it runs: <b>{minutesText(inputs.minutes)}</b>
            <input type="range" min={0} max={MINUTES.length - 1} className="mt-2 w-full accent-cyan-500"
              value={MINUTES.indexOf(inputs.minutes) === -1 ? 3 : MINUTES.indexOf(inputs.minutes)}
              onChange={(e) => set({ minutes: MINUTES[Number(e.target.value)] })} />
          </label>

          <h2 className="pt-2 font-medium">The defences</h2>
          <label className="block text-sm">
            Password strength: about <b>10<sup>{inputs.log10Guesses.toFixed(1)}</sup></b> guesses to find
            <input type="range" min={1} max={20} step={0.5} className="mt-2 w-full accent-cyan-500"
              value={inputs.log10Guesses} onChange={(e) => set({ log10Guesses: Number(e.target.value) })} />
          </label>
          <label className="block text-sm">
            Or test a real password (stays in your browser)
            <input type="password" autoComplete="off" value={typed} onChange={(e) => applyTyped(e.target.value)}
              placeholder="Type a password to set the strength from it"
              className="mt-1 w-full rounded bg-slate-800 p-2 font-mono outline-none ring-cyan-500 focus:ring-1" />
          </label>
          <label className="block text-sm">
            Account lockout
            <select className={`${sel} mt-1`} value={inputs.lockoutAfter ?? ""}
              onChange={(e) => set({ lockoutAfter: e.target.value ? Number(e.target.value) : null })}>
              {LOCKOUTS.map((l) => (
                <option key={String(l)} value={l ?? ""}>{l === null ? "Off" : `Lock after ${l} failed attempts`}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-cyan-500" checked={inputs.mfa}
              onChange={(e) => set({ mfa: e.target.checked })} />
            Multi-factor authentication required
          </label>
        </section>

        <section className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className={`${card} text-center`}>
              <p className="text-xs text-slate-500">Password guessed</p>
              <p className="mt-1 text-2xl font-bold text-amber-300">{pct(result.pGuessed)}</p>
            </div>
            <div className={`${card} text-center`}>
              <p className="text-xs text-slate-500">Attacker gets in</p>
              <p className="mt-1 text-2xl font-bold" style={{ color: result.pAccess > 0.5 ? "#ef4444" : result.pAccess > 0.05 ? "#f97316" : "#34d399" }}>
                {pct(result.pAccess)}
              </p>
            </div>
            <div className={`${card} text-center`}>
              <p className="text-xs text-slate-500">SENTRIX alert</p>
              <p className={`mt-1 text-2xl font-bold ${blindSpot ? "text-red-400" : "text-emerald-400"}`}>
                {blindSpot ? "None" : minutesText(result.firstAlertMinutes as number)}
              </p>
            </div>
          </div>

          <div className={card}>
            <h2 className="mb-4 font-medium">Timeline of the attack</h2>
            <div className="relative h-3 rounded bg-slate-800">
              {result.firstAlertMinutes !== null && (
                <span className="absolute top-[-4px] h-5 w-1 rounded bg-amber-400" style={{ left: at(result.firstAlertMinutes) }} title="First alert" />
              )}
              {result.lockoutAtMinutes !== null && (
                <span className="absolute top-[-4px] h-5 w-1 rounded bg-blue-400" style={{ left: at(result.lockoutAtMinutes) }} title="Lockout" />
              )}
              {result.expectedCrackMinutes <= end && !inputs.mfa && (
                <span className="absolute top-[-4px] h-5 w-1 rounded bg-red-500" style={{ left: at(result.expectedCrackMinutes) }} title="Likely cracked" />
              )}
            </div>
            <div className="mt-2 flex justify-between text-xs text-slate-500">
              <span>start</span><span>{minutesText(inputs.minutes)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs">
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />first alert</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-400" />account locked</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />password likely guessed</span>
            </div>
          </div>

          <div className={card}>
            <h2 className="mb-3 font-medium">What this means</h2>
            <ul className="space-y-2 text-sm text-slate-300">
              <li>The attacker gets about <b>{Math.round(result.attempts).toLocaleString()}</b> guesses.</li>
              {lockedFirst && (
                <li className="text-amber-300">
                  The lockout stopped the attack before any detection rule fired. The account was protected, but your
                  analysts never found out it was targeted. A lockout should also raise an alert.
                </li>
              )}
              {blindSpot && !lockedFirst && (
                <li className="text-red-400">
                  No detection rule fires at this pace. This attack is a blind spot: each address stays under the
                  per-address thresholds ({rules.brute_force.min_failures} failures in {formatDuration(rules.brute_force.window_seconds)}, or {rules.slow_brute_force.min_failures} in {formatDuration(rules.slow_brute_force.window_seconds)}).
                </li>
              )}
              {result.detections.map((d) => (
                <li key={d.rule}>
                  <span className="font-mono text-cyan-300">{d.rule}</span> fires after about {minutesText(d.minutes)}.
                </li>
              ))}
              {!blindSpot && !inputs.mfa && (
                <li className={warnedInTime ? "text-emerald-400" : "text-red-400"}>
                  {warnedInTime
                    ? `An analyst is warned about ${minutesText(result.expectedCrackMinutes - (result.firstAlertMinutes as number))} before the password would typically fall.`
                    : "The password would typically fall before the first alert. Strengthen the password or add a lockout."}
                </li>
              )}
              {inputs.mfa && (
                <li>With multi-factor authentication a guessed password alone is not enough. The model treats this as fully blocking, but real attackers can sometimes bypass MFA, for example by phishing.</li>
              )}
            </ul>
          </div>
        </section>
      </div>

      <section className={`${card} text-xs text-slate-500`}>
        <h2 className="mb-2 text-sm font-medium text-slate-300">How the model works</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Chance of guessing = guesses available divided by guesses needed. This assumes the attacker tries guesses at random, so a lucky early hit is possible.</li>
          <li>A lockout ends the attack once the failures on the account reach the limit, no matter how many addresses are used.</li>
          <li>Detection uses {live ? "the live thresholds from your detection rules" : "default thresholds (the live rules could not be loaded)"}: brute_force, slow_brute_force and distributed_attack. Per-address rules judge each IP on its own.</li>
          <li>Real attackers adapt, share lists of leaked passwords and bypass defences. Treat the numbers as a way to compare setups, not as predictions.</li>
        </ul>
      </section>
    </div>
  );
}