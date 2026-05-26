import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useMemo } from "react";
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

/** Valida se lat/lng são números reais — evita NaN no flyTo */
function validLatLng(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && typeof lng === 'number'
    && isFinite(lat) && isFinite(lng)
    && lat !== 0 && lng !== 0
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

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

export interface MapaGlobalHandle {
  centralizar: () => void;
  minhaLocalizacao: () => void;
}

const MapaGlobalDashboard = forwardRef<MapaGlobalHandle, Props>(function MapaGlobalDashboard(
  { empreendimentos, sales, onAbrirEmpreendimento, onVerMapa, visible = true, focusDevId = null, onLocationPick },
  ref
) {
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
  const [painelAberto, setPainelAberto] = useState(false); // fechado por padrão
  const [mapReady, setMapReady] = useState(false);
  const [camada, setCamada] = useState<Camada>("satelite");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [camadasAberto, setCamadasAberto] = useState(false);
  const [mapaLocked, setMapaLocked] = useState(true); // bloqueado por padrão
  const [mapHeight, setMapHeight] = useState(() => {
    const saved = localStorage.getItem('mapGlobalHeight');
    return saved ? Math.max(300, Math.min(window.innerHeight, parseInt(saved))) : 480;
  });
  const [activeDevId, setActiveDevId] = useState<string | null>(null);
  const resizeDragRef = useRef<{startY:number;startH:number}|null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // DECLARADOS ANTES DOS HOOKS (evita TDZ no bundle minificado)
  const empreendimentosRef = useRef(empreendimentos);

  const devsComLoc = useMemo(() =>
    empreendimentosFiltrados.filter(d => validLatLng(d.lat, d.lng)),
    [empreendimentosFiltrados]
  );

  const devsFiltrados = useMemo(() => {
    let list = devsComLoc;
    if (filtro === "com_mapa") list = list.filter(d => d.mapaImagemBase64 || d.mapaPdfOriginalBase64 || d.mapaImagemUrl);
    if (filtro === "mais_vendidos") list = [...list].sort((a, b) => (b.lotesVendidos ?? 0) - (a.lotesVendidos ?? 0)).slice(0, 10);
    if (filtro === "disponiveis") list = list.filter(d => (d.lotesDisponiveis ?? 0) > 0);
    if (busca.trim()) {
      const q = String(busca || "").toLowerCase();
      list = list.filter(d => {
        const nome = String(d.nome ?? '').toLowerCase();
        const cidade = String(d.cidade ?? '').toLowerCase();
        return nome.includes(q) || cidade.includes(q);
      });
    }
    return list;
  }, [devsComLoc, filtro, busca]);

  // Auto-fit bounds ao redimensionar — com guards completos
  useEffect(() => {
    if (!containerRef.current || !leafletRef.current) return;
    // Capturar snapshot dos dados NO MOMENTO do efeito (evita TDZ no closure)
    const devsSnapshot = devsComLoc;
    const ro = new ResizeObserver(() => {
      // Guard: verificar se mapa ainda está montado quando o observer dispara
      if (!leafletRef.current) return;
      leafletRef.current.invalidateSize?.();
      if (!devsSnapshot || devsSnapshot.length === 0) return;
      import("leaflet").then(L => {
        // Double-check após import assíncrono
        if (!leafletRef.current) return;
        const validDevs = devsSnapshot.filter(d => validLatLng(d.lat, d.lng));
        if (validDevs.length === 0) return;
        if (validDevs.length === 1) {
          leafletRef.current.flyTo([validDevs[0].lat!, validDevs[0].lng!], 15, { animate: false });
        } else {
          const bounds = L.latLngBounds(validDevs.map(d => [d.lat!, d.lng!] as [number,number]));
          leafletRef.current.fitBounds(bounds, { padding: [50,50], maxZoom: 14, animate: false });
        }
      });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [devsComLoc, mapReady]);

  useImperativeHandle(ref, () => ({
    centralizar: () => {
      // Guard completo antes de qualquer operação assíncrona
      if (!leafletRef.current) return;
      const devs = (Array.isArray(devsComLoc) ? devsComLoc : []).filter(d => validLatLng(d.lat, d.lng));
      if (!devs.length) return;
      const mapInst = leafletRef.current;
      import("leaflet").then(L => {
        if (!mapInst || !leafletRef.current) return;
        if (devs.length === 1) mapInst.flyTo([devs[0].lat!, devs[0].lng!], 15, { animate: true, duration: 1 });
        else {
          const bounds = L.latLngBounds(devs.map(d => [d.lat!, d.lng!] as [number,number]));
          mapInst.fitBounds(bounds, { padding: [40,40], maxZoom: 14, animate: true });
        }
      });
    },
    minhaLocalizacao: () => {
      navigator.geolocation.getCurrentPosition(
        pos => { leafletRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 15, { animate: true, duration: 1 }); },
        err => { const m: Record<number,string>={1:"Permissão negada.",2:"GPS indisponível.",3:"Tempo esgotado."}; alert(m[err.code]||err.message); },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    },
  }), [devsComLoc]);

  // devsComLoc e devsFiltrados declarados abaixo — movidos para antes dos hooks

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
            if (!validLatLng(cluster.lat, cluster.lng)) return;
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
    if (!leafletRef.current || !validLatLng(dev.lat, dev.lng)) return;
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
    // Guard: só invalida se o mapa ainda estiver montado
    const mapRef_ = leafletRef.current;
    if (mapRef_) setTimeout(() => { mapRef_?.invalidateSize?.(); }, 300);
  }

  function togglePainel() {
    const next = !painelAberto;
    setPainelAberto(next);
    localStorage.setItem('mapGlobal_painel', String(next));
    const mapRef_ = leafletRef.current;
    if (mapRef_) setTimeout(() => { mapRef_?.invalidateSize?.(); }, 350);
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

  // Guard de segurança: não renderizar se empreendimentos não carregou
  if (!empreendimentos) return null;

  return (
    <div ref={containerRef} className="flex flex-col w-full overflow-hidden"
      style={{
        borderRadius: 20,
        background: 'transparent',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>


      {/* ── CORPO: painel + mapa ── */}
      <div style={{ display:'flex', height: focusDevId ? '100%' : isFullscreen ? '100vh' : mapHeight, minHeight: 300, position:'relative' }}>

        {/* ── MAPA ── */}
        <div style={{ flex:1, position:'relative', minWidth:0 }}>
          <div ref={mapRef} style={{ position:'absolute', inset:0, pointerEvents: (locked || mapaLocked) ? 'none' : 'auto' }}/>

          {/* CONTROLES FLUTUANTES — canto superior direito, ACIMA do overlay */}
          <div style={{ position:'absolute', top:10, right:10, zIndex:1020, display:'flex', flexDirection:'column', gap:6 }}>

            {/* Camadas */}
            <div style={{ position:'relative' }}>
              <button title="Camadas" onClick={() => setCamadasAberto(v => !v)}
                style={{
                  width:36, height:36, borderRadius:10, cursor:'pointer',
                  background:'rgba(255,255,255,0.95)', backdropFilter:'blur(8px)',
                  border:'1px solid rgba(0,0,0,0.08)',
                  boxShadow:'0 2px 10px rgba(0,0,0,0.15)',
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:1,
                  color: camadasAberto ? '#1a4a1a' : '#374151',
                }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
                </svg>
              </button>
              {camadasAberto && (
                <div style={{
                  position:'absolute', top:0, right:44, zIndex:9999,
                  background:'rgba(255,255,255,0.97)', backdropFilter:'blur(16px)',
                  border:'1px solid rgba(0,0,0,0.08)', borderRadius:12,
                  padding:'4px', minWidth:130, boxShadow:'0 4px 20px rgba(0,0,0,0.15)',
                }}>
                  {([['satelite','🛰','Satélite'],['hibrido','🌍','Híbrido'],['ruas','🗺','Ruas']] as [Camada,string,string][]).map(([c,icon,label]) => (
                    <button key={c} onClick={() => { setCamada(c); setCamadasAberto(false); }}
                      style={{
                        width:'100%', padding:'7px 10px', borderRadius:8, fontSize:12, fontWeight:700,
                        cursor:'pointer', border:'none', textAlign:'left', display:'flex', alignItems:'center', gap:8,
                        background: camada === c ? 'rgba(26,74,26,0.1)' : 'transparent',
                        color: camada === c ? '#1a4a1a' : '#374151',
                      }}>
                      {icon} {label}
                      {camada === c && <svg style={{marginLeft:'auto'}} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </button>
                  ))}
                </div>
              )}
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
              width:36, height:36, borderRadius:10, cursor:'pointer',
              background:'rgba(255,255,255,0.95)', backdropFilter:'blur(8px)',
              border:'1px solid rgba(0,0,0,0.08)', boxShadow:'0 2px 10px rgba(0,0,0,0.15)',
              display:'flex', alignItems:'center', justifyContent:'center', color:'#374151',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
              </svg>
            </button>

            {/* Minha localização */}
            <button title="Minha localização" onClick={() => {
              navigator.geolocation.getCurrentPosition(
                pos => {
                  leafletRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 15, { animate: true, duration: 1 });
                  import("leaflet").then(L => {
                    L.circleMarker([pos.coords.latitude, pos.coords.longitude], {
                      radius: 10, color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.8, weight: 3,
                    }).addTo(leafletRef.current!).bindPopup("📍 Você está aqui").openPopup();
                  });
                },
                err => { const m: Record<number,string> = {1:"Permissão negada.",2:"GPS indisponível.",3:"Tempo esgotado."}; alert(m[err.code]||err.message); },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
              );
            }} style={{
              width:36, height:36, borderRadius:10, cursor:'pointer',
              background:'rgba(255,255,255,0.95)', backdropFilter:'blur(8px)',
              border:'1px solid rgba(0,0,0,0.08)', boxShadow:'0 2px 10px rgba(0,0,0,0.15)',
              display:'flex', alignItems:'center', justifyContent:'center', color:'#3b82f6',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>
              </svg>
            </button>

            {/* Cadeado — único, pisca quando bloqueado e mapa é clicado */}
            <button title={mapaLocked ? "Desbloquear mapa" : "Bloquear mapa"}
              onClick={() => setMapaLocked(v => !v)}
              style={{
                width:36, height:36, borderRadius:10, cursor:'pointer',
                background: mapaLocked
                  ? (flashLock ? 'rgba(239,68,68,0.9)' : 'rgba(239,68,68,0.12)')
                  : 'rgba(74,222,128,0.12)',
                backdropFilter:'blur(8px)',
                border: mapaLocked
                  ? (flashLock ? '2px solid rgba(239,68,68,0.8)' : '1px solid rgba(239,68,68,0.3)')
                  : '1px solid rgba(74,222,128,0.3)',
                boxShadow: flashLock ? '0 0 16px rgba(239,68,68,0.5)' : '0 2px 10px rgba(0,0,0,0.12)',
                display:'flex', alignItems:'center', justifyContent:'center',
                color: mapaLocked ? (flashLock ? 'white' : '#ef4444') : '#16a34a',
                transition:'all 0.15s',
              }}>
              {mapaLocked
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 0 10 0"/></svg>}
            </button>

            {/* Fullscreen */}
            <button title="Tela cheia" onClick={toggleFullscreen}
              style={{
                width:36, height:36, borderRadius:10, cursor:'pointer',
                background: isFullscreen ? 'rgba(26,74,26,0.15)' : 'rgba(255,255,255,0.95)',
                backdropFilter:'blur(8px)',
                border: isFullscreen ? '1px solid rgba(26,74,26,0.3)' : '1px solid rgba(0,0,0,0.08)',
                boxShadow:'0 2px 10px rgba(0,0,0,0.12)',
                display:'flex', alignItems:'center', justifyContent:'center',
                color: isFullscreen ? '#16a34a' : '#374151',
              }}>
              {isFullscreen
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 0 2-2h3M3 16h3a2 2 0 0 0 2 2v3"/></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>}
            </button>
          </div>

          {/* Overlay bloqueado — locked ou mapaLocked */}
          {(locked || mapaLocked) && (
            <div style={{
              position:'absolute', inset:0, zIndex:1009, cursor:'not-allowed',
              background: flashLock ? 'rgba(239,68,68,0.08)' : 'transparent',
              transition:'background 0.15s',
            }}
              onClick={() => { setFlashLock(true); setTimeout(() => setFlashLock(false), 600); }}
              onWheel={e => e.stopPropagation()}/>
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

          {/* Card stats flutuante inferior esquerdo — só desktop */}
          {!focusDevId && !locked && devsComLoc.length > 0 && typeof window !== 'undefined' && window.innerWidth >= 768 && (
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
});

export default MapaGlobalDashboard;
