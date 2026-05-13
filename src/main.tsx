import { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

function Root() {
  const [user, setUser] = useState<any>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/auth/user", { credentials: "include" })
      .then((r) => {
        if (r.ok) return r.json();
        return null;
      })
      .then((u) => {
        setUser(u);
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#2d5016] flex items-center justify-center">
        <div className="text-white text-lg font-bold animate-pulse">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#2d5016] flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-white/10 rounded-full blur-3xl" />
        <div className="w-full max-w-md relative z-10 text-center">
          <div className="w-24 h-24 bg-black rounded-[32px] flex items-center justify-center mx-auto shadow-2xl mb-6 overflow-hidden border border-white/10">
            <div className="flex items-baseline font-sans font-black tracking-tighter text-3xl">
              <span className="text-white">RA</span>
              <span className="bg-gradient-to-br from-amber-200 via-amber-500 to-amber-700 bg-clip-text text-transparent">
                1M
              </span>
            </div>
          </div>
          <h1 className="text-4xl font-display font-bold text-white italic tracking-tight mb-2">
            Rumo ao Milhão
          </h1>
          <p className="text-[10px] uppercase font-bold text-white/40 tracking-[0.3em] mb-10">
            Painel de Controle Imobiliário
          </p>
          <div className="bg-white/95 backdrop-blur-xl p-10 rounded-[40px] shadow-2xl border border-white/20">
            <p className="text-slate-600 text-sm font-medium mb-8">
              Acesse o sistema com sua conta para gerenciar seus empreendimentos, clientes e vendas.
            </p>
            <a
              href="/api/login"
              className="block w-full h-16 bg-[#2d5016] text-white rounded-2xl text-xs uppercase tracking-[0.2em] font-black shadow-xl shadow-[#2d5016]/20 hover:bg-[#1a300d] transition-all transform hover:-translate-y-1 leading-[4rem]"
            >
              Entrar no Sistema
            </a>
          </div>
          <div className="flex justify-center items-center gap-4 mt-10">
            <div className="h-px w-8 bg-white/10" />
            <p className="text-[9px] font-bold text-white/30 uppercase tracking-[0.3em]">
              &copy; 2026 Rumo ao Milhão
            </p>
            <div className="h-px w-8 bg-white/10" />
          </div>
        </div>
      </div>
    );
  }

  return <App onLogout={handleLogout} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Root />);
