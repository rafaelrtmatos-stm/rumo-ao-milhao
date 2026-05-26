import { useState } from "react";

export default function BussolaInterativa() {
  const [rotacao, setRotacao] = useState(0);
  const [arrastando, setArrastando] = useState(false);

  const calcAngulo = (clientX: number, clientY: number, rect: DOMRect) => {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI) + 90;
    return Math.round((angle + 360) % 360);
  };

  return (
    <div style={{
      position: 'absolute', top: 58, right: 12, zIndex: 20,
      background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)',
      borderRadius: 999, padding: 8,
      boxShadow: '0 2px 16px rgba(0,0,0,0.18)',
      border: '1px solid rgba(255,255,255,0.8)',
      userSelect: 'none', touchAction: 'none',
    }}>
      <svg
        width={80} height={80} viewBox="0 0 100 100"
        style={{ cursor: arrastando ? 'grabbing' : 'grab', display: 'block', touchAction: 'none' }}
        onMouseDown={() => setArrastando(true)}
        onMouseUp={() => setArrastando(false)}
        onMouseLeave={() => setArrastando(false)}
        onMouseMove={e => { if (!arrastando) return; setRotacao(calcAngulo(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())); }}
        onTouchStart={e => { e.stopPropagation(); setArrastando(true); }}
        onTouchEnd={e => { e.stopPropagation(); setArrastando(false); }}
        onTouchMove={e => {
          e.stopPropagation();
          const t = e.touches[0];
          setRotacao(calcAngulo(t.clientX, t.clientY, e.currentTarget.getBoundingClientRect()));
        }}
      >
        {/* Círculo externo */}
        <circle cx="50" cy="50" r="48" fill="rgba(255,255,255,0.0)" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>

        {/* Pontos cardeais */}
        <text x="50" y="11" textAnchor="middle" fontSize="11" fontWeight="900" fill="#1a4a1a">N</text>
        <text x="50" y="97" textAnchor="middle" fontSize="10" fontWeight="700" fill="#64748b">S</text>
        <text x="96" y="54" textAnchor="middle" fontSize="10" fontWeight="700" fill="#64748b">L</text>
        <text x="4" y="54" textAnchor="middle" fontSize="10" fontWeight="700" fill="#64748b">O</text>

        {/* Linhas guia */}
        <line x1="50" y1="16" x2="50" y2="22" stroke="#1a4a1a" strokeWidth="1.5"/>
        <line x1="50" y1="78" x2="50" y2="84" stroke="#94a3b8" strokeWidth="1"/>
        <line x1="16" y1="50" x2="22" y2="50" stroke="#94a3b8" strokeWidth="1"/>
        <line x1="78" y1="50" x2="84" y2="50" stroke="#94a3b8" strokeWidth="1"/>

        {/* Agulha rotacionável */}
        <g transform={`rotate(${rotacao}, 50, 50)`}>
          {/* Norte — vermelho */}
          <polygon points="50,16 46,50 54,50" fill="#dc2626"/>
          <polygon points="50,16 50,50 54,50" fill="#b91c1c"/>
          {/* Sul — branco/cinza */}
          <polygon points="50,84 46,50 54,50" fill="#e2e8f0"/>
          <polygon points="50,84 50,50 54,50" fill="#cbd5e1"/>
          {/* Centro */}
          <circle cx="50" cy="50" r="6" fill="white" stroke="#1a4a1a" strokeWidth="2"/>
          <circle cx="50" cy="50" r="2.5" fill="#1a4a1a"/>
        </g>
      </svg>
    </div>
  );
}
