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
      position: 'absolute', top: 60, right: 12, zIndex: 20,
      background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)',
      borderRadius: 18, padding: '10px 12px 8px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      border: '1px solid rgba(0,0,0,0.07)',
      userSelect: 'none', touchAction: 'none',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      minWidth: 88,
    }}>
      <p style={{fontSize:8, fontWeight:900, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1.5, margin:0}}>
        Bússola
      </p>

      <svg
        width={72} height={72} viewBox="0 0 100 100"
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
        {/* Base */}
        <circle cx="50" cy="50" r="46" fill="white" stroke="#e2e8f0" strokeWidth="1.5"/>
        <circle cx="50" cy="50" r="40" fill="#f8fafc" stroke="#f1f5f9" strokeWidth="1"/>

        {/* Pontos cardeais — fixos */}
        <text x="50" y="13" textAnchor="middle" fontSize="11" fontWeight="900" fill="#1a4a1a">N</text>
        <text x="50" y="93" textAnchor="middle" fontSize="10" fill="#94a3b8" dominantBaseline="auto">S</text>
        <text x="92" y="54" textAnchor="end" fontSize="10" fill="#94a3b8">L</text>
        <text x="8" y="54" textAnchor="start" fontSize="10" fill="#94a3b8">O</text>

        {/* Sol ☀️ fixo no Oeste */}
        <g>
          <circle cx="14" cy="50" r="5" fill="#f59e0b"/>
          {[0,45,90,135,180,225,270,315].map(a => (
            <line key={a}
              x1={14 + Math.cos(a*Math.PI/180)*7} y1={50 + Math.sin(a*Math.PI/180)*7}
              x2={14 + Math.cos(a*Math.PI/180)*9} y2={50 + Math.sin(a*Math.PI/180)*9}
              stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/>
          ))}
        </g>

        {/* Agulha rotacionável */}
        <g transform={`rotate(${rotacao}, 50, 50)`}>
          <polygon points="50,12 46,50 54,50" fill="#ef4444" opacity="0.92"/>
          <polygon points="50,88 46,50 54,50" fill="#94a3b8" opacity="0.7"/>
          <circle cx="50" cy="50" r="5" fill="white" stroke="#1a4a1a" strokeWidth="2"/>
          <circle cx="50" cy="50" r="2" fill="#1a4a1a"/>
        </g>
      </svg>

      {/* Graus + reset */}
      <div style={{display:'flex', alignItems:'center', gap:8, width:'100%', justifyContent:'space-between'}}>
        <span style={{fontSize:11, fontWeight:800, color:'#374151', minWidth:28}}>{rotacao}°</span>
        <button
          onClick={() => setRotacao(0)}
          style={{
            fontSize:9, fontWeight:700, color:'#1a4a1a',
            background:'#f0fdf4', border:'1px solid #bbf7d0',
            borderRadius:6, padding:'2px 8px', cursor:'pointer',
          }}>
          Reset
        </button>
      </div>

      <p style={{fontSize:8, color:'#f59e0b', margin:0, fontWeight:700}}>☀️ Oeste</p>
    </div>
  );
}
