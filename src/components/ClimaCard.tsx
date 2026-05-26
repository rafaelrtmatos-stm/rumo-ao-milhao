import { useState, useEffect } from "react";

interface Props {
  lat?: number;
  lng?: number;
  cidade?: string;
}

interface Clima {
  temp: number;
  descricao: string;
  umidade: number;
  vento: number;
  icone: string;
}

export default function ClimaCard({ lat, lng, cidade }: Props) {
  const [clima, setClima] = useState<Clima | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!lat || !lng) { setLoading(false); return; }
    setLoading(true);
    setErro(false);

    // Open-Meteo — gratuito, sem API key
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&wind_speed_unit=kmh&timezone=auto`;

    fetch(url)
      .then(r => r.json())
      .then(data => {
        const c = data.current;
        const code = c.weather_code;
        setClima({
          temp: Math.round(c.temperature_2m),
          descricao: descricaoClima(code),
          umidade: c.relative_humidity_2m,
          vento: Math.round(c.wind_speed_10m),
          icone: iconeClima(code),
        });
        setLoading(false);
      })
      .catch(() => { setErro(true); setLoading(false); });
  }, [lat, lng]);

  function descricaoClima(code: number): string {
    if (code === 0) return 'Céu limpo';
    if (code <= 2) return 'Parcialmente nublado';
    if (code === 3) return 'Nublado';
    if (code <= 49) return 'Névoa';
    if (code <= 59) return 'Garoa';
    if (code <= 69) return 'Chuva';
    if (code <= 79) return 'Neve';
    if (code <= 84) return 'Aguaceiros';
    if (code <= 99) return 'Trovoada';
    return 'Variável';
  }

  function iconeClima(code: number): string {
    if (code === 0) return '☀️';
    if (code <= 2) return '⛅';
    if (code === 3) return '☁️';
    if (code <= 49) return '🌫️';
    if (code <= 69) return '🌧️';
    if (code <= 79) return '❄️';
    if (code <= 84) return '🌦️';
    if (code <= 99) return '⛈️';
    return '🌤️';
  }

  return (
    <div style={{background:'white', borderRadius:16, padding:16, boxShadow:'0 1px 8px rgba(0,0,0,0.07)', border:'1px solid #f1f5f9'}}>
      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:12}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1a4a1a" strokeWidth="2.5">
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/>
        </svg>
        <p style={{fontSize:9, fontWeight:900, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1.5, margin:0}}>Clima Atual</p>
      </div>

      {loading && (
        <div style={{display:'flex', alignItems:'center', gap:8, color:'#94a3b8'}}>
          <span style={{fontSize:20}}>🌤️</span>
          <p style={{fontSize:11, margin:0}}>Carregando...</p>
        </div>
      )}

      {erro && (
        <div style={{color:'#94a3b8', fontSize:11}}>
          <p style={{margin:0}}>Clima indisponível</p>
        </div>
      )}

      {!loading && !erro && clima && (
        <>
          <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
            <span style={{fontSize:32, lineHeight:1}}>{clima.icone}</span>
            <div>
              <p style={{fontSize:24, fontWeight:900, color:'#1e293b', margin:0, lineHeight:1}}>{clima.temp}°C</p>
              <p style={{fontSize:11, color:'#64748b', margin:'2px 0 0'}}>{clima.descricao}</p>
            </div>
          </div>
          <p style={{fontSize:10, color:'#94a3b8', margin:'0 0 4px'}}>📍 {cidade || 'Localização'}</p>
          <div style={{display:'flex', gap:12}}>
            <div style={{display:'flex', alignItems:'center', gap:4}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z"/></svg>
              <span style={{fontSize:10, color:'#64748b'}}>Umid. {clima.umidade}%</span>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:4}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg>
              <span style={{fontSize:10, color:'#64748b'}}>Vento {clima.vento} km/h</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
