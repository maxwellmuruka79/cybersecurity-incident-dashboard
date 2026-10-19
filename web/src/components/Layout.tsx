import { NavLink, Outlet } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";

export default function Layout() {
  const { session, role } = useAuth();
  const link = ({ isActive }: { isActive: boolean }) =>
    `block rounded-lg px-3 py-2 text-sm ${
      isActive ? "bg-cyan-500/15 text-cyan-300" : "text-slate-400 hover:bg-slate-800"
    }`;

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="flex w-60 flex-col border-r border-slate-800 p-4">
        <div className="mb-6 text-lg font-semibold text-cyan-400">Incident Dashboard</div>
        <nav className="flex-1 space-y-1">
          <NavLink to="/incidents" className={link}>Incidents</NavLink>
        </nav>
        <div className="border-t border-slate-800 pt-4 text-xs text-slate-400">
          <div className="truncate">{session?.user.email}</div>
          <div className="mb-3 capitalize">{role ?? "..."}</div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
