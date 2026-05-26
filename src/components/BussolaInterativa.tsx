import { useState } from "react";

export default function BussolaInterativa() {
  const [rotacao, setRotacao] = useState(0);
  const [arrastando, setArrastando] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!arrastando) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI) + 90;
    setRotacao(Math.round((angle + 360) % 360));
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(touch.clientY - cy, touch.clientX - cx) * (180 / Math.PI) + 90;
    setRotacao(Math.round((angle + 360) % 360));
  };

  return (
    <div style={{
      position: 'absolute', bottom: 16, right: 16, zIndex: 20,
      background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
      borderRadius: 20, padding: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
      border: '1px solid rgba(0,0,0,0.08)', userSelect: 'none',
    }}>
      <p style={{fontSize: 9, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.5, textAlign: 'center', marginBottom: 8}}>
        Bússola
      </p>

      {/* Bússola SVG interativa */}
      <svg
        width={80} height={80} viewBox="0 0 100 100"
        style={{ cursor: arrastando ? 'grabbing' : 'grab', display: 'block' }}
        onMouseDown={() => setArrastando(true)}
        onMouseUp={() => setArrastando(false)}
        onMouseLeave={() => setArrastando(false)}
        onMouseMove={handleMouseMove}
        onTouchStart={() => setArrastando(true)}
        onTouchEnd={() => setArrastando(false)}
        onTouchMove={handleTouchMove}
      >
        {/* Círculo base */}
        <circle cx="50" cy="50" r="46" fill="white" stroke="#e2e8f0" strokeWidth="2"/>
        <circle cx="50" cy="50" r="40" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1"/>

        {/* Pontos cardeais fixos */}
        <text x="50" y="14" textAnchor="middle" fontSize="10" fontWeight="900" fill="#1a4a1a">N</text>
        <text x="50" y="92" textAnchor="middle" fontSize="9" fill="#94a3b8">S</text>
        <text x="10" y="54" textAnchor="middle" fontSize="9" fill="#94a3b8">O</text>
        <text x="90" y="54" textAnchor="middle" fontSize="9" fill="#94a3b8">L</text>

        {/* Agulha rotacionável */}
        <g transform={`rotate(${rotacao}, 50, 50)`}>
          {/* Norte — vermelho */}
          <polygon points="50,14 46,50 54,50" fill="#ef4444" opacity="0.9"/>
          {/* Sul — cinza */}
          <polygon points="50,86 46,50 54,50" fill="#94a3b8" opacity="0.7"/>
          {/* Centro */}
          <circle cx="50" cy="50" r="5" fill="white" stroke="#1a4a1a" strokeWidth="2"/>
        </g>

        {/* Sol no Oeste */}
        <g transform="translate(18, 50)">
          <circle cx="0" cy="0" r="5" fill="#f59e0b" opacity="0.9"/>
          {[0,45,90,135,180,225,270,315].map(a => (
            <line key={a}
              x1={Math.cos(a * Math.PI/180) * 7} y1={Math.sin(a * Math.PI/180) * 7}
              x2={Math.cos(a * Math.PI/180) * 9} y2={Math.sin(a * Math.PI/180) * 9}
              stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/>
          ))}
        </g>
      </svg>

      {/* Graus e reset */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8}}>
        <span style={{fontSize:11, fontWeight:700, color:'#374151'}}>{rotacao}°</span>
        <button
          onClick={() => setRotacao(0)}
          style={{fontSize:9, fontWeight:700, color:'#1a4a1a', background:'#f0fdf4',
            border:'1px solid #bbf7d0', borderRadius:6, padding:'2px 6px', cursor:'pointer'}}>
          Reset
        </button>
      </div>
      <p style={{fontSize:8, color:'#94a3b8', textAlign:'center', marginTop:4}}>
        ☀️ O (Oeste)
      </p>
    </div>
  );
}
