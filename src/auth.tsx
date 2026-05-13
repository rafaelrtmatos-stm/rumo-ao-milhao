import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export { supabase };

export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError("Email ou senha incorretos");
    } else {
      onLogin();
    }
    setLoading(false);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#0f172a",
      }}
    >
      <div
        style={{
          background: "#1e293b",
          padding: "2rem",
          borderRadius: "1rem",
          width: "100%",
          maxWidth: "400px",
          boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
        }}
      >
        <h1
          style={{
            color: "#f59e0b",
            textAlign: "center",
            marginBottom: "0.5rem",
          }}
        >
          🏠 Rumo ao Milhão
        </h1>
        <p
          style={{
            color: "#94a3b8",
            textAlign: "center",
            marginBottom: "2rem",
          }}
        >
          Faça login para continuar
        </p>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: "100%",
            padding: "0.75rem",
            marginBottom: "1rem",
            borderRadius: "0.5rem",
            border: "1px solid #334155",
            background: "#0f172a",
            color: "#fff",
            boxSizing: "border-box",
          }}
        />
        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          style={{
            width: "100%",
            padding: "0.75rem",
            marginBottom: "1rem",
            borderRadius: "0.5rem",
            border: "1px solid #334155",
            background: "#0f172a",
            color: "#fff",
            boxSizing: "border-box",
          }}
        />
        {error && (
          <p style={{ color: "#ef4444", marginBottom: "1rem" }}>{error}</p>
        )}
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: "100%",
            padding: "0.75rem",
            borderRadius: "0.5rem",
            background: "#f59e0b",
            color: "#000",
            fontWeight: "bold",
            border: "none",
            cursor: "pointer",
            fontSize: "1rem",
          }}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </div>
    </div>
  );
}
