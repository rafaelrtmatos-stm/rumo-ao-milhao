import { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LoginScreen } from "./auth";
import "./index.css";

async function checkSession(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/user", { credentials: "include" });
    return res.ok;
  } catch {
    return false;
  }
}

async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}

function Root() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkSession().then((ok) => {
      setLoggedIn(ok);
      setChecking(false);
    });
  }, []);

  const handleLogout = async () => {
    await logout();
    setLoggedIn(false);
  };

  if (checking) return null;
  if (!loggedIn) return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  return <App onLogout={handleLogout} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Root />);
