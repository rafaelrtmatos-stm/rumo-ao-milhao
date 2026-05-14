import { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao entrar. Verifique suas credenciais.");
      } else {
        onLogin();
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#2d5016] flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-white/5 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-white/10 rounded-full blur-3xl" />
      <div className="w-full max-w-md relative z-10 text-center">
        <div className="w-24 h-24 bg-black rounded-[32px] flex items-center justify-center mx-auto shadow-2xl mb-6 overflow-hidden border border-white/10">
          <div className="flex items-baseline font-sans font-black tracking-tighter text-3xl">
            <span className="text-white">RA</span>
            <span className="bg-gradient-to-br from-amber-200 via-amber-500 to-amber-700 bg-clip-text text-transparent">1M</span>
          </div>
        </div>
        <h1 className="text-4xl font-display font-bold text-white italic tracking-tight mb-2">Rumo ao Milhão</h1>
        <p className="text-[10px] uppercase font-bold text-white/40 tracking-[0.3em] mb-10">Painel de Controle Imobiliário</p>

        <div className="bg-white/95 backdrop-blur-xl p-10 rounded-[40px] shadow-2xl border border-white/20">
          <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl mb-8">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${mode === m ? "bg-white shadow text-[#2d5016]" : "text-slate-400"}`}
              >
                {m === "login" ? "Entrar" : "Criar Conta"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="text-left">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">E-mail</label>
              <input
                type="email"
                required
                autoComplete="email"
                className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-[#2d5016]/20 focus:border-[#2d5016] outline-none transition-all"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="text-left">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Senha</label>
              <input
                type="password"
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-[#2d5016]/20 focus:border-[#2d5016] outline-none transition-all"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
              />
            </div>

            {error && (
              <p className="text-red-500 text-xs font-semibold text-left px-1">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-[#2d5016] text-white rounded-2xl text-xs uppercase tracking-[0.2em] font-black shadow-xl shadow-[#2d5016]/20 hover:bg-[#1a300d] transition-all transform hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Aguarde..." : mode === "login" ? "Entrar no Sistema" : "Criar Conta"}
            </button>
          </form>
        </div>

        <div className="flex justify-center items-center gap-4 mt-10">
          <div className="h-px w-8 bg-white/10" />
          <p className="text-[9px] font-bold text-white/30 uppercase tracking-[0.3em]">&copy; 2026 Rumo ao Milhão</p>
          <div className="h-px w-8 bg-white/10" />
        </div>
      </div>
    </div>
  );
}

function Root() {
  const [user, setUser] = useState<any>(null);
  const [checking, setChecking] = useState(true);

  const checkAuth = () => {
    fetch("/api/auth/user", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => { setUser(u); setChecking(false); })
      .catch(() => setChecking(false));
  };

  useEffect(() => { checkAuth(); }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#2d5016] flex items-center justify-center">
        <div className="text-white text-lg font-bold animate-pulse">Carregando...</div>
      </div>
    );
  }

  if (!user) return <LoginScreen onLogin={checkAuth} />;

  return <App onLogout={handleLogout} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Root />);
