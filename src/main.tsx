import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { LoginScreen, SetupScreen } from "./auth";
import { setAuthToken } from "./dbService";

type AuthState = "loading" | "setup" | "login" | "authenticated";

function Root() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [user, setUser] = useState<{ id: string; email: string; isAdmin: boolean } | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem("auth_token");
    if (storedToken) {
      setAuthToken(storedToken);
    }
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const setupRes = await fetch("/api/auth/setup");
      const setupData = await setupRes.json();
      if (setupData.needsSetup) {
        setAuthState("setup");
        return;
      }

      const token = localStorage.getItem("auth_token");
      if (!token) {
        setAuthState("login");
        return;
      }

      const res = await fetch("/api/auth/user", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        setAuthState("authenticated");
      } else {
        localStorage.removeItem("auth_token");
        setAuthToken(null);
        setAuthState("login");
      }
    } catch {
      setAuthState("login");
    }
  }

  function handleLogin(data: any) {
    if (data.token) {
      localStorage.setItem("auth_token", data.token);
      setAuthToken(data.token);
    }
    setUser({ id: data.id, email: data.email, isAdmin: data.isAdmin ?? false });
    setAuthState("authenticated");
  }

  function handleLogout() {
    localStorage.removeItem("auth_token");
    setAuthToken(null);
    setUser(null);
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setAuthState("login");
  }

  if (authState === "loading") {
    return (
      <div className="min-h-screen bg-[#1c1c1e] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (authState === "setup") {
    return <SetupScreen onSetupComplete={() => setAuthState("login")} />;
  }

  if (authState === "login") {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return <App onLogout={handleLogout} isAdmin={user?.isAdmin ?? false} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
