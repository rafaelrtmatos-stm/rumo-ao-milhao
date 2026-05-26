export default function SolOeste() {
  return (
    <div style={{
      position: 'absolute', left: 0, top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 10, pointerEvents: 'none',
      width: 120, height: 200,
      overflow: 'hidden',
    }}>
      <svg width="120" height="200" viewBox="0 0 120 200" fill="none">
        <defs>
          {/* Glow do sol */}
          <radialGradient id="solGlow" cx="0%" cy="50%" r="100%">
            <stop offset="0%"   stopColor="#FFF176" stopOpacity="0.95"/>
            <stop offset="20%"  stopColor="#FFD700" stopOpacity="0.7"/>
            <stop offset="45%"  stopColor="#FF8C00" stopOpacity="0.45"/>
            <stop offset="70%"  stopColor="#FF4500" stopOpacity="0.2"/>
            <stop offset="100%" stopColor="#FF4500" stopOpacity="0"/>
          </radialGradient>
          {/* Núcleo brilhante */}
          <radialGradient id="solNucleo" cx="30%" cy="40%" r="70%">
            <stop offset="0%"  stopColor="#FFFDE7" stopOpacity="1"/>
            <stop offset="40%" stopColor="#FFD700" stopOpacity="1"/>
            <stop offset="100%" stopColor="#FFA000" stopOpacity="1"/>
          </radialGradient>
          {/* Bloom suave */}
          <filter id="bloom" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="8" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="14" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Halo externo grande */}
        <ellipse cx="0" cy="100" rx="90" ry="90" fill="url(#solGlow)"/>

        {/* Raios solares */}
        {[−30,−15,0,15,30].map((ang, i) => (
          <line key={i}
            x1="0" y1="100"
            x2={40 * Math.cos((ang) * Math.PI/180)}
            y2={100 + 40 * Math.sin((ang) * Math.PI/180)}
            stroke="#FFD700" strokeWidth={3 - Math.abs(ang)/20}
            strokeOpacity={0.6 - Math.abs(ang)/80}
            strokeLinecap="round"
            filter="url(#bloom)"
          />
        ))}

        {/* Núcleo do sol */}
        <circle cx="0" cy="100" r="28"
          fill="url(#solNucleo)"
          filter="url(#bloom)"
        />

        {/* Brilho central */}
        <circle cx="0" cy="100" r="18"
          fill="#FFFDE7"
          filter="url(#glow)"
          opacity="0.9"
        />

        {/* Label OESTE */}
        <text x="12" y="148" fontSize="10" fontWeight="800"
          fill="rgba(255,255,255,0.9)"
          style={{textShadow:'0 1px 4px rgba(0,0,0,0.5)'}}>
          ◂ OESTE
        </text>
      </svg>
    </div>
  );
}
