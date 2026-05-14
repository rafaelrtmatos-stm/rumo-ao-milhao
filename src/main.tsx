import { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LoginScreen } from "./auth";
import "./index.css";

function Root() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/auth/user", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        setUser(u || null);
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  };

  if (checking) return null;
  if (!user) return <LoginScreen onLogin={(u) => setUser(u)} />;
  return <App onLogout={handleLogout} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Root />);
