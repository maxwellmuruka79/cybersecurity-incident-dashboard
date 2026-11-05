import { Link, useNavigate } from "react-router-dom";
import type { ChartStyle } from "../lib/settings";
import { shortDay } from "../lib/format";

export interface Slice {
  label: string;
  value: number;
  color: string;
}
export interface Datum extends Slice {
  href: string; // where a click on this bar, slice or point leads
}

/* ---------------------------------------------------------------- donut */
export function DonutChart({
  data, centerLabel, onSliceClick,
}: { data: Slice[]; centerLabel: string; onSliceClick?: (label: string) => void }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const R = 42;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <svg viewBox="0 0 120 120" className="h-44 w-44 shrink-0" role="img" aria-label={`${centerLabel}: ${total}`}>
      <circle cx="60" cy="60" r={R} fill="none" stroke="currentColor" className="text-slate-800" strokeWidth="14" />
      {total > 0 &&
        data.map((d) => {
          const len = (d.value / total) * C;
          const shown = Math.max(0, len - 1.5);
          const el = (
            <circle
              key={d.label}
              cx="60" cy="60" r={R} fill="none" stroke={d.color} strokeWidth="14"
              strokeDasharray={`${shown} ${C - shown}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
              className={onSliceClick ? "cursor-pointer transition-opacity hover:opacity-75" : ""}
              onClick={() => onSliceClick?.(d.label)}
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
      <text x="60" y="60" textAnchor="middle" className="fill-slate-100 text-[18px] font-bold">{total}</text>
      <text x="60" y="73" textAnchor="middle" className="fill-slate-400 text-[7px]">{centerLabel}</text>
    </svg>
  );
}

/* ---------------------------------------------------------------- radar */
export function RadarChart({
  data, color = "#22d3ee", onAxisClick, labelEvery = 1,
}: {
  data: { label: string; value: number }[];
  color?: string;
  onAxisClick?: (label: string) => void;
  labelEvery?: number; // with many axes, label only every Nth one
}) {
  const n = data.length;
  if (n < 3) return <p className="text-sm text-slate-500">A radar view needs at least 3 categories.</p>;

  const cx = 130, cy = 110, R = 64;
  const max = Math.max(1, ...data.map((d) => d.value));
  const point = (i: number, f: number) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [cx + R * f * Math.cos(a), cy + R * f * Math.sin(a)] as const;
  };
  const ring = (f: number) => data.map((_, i) => point(i, f).join(",")).join(" ");
  const shape = data.map((d, i) => point(i, d.value / max).join(",")).join(" ");

  return (
    <svg viewBox="0 0 260 220" className="w-full max-w-sm" role="img" aria-label="Radar chart">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={ring(f)} fill="none" stroke="currentColor" className="text-slate-700" strokeWidth="0.8" />
      ))}
      {data.map((_, i) => {
        const [x, y] = point(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="currentColor" className="text-slate-700" strokeWidth="0.6" />;
      })}
      <polygon points={shape} fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1.8" />
      {data.map((d, i) => {
        const [px, py] = point(i, d.value / max);
        const [lx, ly] = point(i, 1.2);
        const anchor = lx < cx - 6 ? "end" : lx > cx + 6 ? "start" : "middle";
        const text = d.label.length > 18 ? `${d.label.slice(0, 17)}...` : d.label;
        return (
          <g key={`${d.label}-${i}`}>
            <circle
              cx={px} cy={py} r={n > 12 ? 2 : 3} fill={color}
              className={onAxisClick ? "cursor-pointer" : ""}
              onClick={() => onAxisClick?.(d.label)}
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </circle>
            {i % labelEvery === 0 && (
              <text
                x={lx} y={ly} textAnchor={anchor}
                className={`fill-slate-300 text-[8px] ${onAxisClick ? "cursor-pointer hover:fill-cyan-300" : ""}`}
                onClick={() => onAxisClick?.(d.label)}
              >
                {text} ({d.value})
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ----------------------------------------------------------------- line */
export function LineChart({
  points, color = "#22d3ee", onPointClick, labelMode,
}: {
  points: { label: string; value: number }[];
  color?: string;
  onPointClick?: (index: number) => void;
  labelMode: "all" | "ends"; // categories: label every point; timeline: first, middle, last
}) {
  const n = points.length;
  if (n === 0) return null;

  const W = 300, H = 150, L = 24, R = 12, T = 12, B = 32;
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i: number) => (n === 1 ? (L + W - R) / 2 : L + (i / (n - 1)) * (W - L - R));
  const y = (v: number) => H - B - (v / max) * (H - B - T);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)} ${H - B} L${x(0).toFixed(1)} ${H - B} Z`;
  const showLabel = (i: number) => labelMode === "all" || i === 0 || i === n - 1 || i === Math.floor((n - 1) / 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Line chart">
      <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="currentColor" className="text-slate-700" strokeWidth="0.8" />
      <line x1={L} y1={y(max)} x2={W - R} y2={y(max)} stroke="currentColor" className="text-slate-800" strokeWidth="0.6" strokeDasharray="3 3" />
      <text x={L - 4} y={y(max) + 3} textAnchor="end" className="fill-slate-500 text-[7px]">{max}</text>
      <text x={L - 4} y={H - B + 3} textAnchor="end" className="fill-slate-500 text-[7px]">0</text>
      <path d={area} fill={color} fillOpacity="0.15" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={`${p.label}-${i}`}>
          <circle
            cx={x(i)} cy={y(p.value)} r={n > 12 ? 2.2 : 3.4} fill={color}
            className={onPointClick ? "cursor-pointer transition-all hover:opacity-70" : ""}
            onClick={() => onPointClick?.(i)}
          >
            <title>{`${p.label}: ${p.value}`}</title>
          </circle>
          {showLabel(i) && (
            <text x={x(i)} y={H - B + 12} textAnchor="middle" className="fill-slate-400 text-[7px]">
              {p.label.length > 12 ? `${p.label.slice(0, 11)}...` : p.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------- one chart, four styles */
// Used by every category-style chart on the dashboard so that ONE setting
// (Settings > Chart style) restyles all of them together.
export function CategoricalChart({
  data, style, centerLabel, total,
}: { data: Datum[]; style: ChartStyle; centerLabel: string; total: number }) {
  const navigate = useNavigate();
  const go = (label: string) => {
    const d = data.find((x) => x.label === label);
    if (d) navigate(d.href);
  };

  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return <p className="text-sm text-slate-500">No data yet.</p>;
  }
  const effective: ChartStyle = style === "radar" && data.length < 3 ? "bars" : style;

  if (effective === "donut") {
    return (
      <div className="flex flex-wrap items-center gap-6">
        <DonutChart centerLabel={centerLabel} onSliceClick={go} data={data} />
        <ul className="space-y-2 text-sm">
          {data.map((d) => (
            <li key={d.label}>
              <Link to={d.href} className="flex items-center gap-2 hover:underline">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                {d.label} <span className="text-slate-500">({d.value})</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (effective === "radar") {
    return <RadarChart data={data} color={data[0].color} onAxisClick={go} />;
  }

  if (effective === "line") {
    return (
      <LineChart
        points={data} color={data[0].color} labelMode="all"
        onPointClick={(i) => navigate(data[i].href)}
      />
    );
  }

  return (
    <div className="space-y-3">
      {data.map((d) => (
        <Link key={d.label} to={d.href} className="block rounded p-1 transition-colors hover:bg-slate-800">
          <div className="mb-1 flex justify-between text-sm">
            <span>{d.label}</span>
            <span className="text-slate-400">{d.value}</span>
          </div>
          <div className="h-2 rounded bg-slate-800">
            <div className="h-2 rounded transition-all duration-700"
              style={{ width: `${Math.min(100, (d.value / Math.max(1, total)) * 100)}%`, background: d.color }} />
          </div>
        </Link>
      ))}
    </div>
  );
}

/* -------------------------------------------- incidents-per-day chart */
export function TimelineChart({
  days, style, palette,
}: { days: { key: string; count: number }[]; style: ChartStyle; palette: string[] }) {
  const navigate = useNavigate();
  const max = Math.max(1, ...days.map((d) => d.count));
  const label = (d: { key: string; count: number }) =>
    `${shortDay(d.key)}: ${d.count} incident${d.count === 1 ? "" : "s"}`;
  const openDay = (key: string, count: number) => {
    if (count > 0) navigate(`/incidents?date=${key}`);
  };

  if (style === "line") {
    return (
      <LineChart
        labelMode="ends"
        color={palette[0]}
        points={days.map((d) => ({ label: shortDay(d.key), value: d.count }))}
        onPointClick={(i) => openDay(days[i].key, days[i].count)}
      />
    );
  }

  if (style === "donut") {
    // A donut of 30 days is unreadable, so group the days into weeks
    const buckets: Datum[] = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      const first = chunk[0].key;
      const last = chunk[chunk.length - 1].key;
      buckets.push({
        label: `${shortDay(first)} - ${shortDay(last)}`,
        value: chunk.reduce((s, d) => s + d.count, 0),
        color: palette[buckets.length % palette.length],
        href: `/incidents?from=${first}&to=${last}`,
      });
    }
    const total = buckets.reduce((s, b) => s + b.value, 0);
    return (
      <>
        <p className="mb-3 text-xs text-slate-500">Grouped by week</p>
        <CategoricalChart data={buckets} style="donut" centerLabel="incidents" total={total} />
      </>
    );
  }

  if (style === "radar") {
    const byLabel = new Map<string, { key: string; count: number }>();
    for (const d of days) byLabel.set(shortDay(d.key), d);
    return (
      <RadarChart
        data={days.map((d) => ({ label: shortDay(d.key), value: d.count }))}
        color={palette[0]}
        labelEvery={5}
        onAxisClick={(l) => {
          const d = byLabel.get(l);
          if (d) openDay(d.key, d.count);
        }}
      />
    );
  }

  return (
    <>
      <div className="flex h-36 items-end gap-1">
        {days.map((d) => {
          const height = `${d.count ? (d.count / max) * 100 : 3}%`;
          return d.count > 0 ? (
            <Link key={d.key} to={`/incidents?date=${d.key}`} title={label(d)} aria-label={label(d)}
              className="group flex h-full flex-1 items-end">
              <div className="w-full rounded-t bg-cyan-500 transition-all group-hover:bg-cyan-300" style={{ height }} />
            </Link>
          ) : (
            <div key={d.key} title={label(d)} className="flex h-full flex-1 items-end">
              <div className="w-full rounded-t bg-slate-800" style={{ height }} />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>{shortDay(days[0].key)}</span>
        <span>{shortDay(days[days.length - 1].key)}</span>
      </div>
    </>
  );
}