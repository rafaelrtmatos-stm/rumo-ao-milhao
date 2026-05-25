import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LoginScreen, SetupScreen } from "./auth";
import "./index.css";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
// Fix Vite/Webpack: ícones padrão do Leaflet não carregam sem isso
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});
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
const OFFLINE_USER_KEY = "rumo_offline_user";

function saveOfflineUser(user: { id: string; email: string; isAdmin: boolean; permissions: Record<string, boolean> }) {
  try { localStorage.setItem(OFFLINE_USER_KEY, JSON.stringify(user)); } catch {}
}

function getOfflineUser(): { id: string; email: string; isAdmin: boolean; permissions: Record<string, boolean> } | null {
  try {
    const raw = localStorage.getItem(OFFLINE_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

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
    const token = getAuthToken();
    const offlineUser = getOfflineUser();

    // ── BYPASS OFFLINE ────────────────────────────────────────────────────────
    // Se estiver offline E tiver sessão salva → acesso imediato sem pedir senha
    if (isOffline()) {
      if (token && offlineUser) {
        console.log("[auth] Offline com sessão salva — acesso direto");
        setAuth({
          status: "authenticated",
          isAdmin: offlineUser.isAdmin,
          userId: offlineUser.id,
          email: offlineUser.email,
          permissions: offlineUser.permissions,
        });
        return;
      }
      // Offline sem sessão → mostra login (não pode autenticar sem internet)
      setAuth({ status: "login" });
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    try {
      // 1. Verificar se precisa de setup (com timeout curto)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      let setupRes: Response | null = null;
      try {
        setupRes = await fetch("/api/auth/setup", { signal: controller.signal });
      } catch { /* rede lenta ou offline — ignorar setup check */ }
      clearTimeout(timeout);

      if (setupRes?.ok) {
        const { needsSetup } = await setupRes.json();
        if (needsSetup) {
          setAuth({ status: "setup" });
          return;
        }
      }

      // 2. Sem token → login
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
          // Salvar perfil para uso offline futuro
          saveOfflineUser({ id: user.id, email: user.email ?? "", isAdmin: user.isAdmin ?? false, permissions: user.permissions ?? {} });
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

      // 5xx ou erro de rede → se tem sessão offline salva, usar
      if (token && offlineUser) {
        console.log("[auth] Erro de servidor — usando sessão offline salva");
        setAuth({
          status: "authenticated",
          isAdmin: offlineUser.isAdmin,
          userId: offlineUser.id,
          email: offlineUser.email,
          permissions: offlineUser.permissions,
        });
        return;
      }

      setAuth({ status: "login" });
    } catch {
      // Erro de rede — usar sessão offline se disponível
      if (token && offlineUser) {
        console.log("[auth] Sem rede — usando sessão offline salva");
        setAuth({
          status: "authenticated",
          isAdmin: offlineUser.isAdmin,
          userId: offlineUser.id,
          email: offlineUser.email,
          permissions: offlineUser.permissions,
        });
        return;
      }
      setAuth({ status: "login" });
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
        // Salvar perfil para uso offline
        saveOfflineUser({ id: user.id, email: user.email ?? "", isAdmin: user.isAdmin ?? false, permissions: user.permissions ?? {} });
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
      saveOfflineUser({ id: loginData.id, email: loginData.email ?? "", isAdmin: loginData.isAdmin ?? false, permissions: loginData.permissions ?? {} });
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
    try { localStorage.removeItem(OFFLINE_USER_KEY); } catch {}
    setAuth({ status: "login" });
  };

  if (auth.status === "loading") {
    // Manter tela verde enquanto verifica autenticação — sem piscar
    return (
      <div ref={(el) => { if (el) document.getElementById("root")?.classList.add("ready"); }}
        style={{ minHeight: "100vh", background: "#0d200d" }} />
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
