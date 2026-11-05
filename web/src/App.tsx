import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { SettingsProvider } from "./lib/settings";
import Layout from "./components/Layout";
import Preloader from "./components/Preloader";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Incidents from "./pages/Incidents";
import IncidentDetail from "./pages/IncidentDetail";
import Alerts from "./pages/Alerts";
import Events from "./pages/Events";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Team from "./pages/Team";

// Everything inside this route requires a logged-in user.
function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading...
      </div>
    );
  }
  return session ? <Layout /> : <Navigate to="/login" replace />;
}

// The preloader plays every time the site loads (first visit and browser refresh).
// Clicking between pages inside the app does not reload anything, so it does not replay.
// The routes render underneath it, so data starts loading while it plays.
function Shell() {
  const { loading, ready: authReady } = useAuth();
  const [showIntro, setShowIntro] = useState(true);
  // Safety net: the preloader can never trap the app, even if loading hangs.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!showIntro) return;
    const t = setTimeout(() => setTimedOut(true), 6000);
    return () => clearTimeout(t);
  }, [showIntro]);
  const ready = authReady || timedOut;
  const finishIntro = useCallback(() => setShowIntro(false), []);

  const progress = ready ? 100 : !loading ? 70 : 20;
  const label = ready ? "System ready" : !loading ? "Loading operator profile" : "Establishing secure session";

  return (
    <>
      {showIntro && <Preloader progress={progress} label={label} ready={ready} onDone={finishIntro} />}
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/incidents" element={<Incidents />} />
            <Route path="/incidents/:id" element={<IncidentDetail />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/events" element={<Events />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/team" element={<Team />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </SettingsProvider>
  );
}