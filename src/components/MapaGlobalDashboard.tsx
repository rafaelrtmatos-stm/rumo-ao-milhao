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

export interface MapaGlobalHandle {
  centralizar: () => void;
  minhaLocalizacao: () => void;
}

const MapaGlobalDashboard = React.forwardRef<MapaGlobalHandle, Props>(function MapaGlobalDashboard({ empreendimentos, sales, onAbrirEmpreendimento, onVerMapa, visible = true, focusDevId = null, onLocationPick }, ref) {
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
  const [mapaLocked, setMapaLocked] = useState(false);
  const [mapHeight, setMapHeight] = useState(() => {
    const saved = localStorage.getItem('mapGlobalHeight');
    return saved ? Math.max(300, Math.min(window.innerHeight, parseInt(saved))) : 480;
  });
  const [activeDevId, setActiveDevId] = useState<string | null>(null);
  const resizeDragRef = useRef<{startY:number;startH:number}|null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Expor funções para o wrapper mobile
  React.useImperativeHandle(ref, () => ({
    centralizar: () => {
      if (!leafletRef.current) return;
      const devs = devsComLoc;
      if (!devs.length) return;
      import("leaflet").then(L => {
        if (!leafletRef.current) return;
        if (devs.length === 1) leafletRef.current.flyTo([devs[0].lat!, devs[0].lng!], 15, { animate: true, duration: 1 });
        else {
          const bounds = L.latLngBounds(devs.map(d => [d.lat!, d.lng!] as [number,number]));
          leafletRef.current.fitBounds(bounds, { padding: [40,40], maxZoom: 14, animate: true });
        }
      });
    },
    minhaLocalizacao: () => {
      navigator.geolocation.getCurrentPosition(
        pos => { leafletRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 15, { animate: true, duration: 1 }); },
        err => { const m: Record<number,string> = {1:"Permissão negada.",2:"GPS indisponível.",3:"Tempo esgotado."}; alert(m[err.code]||err.message); },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    },
  }), [devsComLoc]);

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
    });

export default MapaGlobalDashboard;
