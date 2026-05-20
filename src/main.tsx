import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LoginScreen, SetupScreen } from "./auth";
import "./index.css";
import { initSyncListeners } from "./syncService";

// Inicializa listeners de sync offline/online ao carregar o app
initSyncListeners();

// Seções disponíveis no sistema
export const ALL_SECTIONS = [
  "dashboard",
  "vendas",
  "empreendimentos",
  "proprietarios",
  "contratos",
  "clientes",
  "aniversarios",
  "calculadora",
  "config",
  "usuarios",
] as const;

// Permissões padrão para usuários não-admin
export const DEFAULT_NON_ADMIN_PERMISSIONS: Record<string, boolean> = {
  dashboard: true,
  vendas: true,
  empreendimentos: false,
  proprietarios: false,
  contratos: true,
  clientes: true,
  aniversarios: true,
  calculadora: true,
  config: false,
  usuarios: true,
};

// ── JWT helpers ───────────────────────────────────────────────────────────────
const TOKEN_KEY = "rumo_auth_token";

export function getAuthToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setAuthToken(token: string) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
}

export function clearAuthToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

export { authFetch } from "./lib/authFetch";
// ─────────────────────────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: "monospace", background: "#fff1f1", minHeight: "100vh" }}>
          <h2 style={{ color: "#c00", marginBottom: 16 }}>Erro no app — copie e envie para suporte:</h2>
          <pre style={{ background: "#fff", border: "1px solid #fcc", padding: 16, borderRadius: 8, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 16, padding: "8px 24px", background: "#c00", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

type AuthState =
  | { status: "loading" }
  | { status: "setup" }
  | { status: "login" }
  | { status: "authenticated"; isAdmin: boolean; userId: string; email: string; permissions: Record<string, boolean> };

function Root() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });

  const checkAuth = async () => {
    try {
      // 1. Verificar se precisa de setup
      const setupRes = await fetch("/api/auth/setup");
      if (setupRes.ok) {
        const { needsSetup } = await setupRes.json();
        if (needsSetup) {
          setAuth({ status: "setup" });
          return;
        }
      }

      // 2. Token JWT salvo no localStorage
      const token = getAuthToken();
      if (!token) {
        setAuth({ status: "login" });
        return;
      }

      // 3. Validar token com o servidor
      const userRes = await fetch("/api/auth/user", {
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      if (userRes.ok) {
        const user = await userRes.json();
        if (user?.id) {
          setAuth({
            status: "authenticated",
            isAdmin: user.isAdmin ?? false,
            userId: user.id,
            email: user.email ?? "",
            permissions: user.permissions ?? {},
          });
          return;
        }
      }

      // 401 explícito = token inválido → limpar e ir para login
      if (userRes.status === 401) {
        clearAuthToken();
        setAuth({ status: "login" });
        return;
      }

      // Erro de rede ou 5xx → não deslogar, tentar manter sessão
      setAuth({ status: "login" });
    } catch {
      // Erro de rede — se tinha token, não deslogar
      const token = getAuthToken();
      if (token) {
        setAuth({ status: "login" });
      } else {
        setAuth({ status: "login" });
      }
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const handleLogin = async (loginData?: any) => {
    // Salva o token JWT retornado pelo servidor
    if (loginData?.token) {
      setAuthToken(loginData.token);
    }
    // Busca dados atualizados do usuário
    try {
      const res = await authFetch("/api/auth/user");
      if (res.ok) {
        const user = await res.json();
        setAuth({
          status: "authenticated",
          isAdmin: user.isAdmin ?? false,
          userId: user.id,
          email: user.email ?? "",
          permissions: user.permissions ?? {},
        });
        return;
      }
    } catch {}
    // Fallback: usa os dados que vieram do login diretamente
    if (loginData?.id) {
      setAuth({
        status: "authenticated",
        isAdmin: loginData.isAdmin ?? false,
        userId: loginData.id,
        email: loginData.email ?? "",
        permissions: loginData.permissions ?? {},
      });
    } else {
      setAuth({ status: "login" });
    }
  };

  const handleLogout = async () => {
    try {
      await authFetch("/api/auth/logout", { method: "POST" });
    } catch {}
    clearAuthToken();
    setAuth({ status: "login" });
  };

  if (auth.status === "loading") {
    return (
      <div style={{ minHeight: "100vh", background: "#1c1c1e", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.3)", fontWeight: 700, letterSpacing: "0.2em", fontSize: 12, textTransform: "uppercase" }}>
          Carregando...
        </p>
      </div>
    );
  }

  if (auth.status === "setup") {
    return <SetupScreen onSetupComplete={() => setAuth({ status: "login" })} />;
  }

  if (auth.status === "login") {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // Permissões efetivas
  const effectivePermissions: Record<string, boolean> = auth.isAdmin
    ? Object.fromEntries(ALL_SECTIONS.map((s) => [s, true]))
    : { ...DEFAULT_NON_ADMIN_PERMISSIONS, ...auth.permissions };

  return (
    <App
      onLogout={handleLogout}
      isAdmin={auth.isAdmin}
      userId={auth.userId}
      userEmail={auth.email}
      userPermissions={effectivePermissions}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <Root />
  </ErrorBoundary>
);
