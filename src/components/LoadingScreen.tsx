import { useEffect, useState, useRef } from "react";

interface Props {
  progress: number; // 0-100
}

// Formata valor em reais
function formatBRL(val: number): string {
  if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toFixed(val >= 999_999 ? 0 : 2).replace('.', ',')} milhão`;
  if (val >= 1_000) return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function LoadingScreen({ progress }: Props) {
  const [displayValue, setDisplayValue] = useState(1);
  const [animDone, setAnimDone] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const DURATION = 5500; // 5.5s de animação
  const TARGET = 1_000_000;

  useEffect(() => {
    // Animação easing: começa devagar, acelera no meio, desacelera no fim
    const animate = (timestamp: number) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const t = Math.min(elapsed / DURATION, 1);

      // Curva ease-in-out-cubic
      const ease = t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const value = Math.round(1 + ease * (TARGET - 1));
      setDisplayValue(value);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setAnimDone(true);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const pct = Math.max(progress, animDone ? 100 : Math.round((displayValue / TARGET) * 100));

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0d200d]"
      style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Partículas de dinheiro */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={i}
            className="absolute text-2xl select-none"
            style={{
              left: `${5 + (i * 5.5) % 90}%`,
              top: `-${10 + (i * 7) % 30}%`,
              animation: `fall ${3 + (i % 4)}s linear ${(i * 0.3) % 2}s infinite`,
              opacity: 0.15 + (i % 3) * 0.1,
            }}
          >
            {["💵", "💰", "🤑", "💴", "💸"][i % 5]}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 0.2; }
          80% { opacity: 0.3; }
          100% { transform: translateY(110vh) rotate(360deg); opacity: 0; }
        }
        @keyframes pulse-glow {
          0%, 100% { text-shadow: 0 0 20px rgba(74,222,128,0.3); }
          50% { text-shadow: 0 0 40px rgba(74,222,128,0.8); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      {/* Logo */}
      <div className="relative z-10 flex flex-col items-center gap-8 px-8 w-full max-w-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-3xl bg-[#1a4a1a] border-2 border-emerald-700/50 shadow-2xl flex items-center justify-center">
            <img src="/icon-192x192.png" alt="RA1M" className="w-14 h-14 rounded-2xl" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black text-white italic tracking-tight">Rumo ao Milhão</h1>
            <p className="text-[11px] text-emerald-400/70 uppercase tracking-widest font-bold mt-0.5">Sistema Imobiliário</p>
          </div>
        </div>

        {/* Contador de dinheiro */}
        <div className="w-full text-center space-y-1">
          <div
            className="text-4xl sm:text-5xl font-black tabular-nums"
            style={{
              background: "linear-gradient(90deg, #4ade80, #86efac, #4ade80, #22c55e)",
              backgroundSize: "200% auto",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              animation: "shimmer 1.5s linear infinite, pulse-glow 2s ease-in-out infinite",
            }}
          >
            {formatBRL(displayValue)}
          </div>
          {animDone && (
            <p className="text-emerald-400 text-sm font-black animate-bounce">
              🎯 1 Milhão!
            </p>
          )}
        </div>

        {/* Barra de progresso */}
        <div className="w-full space-y-2">
          <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(90deg, #166534, #22c55e, #4ade80)",
                boxShadow: "0 0 12px rgba(74,222,128,0.6)",
              }}
            />
            {/* Shimmer na barra */}
            <div
              className="absolute inset-y-0 left-0 w-full rounded-full"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1s linear infinite",
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-bold">
            <span className="text-white/40">R$ 1,00</span>
            <span className="text-emerald-400/70 font-black">
              {progress < 35 ? "Carregando empreendimentos..." :
               progress < 60 ? "Carregando clientes..." :
               progress < 80 ? "Carregando vendas..." :
               progress < 95 ? "Carregando configurações..." :
               "Finalizando..."}
            </span>
            <span className="text-emerald-400">R$ 1M</span>
          </div>
        </div>

        {/* Porcentagem */}
        <div className="text-white/30 text-xs font-bold tabular-nums">
          {pct}%
        </div>
      </div>
    </div>
  );
}
