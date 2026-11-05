import { useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useSettings, WIDGET_LABELS } from "../lib/settings";
import type { ChartStyle, Density, RefreshMode, RouteChannel, ThemeChoice } from "../lib/settings";
import { useNotify } from "../lib/notifications";
import { playAlertSound } from "../lib/sound";
import { SEVERITIES } from "../types";

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="font-medium">{title}</h2>
      {note && <p className="mb-4 mt-1 text-xs text-slate-500">{note}</p>}
      <div className={note ? "" : "mt-4"}>{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 py-3 first:border-t-0">
      <div>
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value, options, onChange,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-800 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            value === o.value ? "bg-cyan-600 text-white" : "text-slate-300 hover:bg-slate-700"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const CHANNELS: { key: RouteChannel; label: string }[] = [
  { key: "inApp", label: "In-app alert" },
  { key: "sound", label: "Sound" },
  { key: "desktop", label: "Desktop push" },
];

export default function Settings() {
  const { settings, update, reset, severityColors } = useSettings();
  const { session, role } = useAuth();
  const { notify } = useNotify();
  const [permission, setPermission] = useState<string>(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );

  const move = (index: number, dir: -1 | 1) => {
    const next = [...settings.widgets];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    update({ widgets: next });
  };

  const toggleRoute = (sev: (typeof SEVERITIES)[number], ch: RouteChannel) =>
    update({
      routing: {
        ...settings.routing,
        [sev]: { ...settings.routing[sev], [ch]: !settings.routing[sev][ch] },
      },
    });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-slate-400">Saved automatically on this device.</p>
      </div>

      <Card title="Appearance">
        <Row label="Theme" hint="System follows your operating system setting">
          <Segmented<ThemeChoice>
            value={settings.theme}
            onChange={(theme) => update({ theme })}
            options={[
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
              { value: "system", label: "System" },
            ]}
          />
        </Row>
        <Row label="Layout density" hint="Compact fits more rows on screen">
          <Segmented<Density>
            value={settings.density}
            onChange={(density) => update({ density })}
            options={[
              { value: "spacious", label: "Spacious" },
              { value: "compact", label: "Compact" },
            ]}
          />
        </Row>
        <Row label="Colour-blind friendly charts" hint="Uses a palette that stays distinguishable for common types of colour blindness">
          <input
            type="checkbox"
            className="h-5 w-5 accent-cyan-500"
            checked={settings.colorblind}
            onChange={(e) => update({ colorblind: e.target.checked })}
          />
        </Row>
      </Card>

      <Card title="Dashboard">
        <Row label="Chart style" hint="Applies to every chart on the dashboard. On the daily chart, Donut shows weekly slices.">
          <Segmented<ChartStyle>
            value={settings.chartStyle}
            onChange={(chartStyle) => update({ chartStyle })}
            options={[
              { value: "bars", label: "Bars" },
              { value: "line", label: "Line" },
              { value: "donut", label: "Donut" },
              { value: "radar", label: "Radar" },
            ]}
          />
        </Row>
        <Row label="Refresh" hint="Real-time needs Realtime enabled once in Supabase (see the note below)">
          <select
            className="rounded bg-slate-800 px-3 py-2 text-sm transition-colors hover:bg-slate-700"
            value={settings.refresh}
            onChange={(e) => update({ refresh: e.target.value as RefreshMode })}
          >
            <option value="manual">Manual only</option>
            <option value="30s">Every 30 seconds</option>
            <option value="5m">Every 5 minutes</option>
            <option value="realtime">Real-time</option>
          </select>
        </Row>
        <p className="mb-3 mt-1 rounded bg-slate-800 p-3 font-mono text-xs text-slate-300">
          alter publication supabase_realtime add table incidents, alerts;
        </p>
        <p className="mb-2 mt-4 text-sm">Dashboard widgets</p>
        <ul className="space-y-2">
          {settings.widgets.map((w, i) => (
            <li key={w.id} className="flex items-center gap-3 rounded-lg bg-slate-800 px-3 py-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-cyan-500"
                checked={w.visible}
                aria-label={`Show ${WIDGET_LABELS[w.id]}`}
                onChange={(e) =>
                  update({ widgets: settings.widgets.map((x) => (x.id === w.id ? { ...x, visible: e.target.checked } : x)) })
                }
              />
              <span className="flex-1 text-sm">{WIDGET_LABELS[w.id]}</span>
              <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"
                className="rounded px-2 py-1 text-sm transition-colors hover:bg-slate-700 disabled:opacity-30">&uarr;</button>
              <button onClick={() => move(i, 1)} disabled={i === settings.widgets.length - 1} aria-label="Move down"
                className="rounded px-2 py-1 text-sm transition-colors hover:bg-slate-700 disabled:opacity-30">&darr;</button>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Notification routing"
        note="Choose how each alert severity reaches you. These fire when new alerts arrive while SENTRIX is open (needs Real-time enabled)."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="pb-2">Severity</th>
                {CHANNELS.map((c) => <th key={c.key} className="pb-2 text-center">{c.label}</th>)}
                <th className="pb-2 text-center text-slate-600" title="Needs a server to send messages">Email</th>
                <th className="pb-2 text-center text-slate-600" title="Needs a server to send messages">Slack / webhook</th>
              </tr>
            </thead>
            <tbody>
              {SEVERITIES.map((sev) => (
                <tr key={sev} className="border-t border-slate-800">
                  <td className="py-2 capitalize">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: severityColors[sev] }} />
                    {sev}
                  </td>
                  {CHANNELS.map((c) => (
                    <td key={c.key} className="py-2 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-cyan-500"
                        checked={settings.routing[sev][c.key]}
                        aria-label={`${sev}: ${c.label}`}
                        onChange={() => toggleRoute(sev, c.key)}
                      />
                    </td>
                  ))}
                  <td className="py-2 text-center"><input type="checkbox" disabled className="h-4 w-4 opacity-30" aria-label={`${sev}: email (unavailable)`} /></td>
                  <td className="py-2 text-center"><input type="checkbox" disabled className="h-4 w-4 opacity-30" aria-label={`${sev}: Slack (unavailable)`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Email and Slack are greyed out on purpose: sending them needs a server-side service, which is part of the production roadmap.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => playAlertSound("critical")}
            className="rounded bg-slate-800 px-3 py-2 text-sm transition-colors hover:bg-slate-700">
            Test critical sound
          </button>
          <button
            onClick={() =>
              notify({ severity: "critical", title: "TEST: critical alert", body: "This is a test notification, not a real detection." })
            }
            className="rounded bg-cyan-600 px-3 py-2 text-sm transition-colors hover:bg-cyan-500"
          >
            Send test alert
          </button>
          <button
            disabled={permission === "unsupported" || permission === "granted"}
            onClick={() => Notification.requestPermission().then(setPermission)}
            className="rounded bg-slate-800 px-3 py-2 text-sm transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            {permission === "granted" ? "Desktop notifications enabled" : "Enable desktop notifications"}
          </button>
        </div>
        {permission === "denied" && (
          <p className="mt-2 text-xs text-amber-300">Desktop notifications are blocked in your browser settings for this site.</p>
        )}
      </Card>

      <Card title="Account and security">
        <Row label="Signed in as" hint={`Your role: ${role ?? "..."}`}>
          <span className="text-sm text-slate-300">{session?.user.email}</span>
        </Row>
        <p className="pb-3 text-xs text-slate-500">
          Every account has its own role: admin, analyst or viewer. New sign-ups start as viewers (read-only)
          until an admin promotes them on the Team page.
        </p>
        <Row label="Sign out everywhere" hint="Ends your session on every device and browser">
          <button
            onClick={() => supabase.auth.signOut({ scope: "global" })}
            className="rounded bg-slate-800 px-3 py-2 text-sm transition-colors hover:bg-slate-700"
          >
            Sign out of all devices
          </button>
        </Row>
        <Row label="Reset all settings" hint="Restores the defaults on this device">
          <button
            onClick={reset}
            className="rounded bg-slate-800 px-3 py-2 text-sm transition-colors hover:bg-slate-700"
          >
            Reset
          </button>
        </Row>
      </Card>
    </div>
  );
}