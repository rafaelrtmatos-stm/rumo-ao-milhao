import { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LoginScreen, supabase } from "./auth";
import "./index.css";

function Root() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setLoggedIn(!!data.session);
      setChecking(false);
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setLoggedIn(false);
  };

  if (checking) return null;
  if (!loggedIn) return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  return <App onLogout={handleLogout} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Root />);
