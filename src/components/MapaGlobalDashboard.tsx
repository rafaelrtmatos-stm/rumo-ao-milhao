import { useEffect, useRef, useState, useMemo } from "react";
import type { Empreendimento, Venda } from "../types";

interface Props {
  empreendimentos: Empreendimento[];
  sales: Venda[];
  onAbrirEmpreendimento: (id: string) => void;
  onVerMapa: (id: string) => void;
  visible?: boolean;
  focusDevId?: string | null;
  onLocationPick?: (lat: number, lng: number) => void; // clique no mapa define coordenada
}

type Camada = "satelite" | "hibrido" | "ruas";
type Filtro = "todos" | "com_mapa" | "mais_vendidos" | "disponiveis";

function calcularStats(dev: Empreendimento, sales: Venda[]) {
  const vendas = sales.filter(s => s.empreendimentoId === dev.id && s.status !== "cancelado");
  const vendidos = dev.lotesVendidos ?? vendas.length;
  const total = dev.totalLotes ?? 0;
  const disponiveis = Math.max(0, total - vendidos);
  const pct = total > 0 ? Math.round((vendidos / total) * 100) : 0;
  return { vendidos, total, disponiveis, pct };
}

// Tiles de satélite — Google via proxy público (sem API key)
// Tiles com fallback: tenta Google primeiro, cai para Esri se falhar
const GOOGLE_OPTS = {
  subdomains: "0123",
  maxZoom: 20,
  maxNativeZoom: 19,
  tileSize: 256,
  attribution: "© Google",
  errorTileUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", // tile transparente
};

const TILES: Record<Camada, { url: string; options: any }> = {
  satelite: {
    // Esri World Imagery — gratuito, sem API key, sem bloqueio
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: { maxZoom: 19, maxNativeZoom: 19, attribution: "© Esri, Maxar" },
  },
  hibrido: {
    // Esri satélite + Google roads overlay
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: { maxZoom: 19, maxNativeZoom: 19, attribution: "© Esri" },
  },
  ruas: {
    // CartoDB Voyager — moderno, sem bloqueio
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    options: { maxZoom: 19, subdomains: "abcd", attribution: "© CartoDB" },
  },
};

// Sem cluster — cada empreendimento sempre tem pino próprio (igual Google Maps)
function clusterPins(devs: Empreendimento[], zoom: number) {
  if (!devs.length) return [];
  return devs.map(d => ({ devs: [d], lat: d.lat!, lng: d.lng!, isCluster: false }));
}

export default function MapaGlobalDashboard({ empreendimentos, sales, onAbrirEmpreendimento, onVerMapa, visible = true, focusDevId = null, onLocationPick }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);
  const tileRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [selectedDev, setSelectedDev] = useState<Empreendimento | null>(null);
  const [locked, setLocked] = useState(!!focusDevId); // cadeado — bloqueia zoom/pan
  const [flashLock, setFlashLock] = useState(false); // piscar vermelho ao clicar no mapa bloqueado
  // Filtrar para mostrar só o empreendimento em foco (se houver)
  const empreendimentosFiltrados = focusDevId
    ? empreendimentos.filter(d => d.id === focusDevId)
    : empreendimentos;
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [mapZoom, setMapZoom] = useState(5);
  const [painelAberto, setPainelAberto] = useState(() => localStorage.getItem('mapGlobal_painel') !== 'false');
  const [mapReady, setMapReady] = useState(false);
  const [camada, setCamada] = useState<Camada>("satelite");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapHeight, setMapHeight] = useState(() => {
    const saved = localStorage.getItem('mapGlobalHeight');
    return saved ? Math.max(300, Math.min(window.innerHeight, parseInt(saved))) : 480;
  });
  const [activeDevId, setActiveDevId] = useState<string | null>(null);
  const resizeDragRef = useRef<{startY:number;startH:number}|null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Ref sempre atualizado com empreendimentos atuais (evita closure stale)
  const empreendimentosRef = useRef(empreendimentos);
  useEffect(() => { empreendimentosRef.current = empreendimentos; }, [empreendimentos]);

  const devsComLoc = useMemo(() =>
    empreendimentosFiltrados.filter(d => d.lat != null && d.lng != null && d.lat !== 0 && d.lng !== 0),
    [empreendimentosFiltrados]
  );

  const devsFiltrados = useMemo(() => {
    let list = devsComLoc;
    if (filtro === "com_mapa") list = list.filter(d => d.mapaImagemBase64 || d.mapaPdfOriginalBase64 || d.mapaImagemUrl);
    if (filtro === "mais_vendidos") list = [...list].sort((a, b) => (b.lotesVendidos ?? 0) - (a.lotesVendidos ?? 0)).slice(0, 10);
    if (filtro === "disponiveis") list = list.filter(d => (d.lotesDisponiveis ?? 0) > 0);
    if (busca.trim()) {
      const q = busca.toLowerCase();
      list = list.filter(d => d.nome.toLowerCase().includes(q) || d.cidade?.toLowerCase().includes(q));
    }
    return list;
  }, [devsComLoc, filtro, busca]);

  // Inicializar Leaflet
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;
    let cancelled = false;

    import("leaflet").then(L => {
      if (cancelled || !mapRef.current || leafletRef.current) return;

      const map = L.map(mapRef.current!, {
        center: [-5, -52],
        zoom: 5,
        zoomControl: false,
        attributionControl: false,
        doubleClickZoom: true,
      });

      // Satélite Google por padrão
      tileRef.current = L.tileLayer(TILES.satelite.url, TILES.satelite.options).addTo(map);

      // Zoom control
      L.control.zoom({ position: "bottomright" }).addTo(map);

      map.on("zoomend", () => setMapZoom(map.getZoom()));

      // Clique no mapa quando desbloqueado = define localização
      map.on('click', (e: any) => {
        if (onLocationPick) {
          onLocationPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
        }
      });

      leafletRef.current = map;
      setMapReady(true);

      // Centralização feita no useEffect separado abaixo
    });

    return () => {
      cancelled = true;
      if (leafletRef.current) { leafletRef.current.remove(); leafletRef.current = null; }
    };
  }, []);

  // Quando mapa fica visível: corrigir dimensões (estava em display:none)
  useEffect(() => {
    if (!visible || !leafletRef.current) return;
    // Chamar várias vezes para garantir que o layout está pronto
    const map = leafletRef.current;
    const fix = () => { map?.invalidateSize({ animate: false }); };
    fix();
    const t1 = setTimeout(fix, 50);
    const t2 = setTimeout(fix, 150);
    const t3 = setTimeout(fix, 400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [visible]);

  // ResizeObserver no container do mapa para invalidateSize automático
  useEffect(() => {
    if (!mapRef.current) return;
    const ro = new ResizeObserver(() => {
      leafletRef.current?.invalidateSize({ animate: false });
    });
    ro.observe(mapRef.current);
    return () => ro.disconnect();
  }, [mapReady]);

  // Centralizar no foco ou nos empreendimentos
  const centradoRef = useRef<string | false>(false);
  useEffect(() => {
    if (!mapReady || !leafletRef.current) return;
    const devs = empreendimentosFiltrados.filter(d => d.lat && d.lng && d.lat !== 0);
    if (devs.length === 0) return;
    if (centradoRef.current === (focusDevId || "todos")) return;
    centradoRef.current = focusDevId || "todos";
    import("leaflet").then(L => {
      if (!leafletRef.current) return;
      if (devs.length === 1) {
        // focusDevId = editando empreendimento: zoom 19 (~200 pés altitude)
        const zoomLevel = focusDevId ? 17 : 15;
        leafletRef.current.flyTo([devs[0].lat!, devs[0].lng!], zoomLevel, { animate: true, duration: 1.0 });
      } else {
        const bounds = L.latLngBounds(devs.map(d => [d.lat!, d.lng!] as [number, number]));
        // maxZoom 16 = ~1km de altitude, mostra todos os pinos bem próximos
        leafletRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 16, animate: true });
      }
    });
  }, [mapReady, empreendimentos]);

  // Trocar camada
  const overlayRef = useRef<any>(null);
  useEffect(() => {
    if (!mapReady || !leafletRef.current) return;
    import("leaflet").then(L => {
      if (tileRef.current) { tileRef.current.remove(); tileRef.current = null; }
      if (overlayRef.current) { overlayRef.current.remove(); overlayRef.current = null; }
      const cfg = TILES[camada];
      tileRef.current = L.tileLayer(cfg.url, cfg.options).addTo(leafletRef.current!);
      // Overlay de nomes para modo híbrido
      if (camada === 'hibrido') {
        overlayRef.current = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 19, opacity: 0.8 }
        ).addTo(leafletRef.current!);
      }
    });
  }, [camada, mapReady]);

  // Atualizar marcadores
  useEffect(() => {
    if (!mapReady || !leafletRef.current) return;
    import("leaflet").then(L => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      const clusters = clusterPins(devsComLoc, mapZoom); // sempre mostra todos no mapa

      clusters.forEach(cluster => {
        let icon: any;
        if (cluster.isCluster) {
          icon = L.divIcon({
            className: "",
            html: `<div style="background:#1a4a1a;color:white;border-radius:50%;width:46px;height:46px;
              display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px;
              border:3px solid white;box-shadow:0 3px 12px rgba(0,0,0,0.5);cursor:pointer;">
              ${cluster.devs.length}</div>`,
            iconSize: [46, 46], iconAnchor: [23, 23],
          });
        } else {
          const dev = cluster.devs[0];
          const nome = dev.nome.length > 18 ? dev.nome.slice(0,18)+'…' : dev.nome;
          // Estilo Google Maps: pino vermelho + label branco ao lado
          icon = L.divIcon({
            className: "",
            html: `<div style="display:flex;align-items:center;gap:4px;cursor:pointer;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.45));">
              <!-- PIN vermelho estilo Google Maps -->
              <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">
                <div style="width:22px;height:22px;background:#e53935;border-radius:50% 50% 50% 0;
                  transform:rotate(-45deg);border:2.5px solid white;
                  box-shadow:0 2px 6px rgba(229,57,53,0.6);"></div>
                <div style="width:4px;height:8px;background:#e53935;margin-top:-1px;border-radius:0 0 2px 2px;"></div>
              </div>
              <!-- NOME branco ao lado -->
              <div style="background:rgba(30,30,30,0.82);color:white;
                padding:3px 8px;border-radius:8px;font-size:11px;font-weight:700;
                white-space:nowrap;letter-spacing:0.2px;backdrop-filter:blur(4px);
                border:1px solid rgba(255,255,255,0.15);max-width:140px;
                overflow:hidden;text-overflow:ellipsis;">
                ${nome}
              </div>
            </div>`,
            iconSize: [200, 36], iconAnchor: [11, 30],
          });
        }

        const marker = L.marker([cluster.lat, cluster.lng], { icon }).addTo(leafletRef.current!);

        if (cluster.isCluster) {
          marker.on("click", () => {
            leafletRef.current!.flyTo([cluster.lat, cluster.lng],
              Math.min(leafletRef.current!.getZoom() + 3, 15), { animate: true, duration: 0.8 });
          });
        } else {
          marker.on("click", () => setSelectedDev(cluster.devs[0]));
        }

        markersRef.current.push(marker);
      });
    });
  }, [devsFiltrados, mapZoom, mapReady, sales]);

  function centralizarEm(dev: Empreendimento) {
    if (!leafletRef.current || !dev.lat || !dev.lng) return;
    leafletRef.current.flyTo([dev.lat, dev.lng], 15, { animate: true, duration: 0.8 });
    setSelectedDev(dev);
    setActiveDevId(dev.id);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
      setPainelAberto(false);
      try { (screen.orientation as any).lock?.('landscape').catch(() => {}); } catch {}
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
      setPainelAberto(localStorage.getItem('mapGlobal_painel') !== 'false');
      try { (screen.orientation as any).unlock?.(); } catch {}
    }
    setTimeout(() => { leafletRef.current?.invalidateSize?.(); }, 300);
  }

  function togglePainel() {
    const next = !painelAberto;
    setPainelAberto(next);
    localStorage.setItem('mapGlobal_painel', String(next));
    setTimeout(() => { leafletRef.current?.invalidateSize?.(); }, 350);
  }

  function startResizeDrag(e: React.MouseEvent | React.TouchEvent) {
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    resizeDragRef.current = { startY: clientY, startH: mapHeight };
    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!resizeDragRef.current) return;
      const y = 'touches' in ev ? (ev as TouchEvent).touches[0].clientY : (ev as MouseEvent).clientY;
      const delta = y - resizeDragRef.current.startY;
      const newH = Math.max(300, Math.min(window.innerHeight - 100, resizeDragRef.current.startH + delta));
      setMapHeight(newH);
      localStorage.setItem('mapGlobalHeight', String(Math.round(newH)));
      leafletRef.current?.invalidateSize?.();
    };
    const onUp = () => {
      resizeDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove as any);
      window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove as any, { passive: false });
    window.addEventListener('touchend', onUp);
  }

  const totalDisponiveis = devsComLoc.reduce((s,d) => s + Math.max(0,(d.totalLotes??0)-(d.lotesVendidos??0)), 0);
  const totalVendidos = devsComLoc.reduce((s,d) => s + (d.lotesVendidos??0), 0);
  const totalLotes = devsComLoc.reduce((s,d) => s + (d.totalLotes??0), 0);

  return (
    <div ref={containerRef} className="flex flex-col w-full overflow-hidden"
      style={{
        borderRadius: 20,
        background: '#0a0f1a',
        boxShadow: '0 25px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>

      {/* ── TOPBAR PREMIUM — escondida no mobile (wrapper externo já tem a barra) ── */}
      {!focusDevId && typeof window !== 'undefined' && window.innerWidth >= 768 && (
        <div style={{
          background: 'rgba(10,15,26,0.85)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}>
          {/* Toggle painel */}
          <button onClick={togglePainel} title={painelAberto ? "Recolher" : "Expandir"}
            style={{
              width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
              background: painelAberto ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', flexShrink: 0,
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              {painelAberto ? <polyline points="15 18 9 12 15 6"/> : <polyline points="9 18 15 12 9 6"/>}
            </svg>
          </button>

          {/* Busca premium */}
          <div style={{ flex: 1, position: 'relative' }}>
            <svg style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', opacity:0.4 }}
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar empreendimento, cidade ou região..."
              style={{
                width: '100%', paddingLeft: 36, paddingRight: 14, paddingTop: 8, paddingBottom: 8,
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, color: 'white', fontSize: 12, fontWeight: 500, outline: 'none',
                boxSizing: 'border-box', transition: 'all 0.2s',
              }}/>
          </div>

          {/* Pills de camada */}
          <div style={{ display:'flex', gap:4, flexShrink:0 }}>
            {([['satelite','🛰','Sat'],['hibrido','🌍','Híb'],['ruas','🗺','Ruas']] as [Camada,string,string][]).map(([c,icon,label]) => (
              <button key={c} onClick={() => setCamada(c)}
                style={{
                  padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  border: camada === c ? '1px solid rgba(74,222,128,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  background: camada === c ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.05)',
                  color: camada === c ? '#4ade80' : 'rgba(255,255,255,0.5)',
                  boxShadow: camada === c ? '0 0 12px rgba(74,222,128,0.2)' : 'none',
                  transition: 'all 0.2s', whiteSpace: 'nowrap',
                }}>
                {icon} {label}
              </button>
            ))}
          </div>

          {/* Centralizar */}
          <button title="Centralizar" onClick={() => {
            if (!leafletRef.current) return;
            const devs = devsComLoc;
            if (!devs.length) return;
            import("leaflet").then(L => {
              if (!leafletRef.current) return;
              if (devs.length === 1) leafletRef.current.flyTo([devs[0].lat!, devs[0].lng!], 15, { animate: true, duration: 1 });
              else {
                const bounds = L.latLngBounds(devs.map(d => [d.lat!, d.lng!] as [number,number]));
                leafletRef.current.fitBounds(bounds, { padding: [60,60], maxZoom: 14, animate: true });
              }
            });
          }} style={{
            width:34, height:34, borderRadius:10, border:'1px solid rgba(255,255,255,0.1)',
            background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.7)',
            cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
            transition:'all 0.2s', flexShrink:0,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
            </svg>
          </button>

          {/* Fullscreen */}
          <button title="Tela cheia" onClick={toggleFullscreen}
            style={{
              width:34, height:34, borderRadius:10, border:'1px solid rgba(255,255,255,0.1)',
              background: isFullscreen ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.06)',
              color: isFullscreen ? '#4ade80' : 'rgba(255,255,255,0.7)',
              cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
              transition:'all 0.2s', flexShrink:0,
            }}>
            {isFullscreen
              ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 0 2-2h3M3 16h3a2 2 0 0 0 2 2v3"/></svg>
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>}
          </button>
        </div>
      )}

      {/* ── CORPO: painel + mapa ── */}
      <div style={{ display:'flex', height: focusDevId ? '100%' : isFullscreen ? '100vh' : mapHeight, minHeight: 300, position:'relative' }}>

        {/* PAINEL LATERAL PREMIUM */}
        {!focusDevId && (
          <div style={{
            width: painelAberto ? 220 : 0,
            opacity: painelAberto ? 1 : 0,
            overflow: 'hidden',
            transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s',
            flexShrink: 0,
            background: 'rgba(5,10,20,0.92)',
            backdropFilter: 'blur(20px)',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Stats topo do painel */}
            <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
              <p style={{ fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing: 2, marginBottom: 8 }}>
                Empreendimentos
              </p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {[
                  { label:'Total', value: devsComLoc.length, color:'#94a3b8' },
                  { label:'Lotes disp.', value: totalDisponiveis, color:'#4ade80' },
                ].map(s => (
                  <div key={s.label} style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'6px 8px', border:'1px solid rgba(255,255,255,0.05)' }}>
                    <p style={{ fontSize:16, fontWeight:900, color:s.color, lineHeight:1 }}>{s.value}</p>
                    <p style={{ fontSize:9, color:'rgba(255,255,255,0.3)', marginTop:2 }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Lista empreendimentos */}
            <div style={{ flex:1, overflowY:'auto', padding:'8px 8px', scrollbarWidth:'thin', scrollbarColor:'rgba(255,255,255,0.1) transparent' }}>
              {devsFiltrados.map(dev => {
                const stats = calcularStats(dev, sales);
                const isActive = activeDevId === dev.id;
                const statusColor = stats.pct >= 90 ? '#ef4444' : stats.pct >= 60 ? '#f59e0b' : '#4ade80';
                return (
                  <div key={dev.id} onClick={() => centralizarEm(dev)}
                    style={{
                      padding: '10px 10px', borderRadius:12, marginBottom:4, cursor:'pointer',
                      background: isActive ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.03)',
                      border: isActive ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(255,255,255,0.05)',
                      transition:'all 0.2s',
                      boxShadow: isActive ? '0 0 16px rgba(74,222,128,0.1)' : 'none',
                    }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                      <p style={{ fontSize:11, fontWeight:800, color:'white', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{dev.nome}</p>
                      <div style={{ width:6, height:6, borderRadius:'50%', background:statusColor, flexShrink:0, marginLeft:6, boxShadow:`0 0 6px ${statusColor}` }}/>
                    </div>
                    {dev.cidade && <p style={{ fontSize:9, color:'rgba(255,255,255,0.3)', margin:'0 0 6px' }}>📍 {dev.cidade}</p>}
                    <div style={{ height:2, background:'rgba(255,255,255,0.06)', borderRadius:2, overflow:'hidden', marginBottom:6 }}>
                      <div style={{ height:'100%', width:`${stats.pct}%`, background:`linear-gradient(90deg,${statusColor},${statusColor}aa)`, borderRadius:2, transition:'width 0.5s' }}/>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <span style={{ fontSize:9, color:'rgba(255,255,255,0.4)' }}>{stats.disponiveis} disp. · {stats.pct}%</span>
                      <button onClick={e => { e.stopPropagation(); onVerMapa(dev.id); }}
                        style={{
                          fontSize:9, fontWeight:800, color: isActive ? '#4ade80' : 'rgba(255,255,255,0.4)',
                          background:'none', border:'none', cursor:'pointer', padding:0, transition:'color 0.2s',
                        }}>
                        ABRIR →
                      </button>
                    </div>
                  </div>
                );
              })}
              {devsFiltrados.length === 0 && (
                <div style={{ textAlign:'center', padding:'32px 0', color:'rgba(255,255,255,0.2)', fontSize:11 }}>
                  {devsComLoc.length === 0 ? 'Nenhum empreendimento com localização.' : 'Sem resultados.'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MAPA ── */}
        <div style={{ flex:1, position:'relative', minWidth:0 }}>
          <div ref={mapRef} style={{ position:'absolute', inset:0, pointerEvents: locked ? 'none' : 'auto' }}/>

          {/* Overlay bloqueado */}
          {locked && (
            <div style={{
              position:'absolute', inset:0, zIndex:1000, cursor:'not-allowed',
              background: flashLock ? 'rgba(239,68,68,0.08)' : 'transparent',
              transition:'background 0.15s',
            }}
              onClick={() => { setFlashLock(true); setTimeout(() => setFlashLock(false), 600); }}
              onWheel={e => e.stopPropagation()}/>
          )}

          {/* Cadeado premium */}
          {locked && (
            <button onClick={() => setLocked(false)} style={{
              position:'absolute', top:12, right:12, zIndex:1001,
              background: flashLock ? 'rgba(239,68,68,0.9)' : 'rgba(10,15,26,0.85)',
              backdropFilter:'blur(12px)',
              color: flashLock ? 'white' : 'rgba(255,255,255,0.8)',
              border: flashLock ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.12)',
              borderRadius:10, padding:'7px 12px', cursor:'pointer',
              display:'flex', alignItems:'center', gap:6,
              fontWeight:800, fontSize:11,
              boxShadow: flashLock ? '0 0 20px rgba(239,68,68,0.4)' : '0 4px 20px rgba(0,0,0,0.4)',
              transition:'all 0.15s',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              {flashLock ? 'Clique para desbloquear' : 'Bloqueado'}
            </button>
          )}

          {/* Instrução localização */}
          {!locked && onLocationPick && (
            <div style={{
              position:'absolute', bottom:12, left:'50%', transform:'translateX(-50%)',
              zIndex:1001, background:'rgba(10,15,26,0.85)', backdropFilter:'blur(12px)',
              color:'white', padding:'8px 16px', borderRadius:10, fontSize:11, fontWeight:700,
              whiteSpace:'nowrap', pointerEvents:'none', border:'1px solid rgba(255,255,255,0.1)',
              boxShadow:'0 4px 20px rgba(0,0,0,0.4)',
            }}>
              📍 Clique no mapa para definir a localização
            </div>
          )}

          {/* Card stats flutuante inferior esquerdo */}
          {!focusDevId && !locked && devsComLoc.length > 0 && (
            <div style={{
              position:'absolute', bottom:12, left:12, zIndex:1000,
              background:'rgba(10,15,26,0.82)', backdropFilter:'blur(16px)',
              border:'1px solid rgba(255,255,255,0.08)', borderRadius:12,
              padding:'8px 12px', display:'flex', gap:12,
              boxShadow:'0 4px 24px rgba(0,0,0,0.4)',
            }}>
              {[
                { label:'Empreend.', value:devsComLoc.length, color:'#94a3b8' },
                { label:'Disponíveis', value:totalDisponiveis, color:'#4ade80' },
                { label:'Vendidos', value:totalVendidos, color:'#f87171' },
              ].map(s => (
                <div key={s.label} style={{ textAlign:'center' }}>
                  <p style={{ fontSize:14, fontWeight:900, color:s.color, margin:0, lineHeight:1 }}>{s.value}</p>
                  <p style={{ fontSize:8, color:'rgba(255,255,255,0.3)', margin:'2px 0 0', textTransform:'uppercase', letterSpacing:0.5 }}>{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Popup empreendimento premium */}
          {selectedDev && (() => {
            const stats = calcularStats(selectedDev, sales);
            const statusColor = stats.pct >= 90 ? '#ef4444' : stats.pct >= 60 ? '#f59e0b' : '#4ade80';
            return (
              <div style={{
                position:'absolute', top:12, left: painelAberto ? 12 : 12, zIndex:1002,
                width:220, background:'rgba(10,15,26,0.92)', backdropFilter:'blur(20px)',
                border:'1px solid rgba(255,255,255,0.1)', borderRadius:16,
                boxShadow:'0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
                overflow:'hidden',
              }}>
                {((selectedDev as any).mapaImagemLeveBase64 || (selectedDev as any).mapaImagemUrl) && (
                  <div style={{ height:80, overflow:'hidden', position:'relative' }}>
                    <img src={(selectedDev as any).mapaImagemLeveBase64 || (selectedDev as any).mapaImagemUrl}
                      style={{ width:'100%', height:'100%', objectFit:'cover', opacity:0.7 }} alt=""/>
                    <div style={{ position:'absolute', inset:0, background:'linear-gradient(to bottom, transparent, rgba(10,15,26,0.9))' }}/>
                  </div>
                )}
                <div style={{ padding:'12px' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:12, fontWeight:900, color:'white', margin:'0 0 2px', lineHeight:1.2 }}>{selectedDev.nome}</p>
                      {selectedDev.cidade && <p style={{ fontSize:10, color:'rgba(255,255,255,0.4)', margin:0 }}>📍 {selectedDev.cidade}</p>}
                    </div>
                    <button onClick={() => setSelectedDev(null)}
                      style={{ background:'rgba(255,255,255,0.08)', border:'none', color:'rgba(255,255,255,0.5)', borderRadius:6, width:22, height:22, cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4, marginBottom:8 }}>
                    {[['Total',stats.total,'#94a3b8'],['Disp.',stats.disponiveis,'#4ade80'],['Vend.',stats.vendidos,'#f87171']].map(([l,v,c]) => (
                      <div key={String(l)} style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'5px 4px', textAlign:'center', border:'1px solid rgba(255,255,255,0.05)' }}>
                        <p style={{ fontSize:13, fontWeight:900, color:String(c), margin:0 }}>{v}</p>
                        <p style={{ fontSize:8, color:'rgba(255,255,255,0.3)', margin:'1px 0 0', textTransform:'uppercase' }}>{l}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ height:3, background:'rgba(255,255,255,0.08)', borderRadius:2, overflow:'hidden', marginBottom:10 }}>
                    <div style={{ height:'100%', width:`${stats.pct}%`, background:`linear-gradient(90deg,${statusColor},${statusColor}99)`, borderRadius:2 }}/>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                    <button onClick={() => onVerMapa(selectedDev.id)}
                      style={{ padding:'8px 0', borderRadius:10, background:'rgba(74,222,128,0.15)', border:'1px solid rgba(74,222,128,0.3)', color:'#4ade80', fontSize:10, fontWeight:900, cursor:'pointer', transition:'all 0.2s' }}>
                      VER MAPA
                    </button>
                    <button onClick={() => onAbrirEmpreendimento(selectedDev.id)}
                      style={{ padding:'8px 0', borderRadius:10, background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.6)', fontSize:10, fontWeight:900, cursor:'pointer', transition:'all 0.2s' }}>
                      EDITAR
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* BARRA RESIZE */}
      {!focusDevId && !isFullscreen && (
        <div onMouseDown={startResizeDrag} onTouchStart={startResizeDrag}
          style={{
            flexShrink:0, height:10, background:'rgba(255,255,255,0.03)',
            borderTop:'1px solid rgba(255,255,255,0.05)', cursor:'row-resize',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
          <div style={{ width:32, height:2, background:'rgba(255,255,255,0.15)', borderRadius:2 }}/>
        </div>
      )}
    </div>
  );
}
