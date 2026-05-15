import { useState } from "react";
import { motion } from "motion/react";
import { Building2, Lock, Mail, ShieldCheck } from "lucide-react";

export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch {
        throw new Error("Servidor indisponível. Tente novamente mais tarde.");
      }
      if (!res.ok) throw new Error(data.error || "Erro ao autenticar.");
      onLogin();
    } catch (err: any) {
      setError(err.message || "Erro ao autenticar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="space-y-2">
          <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">
            Acesso do Corretor
          </label>
          <div className="relative">
            <Building2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              type="email"
              className="w-full h-14 pl-12 pr-4 bg-slate-50 border-none rounded-2xl text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-[#1c1c1e]/20 transition-all"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoComplete="email"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">
            Senha
          </label>
          <div className="relative">
            <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              type="password"
              className="w-full h-14 pl-12 pr-4 bg-slate-50 border-none rounded-2xl text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-[#1c1c1e]/20 transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>
        </div>

        <ErrorBox message={error} />

        <button
          type="submit"
          disabled={loading}
          className="w-full h-16 bg-[#1c1c1e] text-white rounded-2xl text-xs uppercase tracking-[0.2em] font-black shadow-xl shadow-black/30 hover:bg-[#2c2c2e] transition-all transform hover:-translate-y-1 active:scale-95"
        >
          {loading ? "Aguarde..." : "Entrar no Sistema"}
        </button>
      </form>
    </AuthLayout>
  );
}

export function SetupScreen({ onSetupComplete }: { onSetupComplete: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch {
        throw new Error("Servidor indisponível. Verifique as variáveis de ambiente.");
      }
      if (!res.ok) throw new Error(data.error || "Erro ao criar administrador.");
      setDone(true);
      setTimeout(() => onSetupComplete(), 1800);
    } catch (err: any) {
      setError(err.message || "Erro ao configurar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      badge={
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest mb-4">
          <ShieldCheck size={12} /> Primeiro Acesso
        </span>
      }
    >
      {done ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-8 space-y-3"
        >
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck size={32} className="text-emerald-600" />
          </div>
          <p className="font-black text-slate-800 text-lg">Administrador criado!</p>
          <p className="text-sm text-slate-400">Redirecionando para o login...</p>
        </motion.div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest text-center -mt-2">
            Configure sua conta de administrador
          </p>

          <div className="space-y-2">
            <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">
              E-mail do Administrador
            </label>
            <div className="relative">
              <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                type="email"
                className="w-full h-14 pl-12 pr-4 bg-slate-50 border-none rounded-2xl text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-[#1c1c1e]/20 transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@email.com"
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">
              Senha
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                type="password"
                className="w-full h-14 pl-12 pr-4 bg-slate-50 border-none rounded-2xl text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-[#1c1c1e]/20 transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">
              Confirmar Senha
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                type="password"
                className="w-full h-14 pl-12 pr-4 bg-slate-50 border-none rounded-2xl text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-[#1c1c1e]/20 transition-all"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          <ErrorBox message={error} />

          <button
            type="submit"
            disabled={loading}
            className="w-full h-16 bg-[#1c1c1e] text-white rounded-2xl text-xs uppercase tracking-[0.2em] font-black shadow-xl shadow-black/30 hover:bg-[#2c2c2e] transition-all transform hover:-translate-y-1 active:scale-95"
          >
            {loading ? "Criando..." : "Criar Administrador"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="bg-red-50 text-red-600 p-4 rounded-xl text-[10px] font-bold uppercase tracking-widest text-center border border-red-100"
    >
      {message}
    </motion.div>
  );
}

function AuthLayout({ children, badge }: { children: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#1c1c1e] flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-white/3 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-white/3 rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-10">
          <div className="w-24 h-24 bg-black rounded-[32px] flex items-center justify-center mx-auto shadow-2xl mb-6 group transition-transform hover:rotate-12 overflow-hidden border border-white/10">
            <div className="flex items-baseline font-sans font-black tracking-tighter text-3xl">
              <span className="text-white">RA</span>
              <span className="bg-gradient-to-br from-amber-200 via-amber-500 to-amber-700 bg-clip-text text-transparent">
                1M
              </span>
            </div>
          </div>
          <h1 className="text-4xl font-display font-bold text-white italic tracking-tight">
            Rumo ao Milhão
          </h1>
          <p className="text-[10px] uppercase font-bold text-white/40 mt-3 tracking-[0.3em]">
            Painel de Controle Imobiliário
          </p>
        </div>

        <div className="bg-white/95 backdrop-blur-xl p-8 sm:p-12 rounded-[40px] shadow-2xl border border-white/10">
          {badge && <div className="flex justify-center mb-2">{badge}</div>}
          {children}
        </div>

        <div className="flex justify-center items-center gap-4 mt-10">
          <div className="h-px w-8 bg-white/10" />
          <p className="text-[9px] font-bold text-white/30 uppercase tracking-[0.3em]">
            &copy; 2026 Rumo ao Milhão
          </p>
          <div className="h-px w-8 bg-white/10" />
        </div>
      </motion.div>
    </div>
  );
}
