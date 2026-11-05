import { NavLink, Outlet } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useSettings } from "../lib/settings";
import { NotificationsProvider } from "../lib/notifications";
import EyeLogo from "./EyeLogo";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/incidents", label: "Incidents" },
  { to: "/alerts", label: "Alerts" },
  { to: "/events", label: "Events" },
  { to: "/reports", label: "Reports" },
  { to: "/settings", label: "Settings" },
];

function ThemeIcon({ light }: { light: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {light ? (
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      ) : (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      )}
    </svg>
  );
}

export default function Layout() {
  const { session, role } = useAuth();
  const { resolvedTheme, update } = useSettings();
  const nav = role === "admin" ? [...NAV, { to: "/team", label: "Team" }] : NAV;
  const link = ({ isActive }: { isActive: boolean }) =>
    `block rounded-lg px-3 py-2 text-sm transition-colors ${
      isActive ? "bg-cyan-500/15 text-cyan-300" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
    }`;

  return (
    <NotificationsProvider>
      <div className="flex min-h-screen bg-slate-950 text-slate-100">
        {/* The sidebar stays dark in both themes so the neon logo always looks right */}
        <aside className="keep-dark no-print sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-950 p-4">
          <div className="mb-6 flex items-center gap-3">
            <EyeLogo className="w-14" />
            <span className="text-lg font-semibold tracking-[0.3em] text-cyan-300">SENTRIX</span>
          </div>
          <nav className="flex-1 space-y-1">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} className={link}>{n.label}</NavLink>
            ))}
          </nav>
          <div className="border-t border-slate-800 pt-4 text-xs text-slate-400">
            <div className="truncate">{session?.user.email}</div>
            <div className="mb-3 capitalize">{role ?? "..."}</div>
            <div className="flex gap-2">
              <button
                onClick={() => update({ theme: resolvedTheme === "dark" ? "light" : "dark" })}
                aria-label={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                title={resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
                className="rounded bg-slate-800 p-2 text-slate-200 transition-colors hover:bg-slate-700"
              >
                <ThemeIcon light={resolvedTheme === "dark"} />
              </button>
              <button
                onClick={() => supabase.auth.signOut()}
                className="flex-1 rounded bg-slate-800 px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-slate-700"
              >
                Sign out
              </button>
            </div>
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </NotificationsProvider>
  );
}