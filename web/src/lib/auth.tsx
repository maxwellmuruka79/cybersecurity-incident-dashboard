import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type Role = "admin" | "analyst" | "viewer";

interface AuthState {
  session: Session | null;
  role: Role | null;
  loading: boolean;
  ready: boolean; // session checked AND, if logged in, role and MFA status loaded
  canWrite: boolean; // UI hint only. Row Level Security is what actually enforces it.
  mfaRequired: boolean; // signed in with a password, but the second factor is still to be entered
  mfaEnabled: boolean; // this account has an authenticator app set up
  refreshMfa: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null, role: null, loading: true, ready: false, canWrite: false,
  mfaRequired: false, mfaEnabled: false, refreshMfa: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleUserId, setRoleUserId] = useState<string | null>(null);
  const [mfa, setMfa] = useState<{ userId: string; required: boolean; enabled: boolean } | null>(null);

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
      setRoleUserId(null);
      return;
    }
    const uid = session.user.id;
    supabase.from("profiles").select("role").eq("id", uid).single()
      .then(
        ({ data }) => {
          setRole((data?.role as Role) ?? null);
          setRoleUserId(uid);
        },
        () => setRoleUserId(uid), // network failure: don't block the app forever
      );
  }, [session]);

  // "aal1" = password only, "aal2" = password plus a second factor.
  // A person with an authenticator set up (nextLevel aal2) who is still at aal1 must enter a code.
  const checkMfa = useCallback(async (uid: string) => {
    try {
      const [aal, factors] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      setMfa({
        userId: uid,
        required: aal.data?.currentLevel === "aal1" && aal.data?.nextLevel === "aal2",
        enabled: (factors.data?.totp ?? []).length > 0,
      });
    } catch {
      setMfa({ userId: uid, required: false, enabled: false }); // the database policy still protects the data
    }
  }, []);

  useEffect(() => {
    if (!session) {
      setMfa(null);
      return;
    }
    void checkMfa(session.user.id);
  }, [session, checkMfa]);

  const refreshMfa = useCallback(async () => {
    if (session) await checkMfa(session.user.id);
  }, [session, checkMfa]);

  const mine = session !== null && mfa !== null && mfa.userId === session.user.id;
  const ready = !loading && (!session || (roleUserId === session.user.id && mine));
  const canWrite = role === "admin" || role === "analyst";

  return (
    <AuthContext.Provider
      value={{
        session, role, loading, ready, canWrite,
        mfaRequired: mine && (mfa as { required: boolean }).required,
        mfaEnabled: mine && (mfa as { enabled: boolean }).enabled,
        refreshMfa,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);