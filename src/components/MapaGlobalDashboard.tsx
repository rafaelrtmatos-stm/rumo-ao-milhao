import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import type { Empreendimento, Venda } from "../types";

interface Props {
  empreendimentos: Empreendimento[];
  sales: Venda[];
  onAbrirEmpreendimento: (id: string) => void;
  onVerMapa: (id: string) => void;
}

type Filtro = "todos" | "com_mapa" | "mais_vendidos" | "disponiveis";

function calcularStats(dev: Empreendimento, sales: Venda[]) {
  const vendas = sales.filter(s => s.empreendimentoId === dev.id && s.status !== "cancelado");
  const vendidos = dev.lotesVendidos ?? vendas.length;
  const total = dev.totalLotes ?? 0;
  const disponiveis = Math.max(0, total - vendidos);
  const pct = total > 0 ? Math.round((vendidos / total) * 100) : 0;
  return { vendidos, total, disponiveis, pct };
}

// Cluster simples: agrupa pins próximos
function clusterPins(devs: Empreendimento[], zoom: number): { devs: Empreendimento[]; lat: number; lng: number; isCluster: boolean }[] {
  if (devs.length === 0) return [];
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
    const avgLat = nearby.reduce((s, o) => s + (o.lat ?? 0), 0) / nearby.length;
    const avgLng = nearby.reduce((s, o) => s + (o.lng ?? 0), 0) / nearby.length;
    clusters.push({ devs: nearby, lat: avgLat, lng: avgLng, isCluster: nearby.length > 1 });
  });
  return clusters;
}

export default function MapaGlobalDashboard({ empreendimentos, sales, onAbrirEmpreendimento, onVerMapa }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [selectedDev, setSelectedDev] = useState<Empreendimento | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [mapZoom, setMapZoom] = useState(5);
  const [painelAberto, setPainelAberto] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [camada, setCamada] = useState<'ruas'|'satelite'|'hibrido'>('ruas');
  const tileLayerRef = useRef<any>(null);

  // Empreendimentos com coordenadas válidas
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
    if (!mapRef.current || leafletMapRef.current) return;
    let cancelled = false;

    import("leaflet").then(L => {
      if (cancelled || !mapRef.current || leafletMapRef.current) return;

      // Fix ícones padrão do Leaflet
      (L.Icon.Default as any).mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current!, {
        center: [-5, -55],
        zoom: 5,
        zoomControl: false,
        attributionControl: false,
      });

      L.control.zoom({ position: "bottomright" }).addTo(map);

      map.on("zoomend", () => setMapZoom(map.getZoom()));

      // Camada inicial
      const tile = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
      tileLayerRef.current = tile;

      leafletMapRef.current = map;
      setMapReady(true);
    });

    return () => {
      cancelled = true;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  // Atualizar marcadores quando muda filtro/zoom
  useEffect(() => {
    if (!mapReady || !leafletMapRef.current) return;
    const map = leafletMapRef.current;

    import("leaflet").then(L => {
      // Limpar marcadores anteriores
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      const clusters = clusterPins(devsFiltrados, mapZoom);

      clusters.forEach(cluster => {
        if (cluster.isCluster) {
          // Pin de cluster
          const icon = L.divIcon({
            className: "",
            html: `<div style="
              background: #1a3a1a;
              color: white;
              border-radius: 50%;
              width: 44px;
              height: 44px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 13px;
              font-weight: 800;
              border: 3px solid white;
              box-shadow: 0 2px 12px rgba(0,0,0,0.3);
              cursor: pointer;
            ">+${cluster.devs.length}</div>`,
            iconSize: [44, 44],
            iconAnchor: [22, 22],
          });

          const m = L.marker([cluster.lat, cluster.lng], { icon }).addTo(map);
          m.on("click", () => {
            map.setView([cluster.lat, cluster.lng], Math.min(map.getZoom() + 3, 14));
          });
          markersRef.current.push(m);
        } else {
          const dev = cluster.devs[0];
          const stats = calcularStats(dev, sales);
          const pctColor = stats.pct >= 80 ? "#ef4444" : stats.pct >= 50 ? "#f59e0b" : "#22c55e";

          const icon = L.divIcon({
            className: "",
            html: `<div style="
              position: relative;
              display: flex;
              flex-direction: column;
              align-items: center;
              cursor: pointer;
            ">
              <div style="
                background: white;
                border: 2.5px solid #1a3a1a;
                border-radius: 12px;
                padding: 5px 10px;
                font-size: 11px;
                font-weight: 700;
                color: #1a3a1a;
                white-space: nowrap;
                max-width: 130px;
                overflow: hidden;
                text-overflow: ellipsis;
                box-shadow: 0 2px 12px rgba(0,0,0,0.2);
                line-height: 1.3;
              ">
                <div style="font-size:10px; color:#64748b; font-weight:600">${dev.cidade || ""}</div>
                <div>${dev.nome.length > 16 ? dev.nome.slice(0, 14) + "…" : dev.nome}</div>
                <div style="margin-top:3px; height:4px; background:#e2e8f0; border-radius:2px; overflow:hidden;">
                  <div style="height:100%; width:${stats.pct}%; background:${pctColor}; border-radius:2px;"></div>
                </div>
              </div>
              <div style="
                width: 0; height: 0;
                border-left: 7px solid transparent;
                border-right: 7px solid transparent;
                border-top: 9px solid #1a3a1a;
                margin-top: -1px;
              "></div>
            </div>`,
            iconSize: [140, 58],
            iconAnchor: [70, 58],
          });

          const m = L.marker([dev.lat!, dev.lng!], { icon }).addTo(map);
          m.on("click", () => setSelectedDev(dev));
          markersRef.current.push(m);
        }
      });
    });
  }, [mapReady, devsFiltrados, mapZoom, sales]);

  // Trocar camada do mapa
  useEffect(() => {
    if (!mapReady || !leafletMapRef.current || !tileLayerRef.current) return;
    import("leaflet").then(L => {
      if (tileLayerRef.current) {
        tileLayerRef.current.remove();
      }
      const urls: Record<string, string> = {
        ruas: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        satelite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        hibrido: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      };
      tileLayerRef.current = L.tileLayer(urls[camada], { maxZoom: 19 }).addTo(leafletMapRef.current!);
      // Overlay de ruas para modo híbrido
      if (camada === 'hibrido') {
        L.tileLayer("https://stamen-tiles.a.ssl.fastly.net/toner-hybrid/{z}/{x}/{y}.png", { maxZoom: 19, opacity: 0.5 }).addTo(leafletMapRef.current!);
      }
    });
  }, [camada, mapReady]);

  // Centralizar ao buscar
  function centralizarEm(dev: Empreendimento) {
    if (!leafletMapRef.current || dev.lat == null || dev.lng == null) return;
    leafletMapRef.current.setView([dev.lat, dev.lng], 14, { animate: true });
    setSelectedDev(dev);
  }

  const stats = selectedDev ? calcularStats(selectedDev, sales) : null;
  const semCoordenadas = empreendimentos.length - devsComLoc.length;

  return (
    <div className="relative w-full h-full flex" style={{ minHeight: 480 }}>
      {/* MAPA */}
      <div className="flex-1 relative">
        {/* CSS do Leaflet via link */}
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />

        <div ref={mapRef} className="absolute inset-0 rounded-2xl overflow-hidden" />

        {/* Filtros flutuantes */}
        <div className="absolute top-3 left-3 z-[1000] flex gap-1.5 flex-wrap">
          {(["todos", "com_mapa", "disponiveis", "mais_vendidos"] as Filtro[]).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase shadow-md transition-all ${filtro === f ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
              {f === "todos" ? "Todos" : f === "com_mapa" ? "Com mapa" : f === "disponiveis" ? "Disponíveis" : "Mais vendidos"}
            </button>
          ))}
        </div>

        {/* Busca */}
        <div className="absolute top-3 right-3 z-[1000]">
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar empreendimento..."
            className="w-52 px-3 py-2 rounded-xl text-xs shadow-md border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        {/* Contador */}
        <div className="absolute bottom-3 left-3 z-[1000] flex gap-2 items-center">
          <div className="bg-white rounded-xl px-3 py-1.5 text-[11px] font-bold text-slate-600 shadow-md">
            {devsFiltrados.length} empreendimento{devsFiltrados.length !== 1 ? "s" : ""} no mapa
            {semCoordenadas > 0 && <span className="text-slate-400 ml-1">· {semCoordenadas} sem localização</span>}
          </div>
          <button
            onClick={() => {
              if (!leafletMapRef.current) return;
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  leafletMapRef.current!.setView([pos.coords.latitude, pos.coords.longitude], 13, { animate: true });
                  import("leaflet").then(L => {
                    L.circleMarker([pos.coords.latitude, pos.coords.longitude], {
                      radius: 10, color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.7, weight: 3,
                    }).addTo(leafletMapRef.current!).bindPopup("Você está aqui").openPopup();
                  });
                },
                () => alert("Não foi possível obter sua localização.")
              );
            }}
            className="bg-white rounded-xl px-3 py-1.5 text-[11px] font-bold text-blue-600 shadow-md hover:bg-blue-50"
            title="Centralizar na minha localização"
          >
            📍 Minha localização
          </button>
        </div>

        {/* Camadas */}
        <div className="absolute bottom-12 right-3 z-[1000] flex flex-col gap-1">
          {([['ruas','🗺 Ruas'],['satelite','🛰 Satélite'],['hibrido','🌍 Híbrido']] as [typeof camada, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setCamada(id)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black shadow-md transition-all ${camada === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Botão painel */}
        <button
          onClick={() => setPainelAberto(p => !p)}
          className="absolute bottom-3 right-3 z-[1000] bg-slate-900 text-white rounded-xl px-3 py-1.5 text-[11px] font-black shadow-md hidden lg:block"
        >
          {painelAberto ? "Ocultar lista" : "Ver lista"}
        </button>

        {/* Popup selecionado */}
        {selectedDev && stats && (
          <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-[2000] bg-white rounded-2xl shadow-2xl border border-slate-100 w-72 overflow-hidden">
            {/* Mini preview do mapa */}
            {(selectedDev.mapaImagemBase64 || selectedDev.mapaImagemUrl) && (
              <div className="h-28 overflow-hidden bg-slate-100">
                <img
                  src={selectedDev.mapaImagemBase64 || selectedDev.mapaImagemUrl}
                  alt="Preview"
                  className="w-full h-full object-cover opacity-80"
                />
              </div>
            )}
            <div className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-black text-slate-900 text-sm">{selectedDev.nome}</h3>
                  <p className="text-[11px] text-slate-400">{[selectedDev.cidade, selectedDev.estado].filter(Boolean).join(" · ")}</p>
                </div>
                <button onClick={() => setSelectedDev(null)} className="text-slate-300 hover:text-slate-600 text-lg leading-none">×</button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: "Total", val: stats.total, color: "text-slate-700" },
                  { label: "Vendidos", val: stats.vendidos, color: "text-red-500" },
                  { label: "Disponíveis", val: stats.disponiveis, color: "text-emerald-600" },
                ].map(s => (
                  <div key={s.label} className="text-center bg-slate-50 rounded-xl py-2">
                    <div className={`text-lg font-black ${s.color}`}>{s.val}</div>
                    <div className="text-[9px] text-slate-400 uppercase font-bold">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Barra de progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1">
                  <span>Ocupação</span><span>{stats.pct}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-red-400 transition-all"
                    style={{ width: `${stats.pct}%` }} />
                </div>
              </div>

              {/* Botões */}
              <div className="grid grid-cols-2 gap-2">
                {(selectedDev.mapaImagemBase64 || selectedDev.mapaPdfOriginalBase64 || selectedDev.mapaImagemUrl) && (
                  <button onClick={() => { onVerMapa(selectedDev.id); setSelectedDev(null); }}
                    className="py-2 rounded-xl text-[11px] font-black bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all">
                    🗺 Ver mapa
                  </button>
                )}
                <button onClick={() => { onAbrirEmpreendimento(selectedDev.id); setSelectedDev(null); }}
                  className="py-2 rounded-xl text-[11px] font-black bg-slate-900 text-white hover:bg-slate-800 transition-all col-span-1">
                  Abrir →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PAINEL LATERAL */}
      {painelAberto && (
        <div className="hidden lg:flex flex-col w-72 bg-white border-l border-slate-100 rounded-r-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-black text-slate-900 text-sm">Empreendimentos</h3>
            <p className="text-[11px] text-slate-400">{devsFiltrados.length} com localização</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {devsFiltrados.length === 0 && (
              <div className="p-6 text-center text-slate-400 text-xs">
                Nenhum empreendimento com coordenadas cadastradas.
              </div>
            )}
            {devsFiltrados.map(dev => {
              const s = calcularStats(dev, sales);
              const isSelected = selectedDev?.id === dev.id;
              return (
                <button key={dev.id} onClick={() => centralizarEm(dev)}
                  className={`w-full text-left p-4 border-b border-slate-50 hover:bg-slate-50 transition-all ${isSelected ? "bg-slate-50 border-l-4 border-l-slate-900" : ""}`}>
                  <div className="font-bold text-slate-900 text-xs truncate">{dev.nome}</div>
                  <div className="text-[10px] text-slate-400">{[dev.cidade, dev.estado].filter(Boolean).join(" · ")}</div>
                  <div className="flex gap-3 mt-1.5">
                    <span className="text-[10px] text-emerald-600 font-bold">{s.disponiveis} disp.</span>
                    <span className="text-[10px] text-red-500 font-bold">{s.vendidos} vend.</span>
                    <span className="text-[10px] text-slate-400">{s.pct}%</span>
                  </div>
                  <div className="mt-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-400 to-red-400 rounded-full"
                      style={{ width: `${s.pct}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
