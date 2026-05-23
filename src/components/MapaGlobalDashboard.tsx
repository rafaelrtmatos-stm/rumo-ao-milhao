import { useEffect, useRef, useState, useMemo } from "react";
import type { Empreendimento, Venda } from "../types";

interface Props {
  empreendimentos: Empreendimento[];
  sales: Venda[];
  onAbrirEmpreendimento: (id: string) => void;
  onVerMapa: (id: string) => void;
  visible?: boolean;
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
const TILES: Record<Camada, { url: string; options: any; overlay?: { url: string; options: any } }> = {
  satelite: {
    // Google Satellite — tiles públicos gratuitos, sem API key
    url: "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    options: { maxZoom: 20, subdomains: "0123", attribution: "© Google" },
  },
  hibrido: {
    // Google Hybrid — satélite + ruas e nomes
    url: "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    options: { maxZoom: 20, subdomains: "0123", attribution: "© Google" },
  },
  ruas: {
    // Google Roads
    url: "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
    options: { maxZoom: 20, subdomains: "0123", attribution: "© Google" },
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

export default function MapaGlobalDashboard({ empreendimentos, sales, onAbrirEmpreendimento, onVerMapa, visible = true }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);
  const tileRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [selectedDev, setSelectedDev] = useState<Empreendimento | null>(null);
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
    empreendimentos.filter(d => d.lat != null && d.lng != null && d.lat !== 0 && d.lng !== 0),
    [empreendimentos]
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

  // Centralizar quando empreendimentos carregarem (resolve closure stale)
  const centradoRef = useRef(false);
  useEffect(() => {
    if (!mapReady || !leafletRef.current) return;
    const devs = empreendimentos.filter(d => d.lat && d.lng && d.lat !== 0);
    if (devs.length === 0) return;
    if (centradoRef.current) return; // Só centraliza uma vez
    centradoRef.current = true;
    import("leaflet").then(L => {
      if (!leafletRef.current) return;
      if (devs.length === 1) {
        leafletRef.current.flyTo([devs[0].lat!, devs[0].lng!], 15, { animate: true, duration: 1.2 });
      } else {
        const bounds = L.latLngBounds(devs.map(d => [d.lat!, d.lng!] as [number, number]));
        leafletRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 14, animate: true });
      }
    });
  }, [mapReady, empreendimentos]);

  // Trocar camada
  useEffect(() => {
    if (!mapReady || !leafletRef.current) return;
    import("leaflet").then(L => {
      if (tileRef.current) { tileRef.current.remove(); tileRef.current = null; }
      const cfg = TILES[camada];
      tileRef.current = L.tileLayer(cfg.url, cfg.options).addTo(leafletRef.current!);
    });
  }, [camada, mapReady]);

  // Atualizar marcadores
  useEffect(() => {
    if (!mapReady || !leafletRef.current) return;
    import("leaflet").then(L => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      const clusters = clusterPins(devsFiltrados, mapZoom);

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
          const stats = calcularStats(dev, sales);
          const pct = stats.pct;
          const color = pct >= 80 ? "#ef4444" : pct >= 50 ? "#f59e0b" : "#22c55e";
          icon = L.divIcon({
            className: "",
            html: `<div style="position:relative;cursor:pointer;">
              <div style="background:${color};color:white;border-radius:10px 10px 10px 0;
                padding:4px 8px;font-size:11px;font-weight:900;white-space:nowrap;
                border:2.5px solid white;box-shadow:0 3px 12px rgba(0,0,0,0.5);
                transform:rotate(-0deg);max-width:120px;overflow:hidden;text-overflow:ellipsis;">
                ${dev.nome.length > 14 ? dev.nome.slice(0,14)+'…' : dev.nome}
              </div>
              <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;
                border-top:8px solid ${color};margin-left:4px;"></div>
            </div>`,
            iconSize: [130, 44], iconAnchor: [6, 44],
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
    <div className="relative w-full h-full flex">
      {/* MAPA */}
      <div ref={mapRef} className="flex-1 h-full" />

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
            <div className="absolute top-0 bottom-0 left-0 z-[999] w-52 bg-white/95 backdrop-blur-sm shadow-2xl overflow-y-auto hidden lg:block border-r border-slate-100">
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
