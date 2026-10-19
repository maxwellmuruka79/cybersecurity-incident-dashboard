import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type Role = "admin" | "analyst" | "viewer";

interface AuthState {
  session: Session | null;
  role: Role | null;
  loading: boolean;
  canWrite: boolean; // UI hint only. Row Level Security is what actually enforces it.
}

const AuthContext = createContext<AuthState>({
  session: null, role: null, loading: true, canWrite: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setRole(null);
      return;
    }
    supabase.from("profiles").select("role").eq("id", session.user.id).single()
      .then(({ data }) => setRole((data?.role as Role) ?? null));
  }, [session]);

  const canWrite = role === "admin" || role === "analyst";
  return (
    <AuthContext.Provider value={{ session, role, loading, canWrite }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
