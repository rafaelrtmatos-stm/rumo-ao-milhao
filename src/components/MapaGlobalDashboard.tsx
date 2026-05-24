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

// Cluster simples
function clusterPins(devs: Empreendimento[], zoom: number) {
  if (!devs.length) return [];
  const threshold = zoom < 6 ? 3 : zoom < 9 ? 1 : zoom < 12 ? 0.3 : 0.05;
  const clusters: { devs: Empreendimento[]; lat: number; lng: number; isCluster: boolean }[] = [];
  const used = new Set<string>();
  devs.forEach(d => {
    if (used.has(d.id)) return;
    const nearby = devs.filter(o =>
      !used.has(o.id) &&
      Math.abs((o.lat ?? 0) - (d.lat ?? 0)) < threshold &&
      Math.abs((o.lng ?? 0) - (d.lng ?? 0)) < threshold
    );
    nearby.forEach(o => used.add(o.id));
    const lat = nearby.reduce((s, o) => s + (o.lat ?? 0), 0) / nearby.length;
    const lng = nearby.reduce((s, o) => s + (o.lng ?? 0), 0) / nearby.length;
    clusters.push({ devs: nearby, lat, lng, isCluster: nearby.length > 1 });
  });
  return clusters;
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
  const [painelAberto, setPainelAberto] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [camada, setCamada] = useState<Camada>("satelite");

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
  }

  return (
    <div className="relative w-full h-full flex" style={{ minHeight: 200, flex: 1, position: 'relative' }}>
      {/* MAPA */}
      <div ref={mapRef} style={{ position: 'absolute', inset: 0, pointerEvents: locked ? 'none' : 'auto' }} />

      {/* OVERLAY BLOQUEADO — captura cliques e scroll */}
      {locked && (
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 1000, cursor: 'not-allowed',
            background: flashLock ? 'rgba(239,68,68,0.08)' : 'transparent',
            transition: 'background 0.15s',
          }}
          onClick={() => {
            // Piscar vermelho e destacar cadeado
            setFlashLock(true);
            setTimeout(() => setFlashLock(false), 600);
          }}
          onWheel={(e) => e.stopPropagation()} // bloqueia scroll/zoom
        />
      )}

      {/* CADEADO — canto superior direito, sempre visível quando locked */}
      {locked && (
        <button
          onClick={() => { setLocked(false); }}
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 1001,
            background: flashLock ? '#ef4444' : 'white',
            color: flashLock ? 'white' : '#1e293b',
            border: flashLock ? '2px solid #ef4444' : '2px solid #e2e8f0',
            borderRadius: 12, padding: '8px 14px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 7,
            fontWeight: 900, fontSize: 12,
            boxShadow: flashLock ? '0 0 0 4px rgba(239,68,68,0.3)' : '0 2px 12px rgba(0,0,0,0.15)',
            transition: 'all 0.15s',
            animation: flashLock ? 'none' : undefined,
          }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          {flashLock ? 'Clique para desbloquear' : 'Bloqueado'}
        </button>
      )}

      {/* Instrução de clique quando desbloqueado para editar localização */}
      {!locked && onLocationPick && (
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1001, background: 'rgba(30,30,30,0.85)', color: 'white',
          padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700,
          whiteSpace: 'nowrap', pointerEvents: 'none',
          boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
        }}>
          📍 Clique no mapa para definir a localização
        </div>
      )}

      {/* POPUP DO EMPREENDIMENTO */}
      {selectedDev && (() => {
        const stats = calcularStats(selectedDev, sales);
        const mapsUrl = (selectedDev as any).googleMapsUrl || (selectedDev as any).mapaLocalizacaoUrl ||
          (selectedDev.lat ? `https://www.google.com/maps/@${selectedDev.lat},${selectedDev.lng},500m/data=!3m1!1e3` : "");
        return (
          <div className="absolute top-3 left-3 z-[1000] w-64 bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100">
            {/* Preview do mapa */}
            {((selectedDev as any).mapaImagemBase64 || (selectedDev as any).mapaImagemUrl) && (
              <div className="h-28 overflow-hidden bg-slate-100">
                <img
                  src={(selectedDev as any).mapaImagemLeveBase64 || (selectedDev as any).mapaImagemBase64 || (selectedDev as any).mapaImagemUrl}
                  className="w-full h-full object-cover"
                  alt="preview"
                />
              </div>
            )}
            <div className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-black text-slate-900 text-sm leading-tight">{selectedDev.nome}</h3>
                <button onClick={() => setSelectedDev(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none flex-shrink-0">×</button>
              </div>
              {selectedDev.cidade && (
                <p className="text-xs text-slate-500">📍 {selectedDev.cidade}{selectedDev.estado ? `, ${selectedDev.estado}` : ""}</p>
              )}
              {/* Stats */}
              <div className="grid grid-cols-3 gap-1 text-center">
                <div className="bg-slate-50 rounded-lg p-1.5">
                  <div className="text-sm font-black text-slate-800">{stats.total}</div>
                  <div className="text-[9px] text-slate-400 uppercase font-bold">Total</div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-1.5">
                  <div className="text-sm font-black text-emerald-700">{stats.disponiveis}</div>
                  <div className="text-[9px] text-emerald-500 uppercase font-bold">Disp.</div>
                </div>
                <div className="bg-red-50 rounded-lg p-1.5">
                  <div className="text-sm font-black text-red-600">{stats.vendidos}</div>
                  <div className="text-[9px] text-red-400 uppercase font-bold">Vend.</div>
                </div>
              </div>
              {/* Barra de progresso */}
              <div className="space-y-0.5">
                <div className="flex justify-between text-[10px] font-bold text-slate-400">
                  <span>Ocupação</span><span>{stats.pct}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
                    style={{ width: `${stats.pct}%` }} />
                </div>
              </div>
              {/* Botões */}
              <div className="flex gap-1.5">
                <button onClick={() => onVerMapa(selectedDev.id)}
                  className="flex-1 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase hover:bg-slate-700">
                  Ver mapa
                </button>
                <button onClick={() => onAbrirEmpreendimento(selectedDev.id)}
                  className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black uppercase hover:bg-slate-200">
                  Editar
                </button>
              </div>
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-blue-50 text-blue-700 text-[10px] font-black uppercase hover:bg-blue-100 border border-blue-100">
                  🌍 Abrir no Google Maps
                </a>
              )}
            </div>
          </div>
        );
      })()}

      {/* BUSCA — topo centralizado */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] w-72 max-w-[90vw]">
        <div className="relative">
          <input
            value={busca}
            onChange={e => {
              setBusca(e.target.value);
              // Centralizar no primeiro resultado ao digitar
              if (e.target.value.trim()) {
                const q = e.target.value.toLowerCase();
                const found = devsComLoc.find(d =>
                  d.nome.toLowerCase().includes(q) || d.cidade?.toLowerCase().includes(q)
                );
                if (found && leafletRef.current) {
                  leafletRef.current.flyTo([found.lat!, found.lng!], 15, { animate: true, duration: 0.8 });
                  setSelectedDev(found);
                }
              }
            }}
            placeholder="🔍  Buscar empreendimento..."
            className="w-full pl-4 pr-8 py-2.5 rounded-2xl bg-white/98 backdrop-blur text-sm font-semibold shadow-xl border border-slate-200/80 outline-none placeholder-slate-400"
          />
          {busca && (
            <button onClick={() => setBusca("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-lg leading-none">
              ×
            </button>
          )}
        </div>
      </div>

      {/* CONTROLES — canto superior esquerdo */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1.5">
        {/* Centralizar */}
        <button
          onClick={() => {
            if (!leafletRef.current) return;
            const devs = devsComLoc;
            if (devs.length === 0) return;
            import("leaflet").then(L => {
              if (!leafletRef.current) return;
              if (devs.length === 1) {
                leafletRef.current.flyTo([devs[0].lat!, devs[0].lng!], 15, { animate: true, duration: 1 });
              } else {
                const bounds = L.latLngBounds(devs.map(d => [d.lat!, d.lng!] as [number, number]));
                leafletRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 14, animate: true });
              }
            });
          }}
          className="bg-white text-slate-700 rounded-xl px-3 py-2 text-[11px] font-black shadow-lg border border-slate-200 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all flex items-center gap-1.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>
          Centralizar
        </button>
        {/* Filtros rápidos */}
        <div className="flex flex-col gap-1">
          {(["todos","com_mapa","disponiveis"] as Filtro[]).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black shadow transition-all whitespace-nowrap ${filtro === f ? "bg-slate-900 text-white" : "bg-white/95 text-slate-600 hover:bg-white border border-slate-200"}`}>
              {f === "todos" ? "Todos" : f === "com_mapa" ? "Com mapa" : "Disponíveis"}
            </button>
          ))}
        </div>
      </div>

      {/* CAMADAS — canto direito */}
      <div className="absolute top-14 right-3 z-[1000] flex flex-col gap-1">
        {(["satelite","hibrido","ruas"] as Camada[]).map(c => (
          <button key={c} onClick={() => setCamada(c)}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black shadow-md transition-all whitespace-nowrap ${camada === c ? "bg-slate-900 text-white" : "bg-white/95 text-slate-700 hover:bg-white border border-slate-200"}`}>
            {c === "satelite" ? "🛰 Satélite" : c === "hibrido" ? "🌍 Híbrido" : "🗺 Ruas"}
          </button>
        ))}
      </div>

      {/* MINHA LOCALIZAÇÃO */}
      <button
        onClick={() => {
          navigator.geolocation.getCurrentPosition(
            pos => {
              leafletRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 15, { animate: true, duration: 1 });
              import("leaflet").then(L => {
                L.circleMarker([pos.coords.latitude, pos.coords.longitude], {
                  radius: 10, color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.8, weight: 3,
                }).addTo(leafletRef.current!).bindPopup("📍 Você está aqui").openPopup();
              });
            },
            err => {
              const msgs: Record<number, string> = { 1: "Permissão negada.", 2: "GPS indisponível.", 3: "Tempo esgotado." };
              alert(msgs[err.code] || err.message);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
          );
        }}
        className="absolute bottom-3 left-3 z-[1000] bg-white/95 text-slate-700 rounded-xl px-3 py-2 text-[11px] font-black shadow-lg border border-slate-200 hover:bg-white"
      >
        📍 Minha localização
      </button>

      {/* PAINEL LATERAL */}
      {devsComLoc.length > 1 && (
        <>
          <button onClick={() => setPainelAberto(p => !p)}
            className="absolute bottom-3 right-3 z-[1000] bg-slate-900 text-white rounded-xl px-3 py-1.5 text-[11px] font-black shadow-md hidden lg:block">
            {painelAberto ? "Ocultar lista" : "Ver lista"}
          </button>
          {painelAberto && (
            <div className="absolute top-0 bottom-0 right-0 z-[999] w-52 bg-white/95 backdrop-blur-sm shadow-2xl overflow-y-auto hidden lg:block border-l border-slate-100">
              <div className="p-3 border-b border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{devsComLoc.length} empreendimentos</p>
              </div>
              {devsFiltrados.map(dev => {
                const stats = calcularStats(dev, sales);
                return (
                  <button key={dev.id} onClick={() => centralizarEm(dev)}
                    className={`w-full text-left px-3 py-2.5 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selectedDev?.id === dev.id ? "bg-emerald-50" : ""}`}>
                    <p className="text-xs font-bold text-slate-800 leading-tight truncate">{dev.nome}</p>
                    {dev.cidade && <p className="text-[10px] text-slate-400 truncate">{dev.cidade}</p>}
                    <div className="flex gap-2 mt-1 text-[10px]">
                      <span className="text-emerald-600 font-bold">{stats.disponiveis} disp.</span>
                      <span className="text-slate-400">{stats.pct}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
