import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { motion } from "motion/react";
import { Building2, Lock } from "lucide-react";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError("Credenciais inválidas. Verifique seu email e senha.");
    } else {
      onLogin();
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#2d5016] flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-white/5 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-primary-main/20 rounded-full blur-3xl" />

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

        <div className="bg-white/95 backdrop-blur-xl p-8 sm:p-12 rounded-[40px] shadow-2xl border border-white/20">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">
                Acesso do Corretor
              </label>
              <div className="relative">
                <Building2
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"
                />
                <input
                  type="email"
                  className="w-full h-14 pl-12 pr-4 bg-slate-50 border-none rounded-2xl text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-[#2d5016]/20 transition-all"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">
                Senha Segura
              </label>
              <div className="relative">
                <Lock
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"
                />
                <input
                  type="password"
                  className="w-full h-14 pl-12 pr-4 bg-slate-50 border-none rounded-2xl text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-[#2d5016]/20 transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="bg-red-50 text-red-600 p-4 rounded-xl text-[10px] font-bold uppercase tracking-widest text-center border border-red-100"
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-16 bg-[#2d5016] text-white rounded-2xl text-xs uppercase tracking-[0.2em] font-black shadow-xl shadow-[#2d5016]/20 hover:bg-[#1a300d] transition-all transform hover:-translate-y-1 active:scale-95"
            >
              {loading ? "Entrando..." : "Entrar no Sistema"}
            </button>
          </form>
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
