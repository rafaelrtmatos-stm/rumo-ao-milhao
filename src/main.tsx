import { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LoginScreen } from "./auth";
import "./index.css";

interface UserInfo {
  id: string;
  email: string;
  isAdmin: boolean;
}

async function checkSession(): Promise<UserInfo | null> {
  try {
    const res = await fetch("/api/auth/user");
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function Root() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkSession().then((u) => {
      setUser(u);
      setChecking(false);
    });
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  };

  const handleLogin = async () => {
    const u = await checkSession();
    setUser(u);
  };

  if (checking) return null;
  if (!user) return <LoginScreen onLogin={handleLogin} />;
  return <App onLogout={handleLogout} isAdmin={user.isAdmin} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Root />);
