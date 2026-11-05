import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Severity } from "../types";

export type ThemeChoice = "dark" | "light" | "system";
export type Density = "compact" | "spacious";
export type ChartStyle = "bars" | "line" | "donut" | "radar";
export type RefreshMode = "manual" | "30s" | "5m" | "realtime";
export type WidgetId = "kpis" | "categories" | "severity" | "status" | "timeline" | "offenders" | "recent";
export type RouteChannel = "inApp" | "sound" | "desktop";

export interface WidgetConfig {
  id: WidgetId;
  visible: boolean;
}

export interface Settings {
  theme: ThemeChoice;
  density: Density;
  chartStyle: ChartStyle;
  colorblind: boolean;
  refresh: RefreshMode;
  widgets: WidgetConfig[];
  routing: Record<Severity, Record<RouteChannel, boolean>>; // notification routing matrix
}

export const WIDGET_LABELS: Record<WidgetId, string> = {
  kpis: "Key metrics",
  categories: "Attack categories",
  severity: "Incidents by severity",
  status: "Incidents by status",
  timeline: "Incidents per day",
  offenders: "Repeat offenders",
  recent: "Most recent incidents",
};

const DEFAULT_WIDGETS: WidgetConfig[] = (Object.keys(WIDGET_LABELS) as WidgetId[]).map((id) => ({
  id,
  visible: true,
}));

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  density: "spacious",
  chartStyle: "bars",
  colorblind: false,
  refresh: "manual",
  widgets: DEFAULT_WIDGETS,
  routing: {
    critical: { inApp: true, sound: true, desktop: true },
    high: { inApp: true, sound: false, desktop: true },
    medium: { inApp: true, sound: false, desktop: false },
    low: { inApp: false, sound: false, desktop: false },
  },
};

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#fbbf24", low: "#64748b",
};
// Okabe-Ito palette: distinguishable with the common kinds of colour blindness
const SEVERITY_COLORS_CB: Record<Severity, string> = {
  critical: "#D55E00", high: "#E69F00", medium: "#56B4E9", low: "#999999",
};
const CATEGORY_COLORS = ["#22d3ee", "#f97316", "#a78bfa", "#ef4444", "#34d399", "#fbbf24"];
const CATEGORY_COLORS_CB = ["#0072B2", "#E69F00", "#009E73", "#D55E00", "#CC79A7", "#56B4E9"];

const KEY = "sentrix-settings";

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw) as Partial<Settings>;
    const savedWidgets = Array.isArray(saved.widgets) ? saved.widgets : [];
    const known = new Set(DEFAULT_WIDGETS.map((w) => w.id));
    // keep the saved order, drop unknown widgets, append any new ones
    const widgets = [
      ...savedWidgets.filter((w) => known.has(w.id)),
      ...DEFAULT_WIDGETS.filter((d) => !savedWidgets.some((w) => w.id === d.id)),
    ];
    return { ...DEFAULT_SETTINGS, ...saved, widgets, routing: { ...DEFAULT_SETTINGS.routing, ...saved.routing } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface SettingsCtx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
  resolvedTheme: "dark" | "light";
  severityColors: Record<Severity, string>;
  categoryColors: string[];
}

const SettingsContext = createContext<SettingsCtx>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
  reset: () => {},
  resolvedTheme: "dark",
  severityColors: SEVERITY_COLORS,
  categoryColors: CATEGORY_COLORS,
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable: settings last for this visit only */
    }
  }, [settings]);

  useEffect(() => {
    document.documentElement.dataset.density = settings.density;
  }, [settings.density]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const light = settings.theme === "light" || (settings.theme === "system" && mq.matches);
      document.documentElement.classList.toggle("light", light);
      setResolvedTheme(light ? "light" : "dark");
    };
    apply();
    if (settings.theme !== "system") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  const value = useMemo(
    () => ({
      settings, update, reset, resolvedTheme,
      severityColors: settings.colorblind ? SEVERITY_COLORS_CB : SEVERITY_COLORS,
      categoryColors: settings.colorblind ? CATEGORY_COLORS_CB : CATEGORY_COLORS,
    }),
    [settings, update, reset, resolvedTheme],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);