import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useInView } from "../lib/useInView";
import { useTypewriter } from "../lib/useTypewriter";
import { useCountUp } from "../lib/useCountUp";
import EyeLogo from "../components/EyeLogo";

// Numbers from the demo dataset that ships with the project (simulated, not real traffic)
const DEMO = { events: 1291, alerts: 41, incidents: 30 };

const STEPS = [
  {
    title: "Events",
    text: "Login activity streams in: who tried to sign in, from which IP address and country, and whether it worked.",
    example: "198.51.100.23 failed to sign in as lucy.s  x34  (in 90 seconds)",
  },
  {
    title: "Detection rules",
    text: "Six rules watch for attack patterns: brute force, slow brute force, credential stuffing, distributed attacks, account takeover and logins from unusual countries.",
    example: "brute_force: 10+ failed logins on one account from one IP within 2 minutes",
  },
  {
    title: "Alerts",
    text: "When a rule matches, an alert is raised with a severity and the evidence behind it, so nobody has to dig through raw logs.",
    example: "HIGH  34 failed logins for 'lucy.s' from 198.51.100.23 within 120s",
  },
  {
    title: "Incidents",
    text: "Related alerts are grouped into a single incident that an analyst can triage, assign, investigate, annotate and resolve.",
    example: "Brute-force attack: lucy.s   New > Investigating > Resolved",
  },
];

const FEATURES = [
  { icon: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z", title: "Rule-based detection",
    text: "Six detection rules, each scored against known attacks and decoy look-alikes to measure misses and false alarms." },
  { icon: "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0", title: "Alerts that reach you",
    text: "Route each severity to an in-app alert, a sound or a desktop notification. Critical alerts get their own tone." },
  { icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01", title: "Incident queue",
    text: "Filter, search and open any incident in a side panel. Change status or severity, assign it, and keep a note trail." },
  { icon: "M3 3v18h18M7 14l4-4 3 3 5-6", title: "Live analytics",
    text: "Animated metrics and charts you can restyle as bars, lines, donuts or radar. Click any chart to see the records." },
  { icon: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h8M8 17h8", title: "One-click reports",
    text: "Generate a summary for any period, print it or save it as PDF, and export incidents or alerts to CSV." },
  { icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8", title: "Role-based access",
    text: "Admins, analysts and viewers each see and change only what their role allows, enforced in the database." },
];

const RULES = [
  { name: "brute_force", level: "High", text: "10+ failed logins on one account from one IP within 2 minutes" },
  { name: "slow_brute_force", level: "Medium", text: "12+ failures spread over 30 minutes: the patient attacker" },
  { name: "credential_stuffing", level: "High", text: "One IP failing against 6+ different usernames within 5 minutes" },
  { name: "distributed_attack", level: "High", text: "Failures against one account from 6+ different IPs within 5 minutes" },
  { name: "success_after_failures", level: "Critical", text: "A login succeeds right after a burst of failures: the attacker got in" },
  { name: "unusual_country", level: "Medium", text: "A successful login from a country the user never signs in from" },
];

const LEVEL_STYLE: Record<string, string> = {
  Critical: "bg-red-500/15 text-red-300 ring-red-500/40",
  High: "bg-orange-500/15 text-orange-300 ring-orange-500/40",
  Medium: "bg-amber-500/15 text-amber-300 ring-amber-500/40",
};

const ROLES = [
  { name: "Admin", text: "Manages the team and roles, with full access to every incident." },
  { name: "Analyst", text: "Triages, assigns, investigates and resolves incidents, and adds notes." },
  { name: "Viewer", text: "Read-only access to dashboards, events, alerts and reports. New sign-ups start here." },
];

function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const [ref, seen] = useInView<HTMLDivElement>(false); // false: hide again when scrolled out of view
  return (
    <div
      ref={ref}
      style={{ transitionDelay: seen ? `${delay}ms` : "0ms" }}
      className={`transition-all ${
        seen ? "translate-y-0 opacity-100 duration-700" : "translate-y-6 opacity-0 duration-300"
      } ${className}`}
    >
      {children}
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Stat({ label, value, go }: { label: string; value: number; go: boolean }) {
  const n = useCountUp(go ? value : 0, 1400);
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center">
      <p className="text-4xl font-bold tabular-nums text-cyan-300">{n.toLocaleString()}</p>
      <p className="mt-1 text-sm text-slate-400">{label}</p>
    </div>
  );
}

function Pipeline() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);

  // Cycles through the stages until the visitor takes over by clicking
  useEffect(() => {
    if (!auto || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setActive((a) => (a + 1) % STEPS.length), 4500);
    return () => clearInterval(id);
  }, [auto]);

  const step = STEPS[active];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-center gap-y-3">
        {STEPS.map((s, i) => (
          <Fragment key={s.title}>
            <button
              onClick={() => {
                setAuto(false);
                setActive(i);
              }}
              aria-pressed={active === i}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all ${
                active === i
                  ? "border-cyan-400 bg-cyan-500/15 text-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.35)]"
                  : "border-slate-700 text-slate-400 hover:border-cyan-500/60 hover:text-slate-100"
              }`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                active === i ? "bg-cyan-400 text-slate-950" : "bg-slate-800"
              }`}>{i + 1}</span>
              {s.title}
            </button>
            {i < STEPS.length - 1 && (
              <span className={`mx-1 hidden h-px w-8 transition-colors sm:block ${i < active ? "bg-cyan-400" : "bg-slate-700"}`} />
            )}
          </Fragment>
        ))}
      </div>

      <div key={active} className="sx-fadein mx-auto mt-8 max-w-2xl rounded-xl border border-slate-800 bg-slate-900/70 p-6">
        <p className="text-sm text-slate-300">{step.text}</p>
        <p className="mt-4 text-xs uppercase tracking-widest text-slate-500">Example</p>
        <p className="mt-1 rounded bg-slate-950 p-3 font-mono text-xs text-cyan-300">{step.example}</p>
      </div>
    </div>
  );
}

function DashboardPreview() {
  const bars = [92, 64, 41, 23];
  const colors = ["#ef4444", "#f97316", "#fbbf24", "#64748b"];
  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-[0_0_60px_rgba(34,211,238,0.12)]">
      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900 px-4 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        <span className="ml-3 text-xs text-slate-500">SENTRIX / dashboard (preview)</span>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        {[["Open incidents", "12"], ["Open critical", "3"], ["Resolved", "9"]].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
            <p className="text-xs text-slate-500">{k}</p>
            <p className="text-2xl font-bold text-cyan-300">{v}</p>
          </div>
        ))}
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 sm:col-span-3">
          <p className="mb-3 text-xs text-slate-500">Incidents by severity</p>
          <div className="space-y-2">
            {bars.map((w, i) => (
              <div key={i} className="h-2 rounded bg-slate-800">
                <div className="h-2 rounded" style={{ width: `${w}%`, background: colors[i] }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { session } = useAuth();
  const status = useTypewriter("STATUS: DEMO ENVIRONMENT // SIMULATED TELEMETRY ONLINE // READY", 32, 700);
  const [statsRef, statsSeen] = useInView<HTMLElement>(false);

  const primary =
    "rounded-lg bg-cyan-600 px-6 py-3 font-medium transition-all hover:bg-cyan-400 hover:shadow-[0_0_24px_rgba(34,211,238,0.5)]";
  const secondary =
    "rounded-lg border border-slate-600 px-6 py-3 font-medium transition-all hover:border-cyan-400 hover:text-cyan-300";

  return (
    <div className="keep-dark min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-3">
            <EyeLogo className="w-12" />
            <span className="text-lg font-semibold tracking-[0.3em] text-cyan-300">SENTRIX</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-slate-400 md:flex">
            <a href="#how" className="transition-colors hover:text-cyan-300">How it works</a>
            <a href="#features" className="transition-colors hover:text-cyan-300">Features</a>
            <a href="#rules" className="transition-colors hover:text-cyan-300">Detection</a>
            <a href="#roles" className="transition-colors hover:text-cyan-300">Roles</a>
          </nav>
          <div className="flex items-center gap-2">
            {session ? (
              <Link to="/dashboard" className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium transition-colors hover:bg-cyan-400">
                Open dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="rounded-lg border border-slate-700 px-4 py-2 text-sm transition-colors hover:border-cyan-400 hover:text-cyan-300">
                  Sign in
                </Link>
                <Link to="/signup" className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium transition-colors hover:bg-cyan-400">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(34,211,238,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.07) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          }} />
        <div className="sx-gridscan pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
        <div className="pointer-events-none absolute left-1/2 top-24 h-96 w-96 -translate-x-1/2 rounded-full bg-red-600/20 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-16 text-center">
          <EyeLogo className="sx-float mx-auto w-80 max-w-full" />
          <p className="mt-6 min-h-[1.5rem] font-mono text-xs tracking-widest text-cyan-400/90 sm:text-sm">
            {status}<span className="animate-pulse">_</span>
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">
            See the attack <span className="text-cyan-300">before</span> it becomes a breach.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-400">
            SENTRIX is a security operations console. It turns a flood of login events into clear alerts and
            manageable incidents, so a small team can find, investigate and close real threats.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {session ? (
              <Link to="/dashboard" className={primary}>Open dashboard</Link>
            ) : (
              <>
                <Link to="/signup" className={primary}>Create an account</Link>
                <Link to="/login" className={secondary}>Sign in</Link>
              </>
            )}
            <a href="#how" className={secondary}>See how it works</a>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Demo environment. All activity shown is simulated, and SENTRIX does not monitor any real network.
          </p>
        </div>
      </section>

      {/* Numbers */}
      <section ref={statsRef} className="mx-auto max-w-4xl px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="events analysed" value={DEMO.events} go={statsSeen} />
          <Stat label="alerts raised" value={DEMO.alerts} go={statsSeen} />
          <Stat label="incidents to investigate" value={DEMO.incidents} go={statsSeen} />
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">From the built-in demo dataset: roughly 1,300 events become 30 incidents.</p>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 border-t border-slate-800/80 bg-slate-900/30 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mb-10 text-center">
            <h2 className="text-3xl font-bold">From noise to action in four steps</h2>
            <p className="mt-2 text-slate-400">Click a stage to see what happens there.</p>
          </Reveal>
          <Reveal delay={100}><Pipeline /></Reveal>
        </div>
      </section>

      {/* Preview */}
      <section className="px-6 py-20">
        <Reveal><DashboardPreview /></Reveal>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 border-t border-slate-800/80 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mb-10 text-center">
            <h2 className="text-3xl font-bold">Built for the people who answer the alarm</h2>
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 80}>
                <div className="h-full rounded-xl border border-slate-800 bg-slate-900/60 p-6 transition-all hover:-translate-y-1 hover:border-cyan-500/50 hover:shadow-[0_8px_30px_rgba(34,211,238,0.12)]">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-300">
                    <Icon d={f.icon} />
                  </div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-slate-400">{f.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Detection rules */}
      <section id="rules" className="scroll-mt-20 border-t border-slate-800/80 bg-slate-900/30 px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <Reveal className="mb-10 text-center">
            <h2 className="text-3xl font-bold">What it watches for</h2>
            <p className="mt-2 text-slate-400">Every rule is tested against planted attacks and harmless look-alikes.</p>
          </Reveal>
          <div className="space-y-3">
            {RULES.map((r, i) => (
              <Reveal key={r.name} delay={i * 60}>
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/70 p-4 transition-colors hover:border-slate-600">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${LEVEL_STYLE[r.level]}`}>{r.level}</span>
                  <span className="font-mono text-sm text-cyan-300">{r.name}</span>
                  <span className="text-sm text-slate-400">{r.text}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section id="roles" className="scroll-mt-20 border-t border-slate-800/80 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <Reveal className="mb-10 text-center">
            <h2 className="text-3xl font-bold">The right access for each person</h2>
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-3">
            {ROLES.map((r, i) => (
              <Reveal key={r.name} delay={i * 100}>
                <div className="h-full rounded-xl border border-slate-800 bg-slate-900/60 p-6 transition-all hover:border-cyan-500/50">
                  <h3 className="font-semibold text-cyan-300">{r.name}</h3>
                  <p className="mt-2 text-sm text-slate-400">{r.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Call to action */}
      <section className="border-t border-slate-800/80 bg-slate-900/30 px-6 py-20 text-center">
        <Reveal>
          <h2 className="text-3xl font-bold">Ready to investigate?</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">Create an account and explore the console with the demo data.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {session ? (
              <Link to="/dashboard" className={primary}>Open dashboard</Link>
            ) : (
              <>
                <Link to="/signup" className={primary}>Create an account</Link>
                <Link to="/login" className={secondary}>Sign in</Link>
              </>
            )}
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-slate-800/80 px-6 py-8 text-center text-xs text-slate-500">
        <p>SENTRIX Security Operations Console. Built with React, TypeScript, Tailwind CSS, Python and Supabase.</p>
        <p className="mt-1">All data is simulated. SENTRIX does not monitor any real network.</p>
      </footer>
    </div>
  );
}