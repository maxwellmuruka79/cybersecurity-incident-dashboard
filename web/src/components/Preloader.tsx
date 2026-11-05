import { useEffect, useState } from "react";

interface Props {
  progress: number;   // 0-100 cap from REAL initialisation steps
  label: string;      // what the app is genuinely doing right now
  ready: boolean;     // true once initialisation has really finished
  onDone: () => void; // must be a stable function (useCallback)
}

// Vector redraw of the SENTRIX eye. Each stroke is drawn as three layers:
// a blurred red glow, a red body and a white-hot core.
const STROKES: { d: string; w: number }[] = [
  { d: "M80 315 C88 285 98 250 118 222 L130 212", w: 15 },
  { d: "M130 212 C160 190 205 160 260 146 C300 138 345 130 385 127", w: 5 },
  { d: "M135 248 C140 215 170 190 215 177 C250 168 300 168 350 177 C375 182 388 188 395 190", w: 9 },
  { d: "M395 190 L490 159", w: 3.4 },
  { d: "M170 385 L187 401 C220 402 260 392 295 372 C320 356 340 335 345 312", w: 14 },
  { d: "M345 312 C345 280 360 245 385 225 C405 210 425 205 442 202", w: 5.5 },
  { d: "M345 312 C370 295 395 280 440 257 C470 242 495 230 511 223", w: 5.5 },
  { d: "M58 355 C100 348 150 347 215 355 C260 358 300 345 330 322", w: 4.5 },
];

function Neon({ d, w, delay }: { d: string; w: number; delay: number }) {
  const shared = {
    d, pathLength: 1, fill: "none", strokeLinecap: "round", strokeLinejoin: "round",
    className: "sx-neon", style: { animationDelay: `${delay}s` },
  } as const;
  return (
    <>
      <path {...shared} stroke="#ff1a1a" strokeOpacity={0.7} strokeWidth={w * 2.8} filter="url(#sx-blur)" />
      <path {...shared} stroke="#ff4040" strokeWidth={w * 1.35} />
      <path {...shared} stroke="#fff2f2" strokeWidth={w * 0.58} />
    </>
  );
}

function NeonRing({ cx, cy, rx, ry, w }: { cx: number; cy: number; rx: number; ry: number; w: number }) {
  return (
    <>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#ff1a1a" strokeOpacity={0.5}
        strokeWidth={w * 2.6} filter="url(#sx-blur)" />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#ff4040" strokeWidth={w * 1.35} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#fff2f2" strokeWidth={w * 0.58} />
    </>
  );
}

export default function Preloader({ progress, label, ready, onDone }: Props) {
  const [reduceMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => setElapsed(performance.now() - start), 50);
    return () => clearInterval(id);
  }, []);

  // The scan advances with TIME but can never run ahead of REAL progress,
  // so it only reaches 100% once the app has genuinely finished loading.
  const timeFrac = Math.min(1, elapsed / (reduceMotion ? 500 : 1600));
  const shown = Math.min(timeFrac * 100, ready ? 100 : progress);
  const p = shown / 100;

  // Leave when the app is ready AND the animation has had its ~1.8s moment.
  const leaving = ready && elapsed >= (reduceMotion ? 600 : 1800);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(onDone, reduceMotion ? 0 : 500);
    return () => clearTimeout(t);
  }, [leaving, onDone, reduceMotion]);

  const move = reduceMotion ? "none" : "transform 0.3s linear";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading SENTRIX"
      onClick={ready ? onDone : undefined}
      className={`keep-dark sx-wrap fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-500 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
      style={{ background: "radial-gradient(ellipse at center, #0a1a33 0%, #050b18 70%)" }}
    >
      <svg viewBox="20 100 520 330" className="w-[26rem] max-w-[85vw]" aria-hidden="true">
        <defs>
          <filter id="sx-blur" filterUnits="userSpaceOnUse" x="0" y="80" width="560" height="360">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <radialGradient id="sx-mech" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#2a0505" />
            <stop offset="0.7" stopColor="#180303" />
            <stop offset="1" stopColor="#0a0101" />
          </radialGradient>
          <linearGradient id="sx-lidfill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4a0707" />
            <stop offset="1" stopColor="#150202" />
          </linearGradient>
          <radialGradient id="sx-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ff1a1a" stopOpacity="0.28" />
            <stop offset="1" stopColor="#ff1a1a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sx-bar" x1="0" x2="1">
            <stop offset="0" stopColor="#ff4040" stopOpacity="0" />
            <stop offset="0.5" stopColor="#ffb3b3" stopOpacity="1" />
            <stop offset="1" stopColor="#ff4040" stopOpacity="0" />
          </linearGradient>
          <pattern id="sx-lines" width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="4" height="1" fill="#ff5050" opacity="0.4" />
          </pattern>
        </defs>

        {/* The eye: draws on, lights up, blinks, glances */}
        <g className="sx-blink">
          <ellipse cx="275" cy="255" rx="250" ry="140" fill="url(#sx-halo)" />
          <g className="sx-iris">
            <ellipse cx="236" cy="247" rx="96" ry="90" fill="url(#sx-mech)" stroke="#5a0d0d" strokeWidth="2.5" />
            <ellipse cx="236" cy="247" rx="84" ry="78" fill="none" stroke="#7a1414" strokeWidth="1.5"
              strokeOpacity="0.7" />
            <NeonRing cx={236} cy={239} rx={58} ry={53} w={12} />
            <NeonRing cx={236} cy={233} rx={43} ry={39} w={5} />
            <g className="sx-pupil">
              <circle cx="236" cy="221" r="30" fill="none" stroke="#ff1a1a" strokeOpacity="0.5"
                strokeWidth="14" filter="url(#sx-blur)" />
              <circle cx="236" cy="221" r="30" fill="#140000" stroke="#ff8f85" strokeWidth="8" />
            </g>
          </g>
          <path d="M58 355 C100 348 150 347 215 355 C260 358 300 345 330 322 L345 312 C340 335 320 356 295 372 C260 392 220 402 187 401 L170 385 C140 372 100 372 58 372 Z"
            fill="url(#sx-lidfill)" />
          <path d="M130 212 C160 190 205 160 260 146 C300 138 345 130 385 127 L350 177 C300 168 250 168 215 177 C170 190 140 215 135 248 Z"
            fill="url(#sx-lidfill)" opacity="0.45" />
          {STROKES.map((s, i) => (
            <Neon key={i} d={s.d} w={s.w} delay={0.1 + i * 0.07} />
          ))}
        </g>

        {/* Loading scan: lines fill in from the top, a bright bar marks real progress */}
        <rect x="20" y="100" width="520" height="330" fill="url(#sx-lines)"
          style={{ transform: `scaleY(${p})`, transformOrigin: "20px 100px", transition: move }} />
        <g style={{ transform: `translateY(${p * 326}px)`, transition: move }}>
          <rect x="20" y="94" width="520" height="14" fill="url(#sx-bar)" opacity="0.22" />
          <rect x="20" y="100" width="520" height="2.5" fill="url(#sx-bar)" />
        </g>
      </svg>

      {ready && (
        <p className="absolute bottom-6 text-[10px] tracking-[0.3em] text-slate-500">CLICK ANYWHERE TO SKIP</p>
      )}

      <div className="sx-word mt-6 text-center">
        <p className="text-3xl font-semibold tracking-[0.45em] text-cyan-100">SENTRIX</p>
        <p className="mt-3 font-mono text-xs tracking-[0.25em] text-cyan-400/80">
          [{label.toUpperCase()}]<span className="animate-pulse">_</span>
        </p>
        <div className="mx-auto mt-5 h-0.5 w-56 overflow-hidden rounded bg-slate-800">
          <div
            className="h-full rounded bg-cyan-400 shadow-[0_0_8px_#22d3ee] transition-all duration-300 ease-out"
            style={{ width: `${Math.max(4, shown)}%` }}
          />
        </div>
      </div>
    </div>
  );
}