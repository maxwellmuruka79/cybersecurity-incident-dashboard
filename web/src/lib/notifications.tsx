import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "./supabase";
import { useSettings } from "./settings";
import { playAlertSound } from "./sound";
import type { Severity } from "../types";

export interface Notice {
  severity: Severity;
  title: string;
  body: string;
}
interface Toast extends Notice {
  id: number;
}

const NotifyContext = createContext<{ notify: (n: Notice) => void }>({ notify: () => {} });
export const useNotify = () => useContext(NotifyContext);

const ORDER: Severity[] = ["low", "medium", "high", "critical"];

// Delivers alerts the way the routing matrix in Settings says: toast, sound, desktop push.
// New alerts arrive through Supabase Realtime (must be enabled once with a SQL command).
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { settings, severityColors } = useSettings();
  const routingRef = useRef(settings.routing);
  useEffect(() => {
    routingRef.current = settings.routing;
  }, [settings.routing]);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const notify = useCallback((n: Notice) => {
    const route = routingRef.current[n.severity];
    if (route.inApp) {
      nextId.current += 1;
      const id = nextId.current;
      setToasts((t) => [...t.slice(-3), { ...n, id }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 7000);
    }
    if (route.sound) playAlertSound(n.severity);
    if (route.desktop && typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(n.title, { body: n.body });
    }
  }, []);

  useEffect(() => {
    let pending: { severity: Severity; description: string }[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;

    // A detection run can insert dozens of alerts at once: summarise instead of spamming.
    const flush = () => {
      timer = undefined;
      const batch = pending;
      pending = [];
      if (batch.length === 0) return;
      if (batch.length <= 3) {
        batch.forEach((a) =>
          notify({ severity: a.severity, title: `${a.severity.toUpperCase()} alert`, body: a.description }),
        );
      } else {
        const top = batch.reduce<Severity>(
          (m, a) => (ORDER.indexOf(a.severity) > ORDER.indexOf(m) ? a.severity : m),
          batch[0].severity,
        );
        notify({ severity: top, title: `${batch.length} new alerts`, body: "A detection run just raised several alerts." });
      }
    };

    const channel = supabase
      .channel("sentrix-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alerts" },
        (payload: { new: Record<string, unknown> }) => {
          pending.push(payload.new as { severity: Severity; description: string });
          if (!timer) timer = setTimeout(flush, 800);
        },
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [notify]);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <NotifyContext.Provider value={value}>
      {children}
      <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <button
            key={t.id}
            role="alert"
            onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
            className="pointer-events-auto rounded-lg border bg-slate-900 p-3 text-left shadow-xl transition-opacity hover:opacity-90"
            style={{ borderColor: severityColors[t.severity] }}
          >
            <p className="text-sm font-semibold" style={{ color: severityColors[t.severity] }}>{t.title}</p>
            <p className="mt-0.5 text-xs text-slate-300">{t.body}</p>
          </button>
        ))}
      </div>
    </NotifyContext.Provider>
  );
}