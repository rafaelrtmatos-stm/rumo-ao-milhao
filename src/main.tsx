import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// ── AUTH DESATIVADO ────────────────────────────────────────────────────────────
// Para reativar o login, descomente o bloco abaixo e comente o render simples.
//
// import { useState, useEffect } from "react";
// import { LoginScreen, SetupScreen } from "./auth";
//
// interface UserInfo { id: string; email: string; isAdmin: boolean; }
//
// async function checkSession(): Promise<UserInfo | null> {
//   try {
//     const res = await fetch("/api/auth/user");
//     if (!res.ok) return null;
//     return await res.json();
//   } catch { return null; }
// }
//
// async function checkSetup(): Promise<boolean> {
//   try {
//     const controller = new AbortController();
//     const timer = setTimeout(() => controller.abort(), 5000);
//     const res = await fetch("/api/auth/setup", { signal: controller.signal });
//     clearTimeout(timer);
//     if (!res.ok) return false;
//     const data = await res.json();
//     return data.needsSetup === true;
//   } catch { return false; }
// }
//
// function Root() {
//   const [user, setUser] = useState<UserInfo | null>(null);
//   const [needsSetup, setNeedsSetup] = useState(false);
//   const [checking, setChecking] = useState(true);
//
//   useEffect(() => {
//     (async () => {
//       const [u, setup] = await Promise.all([checkSession(), checkSetup()]);
//       setUser(u);
//       setNeedsSetup(setup);
//       setChecking(false);
//     })();
//   }, []);
//
//   const handleLogout = async () => {
//     await fetch("/api/auth/logout", { method: "POST" });
//     setUser(null);
//   };
//
//   const handleLogin = async () => {
//     const u = await checkSession();
//     setUser(u);
//   };
//
//   const handleSetupComplete = () => setNeedsSetup(false);
//
//   if (checking) return <div style={{ background: "#1c1c1e", minHeight: "100vh" }} />;
//   if (needsSetup) return <SetupScreen onSetupComplete={handleSetupComplete} />;
//   if (!user) return <LoginScreen onLogin={handleLogin} />;
//   return <App onLogout={handleLogout} isAdmin={user.isAdmin} />;
// }
//
// ReactDOM.createRoot(document.getElementById("root")!).render(<Root />);
// ──────────────────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById("root")!).render(
  <App onLogout={() => {}} isAdmin={true} />
);
