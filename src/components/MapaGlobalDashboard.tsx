import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useMemo } from "react";
import type { Empreendimento, Venda, AppConfig } from "../types";

interface Props {
  empreendimentos: Empreendimento[];
  sales: Venda[];
  onAbrirEmpreendimento: (id: string) => void;
  onVerMapa: (id: string) => void;
  visible?: boolean;
  focusDevId?: string | null;
  onLocationPick?: (lat: number, lng: number) => void;
  config?: AppConfig;
  onSaveConfig?: (c: AppConfig) => void;
}

type Camada = "satelite" | "hibrido" | "ruas";

function validLatLng(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && typeof lng === 'number'
    && isFinite(lat) && isFinite(lng)
    && lat !== 0 && lng !== 0
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function calcularStats(dev: Empreendimento, sales: Venda[]) {
  const vendas = sales.filter(function(s) { return s.empreendimentoId === dev.id && s.status !== "cancelado"; });
  const vendidos = dev.lotesVendidos ?? vendas.length;
  const total = dev.totalLotes ?? 0;
  const disponiveis = Math.max(0, total - vendidos);
  const pct = total > 0 ? Math.round((vendidos / total) * 100) : 0;
  return { vendidos, total, disponiveis, pct };
}

const TILES: Record<Camada, { url: string; options: any }> = {
  satelite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: { maxZoom: 19, maxNativeZoom: 19, attribution: "© Esri, Maxar", crossOrigin: true },
  },
  hibrido: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: { maxZoom: 19, maxNativeZoom: 19, attribution: "© Esri", crossOrigin: true },
  },
  ruas: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    options: { maxZoom: 19, subdomains: "abcd", attribution: "© CartoDB", crossOrigin: true },
  },
};

function clusterPins(devs: Empreendimento[]) {
  if (!devs.length) return [];
  return devs.map(function(d) { return { devs: [d], lat: d.lat!, lng: d.lng!, isCluster: false }; });
}

export interface MapaGlobalHandle {
  centralizar: () => void;
  minhaLocalizacao: () => void;
}

const MapaGlobalDashboard = forwardRef<MapaGlobalHandle, Props>(function MapaGlobalDashboard(
  { empreendimentos, sales, onAbrirEmpreendimento, onVerMapa, visible = true, focusDevId = null, onLocationPick, config: appCfg = {} as AppConfig, onSaveConfig },
  ref
) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);
  const tileRef = useRef<any>(null);
  const overlayRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  const [selectedDev, setSelectedDev] = useState<Empreendimento | null>(null);
  const [locked, setLocked] = useState(!!focusDevId);
  const [flashLock, setFlashLock] = useState(false);
  const [mapZoom, setMapZoom] = useState(5);
  const [mapReady, setMapReady] = useState(false);
  const [camada, setCamada] = useState<Camada>("satelite");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapaLocked, setMapaLocked] = useState(true);
  const [busca, setBusca] = useState("");

  // Altura do mapa — persiste apenas em memória de sessão (localStorage só para UI)
  const [mapHeight, setMapHeight] = useState(function() {
    try {
      const saved = localStorage.getItem('mapGlobalHeight');
      return saved ? Math.max(300, Math.min(window.innerHeight, parseInt(saved))) : 480;
    } catch { return 480; }
  });

  // Tamanho e cor do pino — lidos do banco via config prop
  const [pinSize, setPinSize] = useState<number>(function() {
    return Number((appCfg as any).mapPinSize) || 22;
  });
  const [pinColor, setPinColor] = useState<string>(function() {
    return String((appCfg as any).mapPinColor || '#e53935');
  });

  // Sincronizar pinSize e pinColor quando config mudar (dados chegando do banco)
  useEffect(function() {
    if ((appCfg as any).mapPinSize) setPinSize(Number((appCfg as any).mapPinSize));
  }, [(appCfg as any).mapPinSize]);

  useEffect(function() {
    if ((appCfg as any).mapPinColor) setPinColor(String((appCfg as any).mapPinColor));
  }, [(appCfg as any).mapPinColor]);

  const resizeDragRef = useRef<{startY:number;startH:number}|null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const empreendimentosFiltrados = useMemo(function() {
    return focusDevId ? empreendimentos.filter(function(d) { return d.id === focusDevId; }) : empreendimentos;
  }, [empreendimentos, focusDevId]);

  const devsComLoc = useMemo(function() {
    return empreendimentosFiltrados.filter(function(d) { return validLatLng(d.lat, d.lng); });
  }, [empreendimentosFiltrados]);

  const devsFiltrados = useMemo(function() {
    let list = devsComLoc;
    if (busca.trim()) {
      const termoBusca = String(busca || "").toLowerCase();
      list = list.filter(function(devItem) {
        const nomeDevItem = String(devItem.nome ?? '').toLowerCase();
        const cidadeDevItem = String(devItem.cidade ?? '').toLowerCase();
        return nomeDevItem.includes(termoBusca) || cidadeDevItem.includes(termoBusca);
      });
    }
    return list;
  }, [devsComLoc, busca]);

  // ResizeObserver para invalidar mapa quando container muda de tamanho
  useEffect(function() {
    if (!containerRef.current || !leafletRef.current) return;
    const devsSnapshot = devsComLoc;
    const ro = new ResizeObserver(function() {
      if (!leafletRef.current) return;
      leafletRef.current.invalidateSize?.();
      if (!devsSnapshot || devsSnapshot.length === 0) return;
      import("leaflet").then(function(L) {
        if (!leafletRef.current) return;
        const validDevs = devsSnapshot.filter(function(d) { return validLatLng(d.lat, d.lng); });
        if (validDevs.length === 0) return;
        if (validDevs.length === 1) {
          leafletRef.current.setView([validDevs[0].lat!, validDevs[0].lng!], 14, { animate: false });
        } else {
          const bounds = L.latLngBounds(validDevs.map(function(d) { return [d.lat!, d.lng!] as [number,number]; }));
          leafletRef.current.fitBounds(bounds, { paddingTopLeft: [50, 10], paddingBottomRight: [50, 120], maxZoom: 12, animate: false });
        }
      });
    });
    ro.observe(containerRef.current);
    return function() { ro.disconnect(); };
  }, [devsComLoc, mapReady]);

  useImperativeHandle(ref, function() { return {
    centralizar: function() {
      if (!leafletRef.current) return;
      const devs = (Array.isArray(devsComLoc) ? devsComLoc : []).filter(function(d) { return validLatLng(d.lat, d.lng); });
      if (!devs.length) return;
      const mapInst = leafletRef.current;
      import("leaflet").then(function(L) {
        if (!mapInst || !leafletRef.current) return;
        if (devs.length === 1) mapInst.flyTo([devs[0].lat!, devs[0].lng!], 15, { animate: true, duration: 1 });
        else {
          const bounds = L.latLngBounds(devs.map(function(d) { return [d.lat!, d.lng!] as [number,number]; }));
          mapInst.fitBounds(bounds, { padding: [40,40], maxZoom: 14, animate: true });
        }
      });
    },
    minhaLocalizacao: function() {
      navigator.geolocation.getCurrentPosition(
        function(pos) { leafletRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 15, { animate: true, duration: 1 }); },
        function(err) { const m: Record<number,string>={1:"Permissão negada.",2:"GPS indisponível.",3:"Tempo esgotado."}; alert(m[err.code]||err.message); },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    },
  }; }, [devsComLoc]);

  // Inicializar mapa Leaflet
  useEffect(function() {
    if (!mapRef.current || leafletRef.current) return;
    let cancelled = false;
    import("leaflet").then(function(L) {
      if (cancelled || !mapRef.current || leafletRef.current) return;
      const map = L.map(mapRef.current!, {
        center: [-5, -52], zoom: 5,
        zoomControl: false, attributionControl: false, doubleClickZoom: true,
      });
      tileRef.current = L.tileLayer(TILES.satelite.url, TILES.satelite.options).addTo(map);
      map.on("zoomend", function() { setMapZoom(map.getZoom()); });
      map.on('click', function(e: any) {
        if (onLocationPick) onLocationPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
      });
      leafletRef.current = map;
      setMapReady(true);

      const centralizarPinos = function(tentativa: number) {
        if (!leafletRef.current) return;
        const devs = empreendimentos.filter(function(d) {
          return typeof d.lat === 'number' && typeof d.lng === 'number' && isFinite(d.lat!) && d.lat !== 0 && d.lng !== 0;
        });
        if (!devs.length) return;
        import("leaflet").then(function(L2) {
          if (!leafletRef.current) return;
          leafletRef.current.invalidateSize({ animate: false });
          const mapSize = leafletRef.current.getSize();
          if (mapSize.y < 100 && tentativa < 15) { setTimeout(function() { centralizarPinos(tentativa + 1); }, 200); return; }
          if (devs.length === 1) {
            leafletRef.current.setView([devs[0].lat!, devs[0].lng!], 13, { animate: false });
          } else {
            const bounds = L2.latLngBounds(devs.map(function(d) { return [d.lat!, d.lng!] as [number,number]; }));
            leafletRef.current.fitBounds(bounds, { paddingTopLeft: [50, 10], paddingBottomRight: [50, 120], maxZoom: 12, animate: false });
          }
        });
      };
      setTimeout(function() { centralizarPinos(0); }, 500);
    });
    return function() {
      cancelled = true;
      if (leafletRef.current) { leafletRef.current.remove(); leafletRef.current = null; }
    };
  }, []);

  useEffect(function() {
    if (!visible || !leafletRef.current) return;
    const map = leafletRef.current;
    const fix = function() { map?.invalidateSize({ animate: false }); };
    fix();
    const t1 = setTimeout(fix, 50);
    const t2 = setTimeout(fix, 150);
    const t3 = setTimeout(fix, 400);
    return function() { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [visible]);

  useEffect(function() {
    if (!mapRef.current) return;
    const ro = new ResizeObserver(function() { leafletRef.current?.invalidateSize({ animate: false }); });
    ro.observe(mapRef.current);
    return function() { ro.disconnect(); };
  }, [mapReady]);

  const centradoRef = useRef<string | false>(false);
  useEffect(function() {
    if (!mapReady || !leafletRef.current) return;
    const devs = empreendimentosFiltrados.filter(function(d) { return d.lat && d.lng && d.lat !== 0; });
    if (devs.length === 0) return;
    if (centradoRef.current === (focusDevId || "todos")) return;
    centradoRef.current = focusDevId || "todos";
    import("leaflet").then(function(L) {
      if (!leafletRef.current) return;
      if (devs.length === 1) {
        const zoomLevel = focusDevId ? 17 : 15;
        leafletRef.current.flyTo([devs[0].lat!, devs[0].lng!], zoomLevel, { animate: true, duration: 1.0 });
      } else {
        const bounds = L.latLngBounds(devs.map(function(d) { return [d.lat!, d.lng!] as [number, number]; }));
        leafletRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 16, animate: true });
      }
    });
  }, [mapReady, empreendimentos]);

  // Trocar camada de tiles
  useEffect(function() {
    if (!mapReady || !leafletRef.current) return;
    import("leaflet").then(function(L) {
      if (tileRef.current) { tileRef.current.remove(); tileRef.current = null; }
      if (overlayRef.current) { overlayRef.current.remove(); overlayRef.current = null; }
      const tileCfg = TILES[camada];
      tileRef.current = L.tileLayer(tileCfg.url, tileCfg.options).addTo(leafletRef.current!);
      if (camada === 'hibrido') {
        overlayRef.current = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 19, opacity: 0.8, crossOrigin: true }
        ).addTo(leafletRef.current!);
      }
    });
  }, [camada, mapReady]);

  // Renderizar marcadores
  useEffect(function() {
    if (!mapReady || !leafletRef.current) return;
    import("leaflet").then(function(L) {
      markersRef.current.forEach(function(m) { m.remove(); });
      markersRef.current = [];

      const clusters = clusterPins(devsComLoc);
      clusters.forEach(function(cluster) {
        let icon: any;
        if (cluster.isCluster) {
          icon = L.divIcon({
            className: "",
            html: '<div style="background:#1a4a1a;color:white;border-radius:50%;width:46px;height:46px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px;border:3px solid white;box-shadow:0 3px 12px rgba(0,0,0,0.5);cursor:pointer;">' + cluster.devs.length + '</div>',
            iconSize: [46, 46], iconAnchor: [23, 23],
          });
        } else {
          const dev = cluster.devs[0];
          const preps = new Set(['de','da','do','das','dos','e','em','na','no']);
          const fmtNome = function(n: string) {
            return n.toLowerCase().split(' ').map(function(w, i) {
              return i > 0 && preps.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1);
            }).join(' ');
          };
          const nome = fmtNome(dev.nome.length > 18 ? dev.nome.slice(0,18)+'…' : dev.nome);
          icon = L.divIcon({
            className: "",
            html: '<div style="display:flex;align-items:center;gap:4px;cursor:pointer;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.45));">'
              + '<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">'
              + '<div style="width:' + pinSize + 'px;height:' + pinSize + 'px;background:' + pinColor + ';border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2.5px solid white;box-shadow:0 2px 6px ' + pinColor + '99;"></div>'
              + '<div style="width:' + Math.round(pinSize*0.18) + 'px;height:' + Math.round(pinSize*0.36) + 'px;background:' + pinColor + ';margin-top:-1px;border-radius:0 0 2px 2px;"></div>'
              + '</div>'
              + '<div style="background:rgba(30,30,30,0.82);color:white;padding:3px 8px;border-radius:8px;font-size:11px;font-weight:700;white-space:nowrap;letter-spacing:0.2px;backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,0.15);max-width:140px;overflow:hidden;text-overflow:ellipsis;">'
              + nome
              + '</div></div>',
            iconSize: [200, 36], iconAnchor: [Math.round(pinSize*0.5), pinSize + Math.round(pinSize*0.36)],
          });
        }

        const marker = L.marker([cluster.lat, cluster.lng], { icon }).addTo(leafletRef.current!);
        if (cluster.isCluster) {
          marker.on("click", function() {
            if (!validLatLng(cluster.lat, cluster.lng)) return;
            leafletRef.current!.flyTo([cluster.lat, cluster.lng], Math.min(leafletRef.current!.getZoom() + 3, 15), { animate: true, duration: 0.8 });
          });
        } else {
          marker.on("click", function() { setSelectedDev(cluster.devs[0]); });
        }
        markersRef.current.push(marker);
      });
    });
  }, [devsFiltrados, mapZoom, mapReady, sales, pinSize, pinColor]);

  function toggleFullscreen() {
    if (!isFullscreen) {
      setIsFullscreen(true);
      document.body.style.overflow = 'hidden';
      try { (screen.orientation as any).lock?.('landscape').catch(function() {}); } catch {}
    } else {
      setIsFullscreen(false);
      document.body.style.overflow = '';
      try { (screen.orientation as any).unlock?.(); } catch {}
    }
    const mapInst = leafletRef.current;
    if (mapInst) setTimeout(function() { mapInst?.invalidateSize?.(); }, 300);
  }

  function startResizeDrag(e: React.MouseEvent | React.TouchEvent) {
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    resizeDragRef.current = { startY: clientY, startH: mapHeight };
    const onMove = function(ev: MouseEvent | TouchEvent) {
      if (!resizeDragRef.current) return;
      const y = 'touches' in ev ? (ev as TouchEvent).touches[0].clientY : (ev as MouseEvent).clientY;
      const newH = Math.max(300, Math.min(window.innerHeight - 100, resizeDragRef.current.startH + (y - resizeDragRef.current.startY)));
      setMapHeight(newH);
      try { localStorage.setItem('mapGlobalHeight', String(Math.round(newH))); } catch {}
      leafletRef.current?.invalidateSize?.();
    };
    const onUp = function() {
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

  function salvarPinConfig(novoSize: number, novaCor: string) {
    if (onSaveConfig) onSaveConfig({ ...appCfg, mapPinSize: novoSize, mapPinColor: novaCor } as AppConfig);
  }

  const totalDisponiveis = devsComLoc.reduce(function(s,d) { return s + Math.max(0,(d.totalLotes??0)-(d.lotesVendidos??0)); }, 0);
  const totalVendidos = devsComLoc.reduce(function(s,d) { return s + (d.lotesVendidos??0); }, 0);

  if (!empreendimentos) return null;

  return (
    <div ref={containerRef} className="flex flex-col w-full overflow-hidden"
      style={isFullscreen ? {
        position:'fixed', inset:0, zIndex:9999, width:'100vw', height:'100vh',
        borderRadius: 0, background: '#000',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      } : {
        borderRadius: 20, background: 'transparent',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>

      <div style={{ display:'flex', height: focusDevId ? '100%' : isFullscreen ? '100%' : mapHeight, minHeight: 300, position:'relative' }}>
        <div style={{ flex:1, position:'relative', minWidth:0 }}>
          <div ref={mapRef} style={{ position:'absolute', inset:0, pointerEvents: (locked || mapaLocked) ? 'none' : 'auto' }}/>

          {/* Zoom +/- */}
          <div style={{ position:'absolute', bottom:16, right:10, zIndex:1020, display:'flex', flexDirection:'column', gap:4 }}>
            <button onClick={function() { leafletRef.current?.zoomIn(); }}
              style={{ width:32, height:32, borderRadius:8, cursor:'pointer', background:'rgba(255,255,255,0.95)', backdropFilter:'blur(8px)', border:'1px solid rgba(0,0,0,0.08)', boxShadow:'0 2px 8px rgba(0,0,0,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:900, color:'#374151', lineHeight:1 }}>+</button>
            <button onClick={function() { leafletRef.current?.zoomOut(); }}
              style={{ width:32, height:32, borderRadius:8, cursor:'pointer', background:'rgba(255,255,255,0.95)', backdropFilter:'blur(8px)', border:'1px solid rgba(0,0,0,0.08)', boxShadow:'0 2px 8px rgba(0,0,0,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:900, color:'#374151', lineHeight:1 }}>−</button>
          </div>

          {/* Controles topo direita */}
          <div style={{ position:'absolute', top:10, right:10, zIndex:1020, display:'flex', flexDirection:'column', gap:6 }}>
            <button title="Centralizar" onClick={function() {
              if (!leafletRef.current) return;
              const devs = devsComLoc;
              if (!devs.length) return;
              import("leaflet").then(function(L) {
                if (!leafletRef.current) return;
                if (devs.length === 1) leafletRef.current.flyTo([devs[0].lat!, devs[0].lng!], 15, { animate: true, duration: 1 });
                else {
                  const bounds = L.latLngBounds(devs.map(function(d) { return [d.lat!, d.lng!] as [number,number]; }));
                  leafletRef.current.fitBounds(bounds, { padding: [60,60], maxZoom: 14, animate: true });
                }
              });
            }} style={{ width:36, height:36, borderRadius:10, cursor:'pointer', background:'rgba(255,255,255,0.95)', backdropFilter:'blur(8px)', border:'1px solid rgba(0,0,0,0.08)', boxShadow:'0 2px 10px rgba(0,0,0,0.15)', display:'flex', alignItems:'center', justifyContent:'center', color:'#374151' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>
            </button>

            <button title="Minha localização" onClick={function() {
              navigator.geolocation.getCurrentPosition(
                function(pos) {
                  leafletRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 15, { animate: true, duration: 1 });
                  import("leaflet").then(function(L) {
                    L.circleMarker([pos.coords.latitude, pos.coords.longitude], { radius: 10, color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.8, weight: 3 }).addTo(leafletRef.current!).bindPopup("Você está aqui").openPopup();
                  });
                },
                function(err) { const m: Record<number,string>={1:"Permissão negada.",2:"GPS indisponível.",3:"Tempo esgotado."}; alert(m[err.code]||err.message); },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
              );
            }} style={{ width:36, height:36, borderRadius:10, cursor:'pointer', background:'rgba(255,255,255,0.95)', backdropFilter:'blur(8px)', border:'1px solid rgba(0,0,0,0.08)', boxShadow:'0 2px 10px rgba(0,0,0,0.15)', display:'flex', alignItems:'center', justifyContent:'center', color:'#3b82f6' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
            </button>

            <button title={mapaLocked ? "Desbloquear mapa" : "Bloquear mapa"} onClick={function() { setMapaLocked(function(v) { return !v; }); }}
              style={{ width:36, height:36, borderRadius:10, cursor:'pointer', background: mapaLocked ? (flashLock ? 'rgba(239,68,68,0.9)' : 'rgba(239,68,68,0.12)') : 'rgba(74,222,128,0.12)', backdropFilter:'blur(8px)', border: mapaLocked ? (flashLock ? '2px solid rgba(239,68,68,0.8)' : '1px solid rgba(239,68,68,0.3)') : '1px solid rgba(74,222,128,0.3)', boxShadow: flashLock ? '0 0 16px rgba(239,68,68,0.5)' : '0 2px 10px rgba(0,0,0,0.12)', display:'flex', alignItems:'center', justifyContent:'center', color: mapaLocked ? (flashLock ? 'white' : '#ef4444') : '#16a34a', transition:'all 0.15s' }}>
              {mapaLocked
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 0 10 0"/></svg>}
            </button>

            <button title="Tela cheia" onClick={toggleFullscreen}
              style={{ width:36, height:36, borderRadius:10, cursor:'pointer', background: isFullscreen ? 'rgba(26,74,26,0.15)' : 'rgba(255,255,255,0.95)', backdropFilter:'blur(8px)', border: isFullscreen ? '1px solid rgba(26,74,26,0.3)' : '1px solid rgba(0,0,0,0.08)', boxShadow:'0 2px 10px rgba(0,0,0,0.12)', display:'flex', alignItems:'center', justifyContent:'center', color: isFullscreen ? '#16a34a' : '#374151' }}>
              {isFullscreen
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 0 2-2h3M3 16h3a2 2 0 0 0 2 2v3"/></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>}
            </button>
          </div>

          {/* Overlay bloqueio */}
          {(locked || mapaLocked) && (
            <div style={{ position:'absolute', inset:0, zIndex:1009, cursor:'not-allowed', background: flashLock ? 'rgba(239,68,68,0.08)' : 'transparent', transition:'background 0.15s' }}
              onClick={function() { setFlashLock(true); setTimeout(function() { setFlashLock(false); }, 600); }}
              onWheel={function(e) { e.stopPropagation(); }}/>
          )}

          {/* Dica localização */}
          {!locked && onLocationPick && (
            <div style={{ position:'absolute', bottom:12, left:'50%', transform:'translateX(-50%)', zIndex:1001, background:'rgba(10,15,26,0.85)', backdropFilter:'blur(12px)', color:'white', padding:'8px 16px', borderRadius:10, fontSize:11, fontWeight:700, whiteSpace:'nowrap', pointerEvents:'none', border:'1px solid rgba(255,255,255,0.1)', boxShadow:'0 4px 20px rgba(0,0,0,0.4)' }}>
              Clique no mapa para definir a localização
            </div>
          )}

          {/* Stats desktop */}
          {!focusDevId && !locked && devsComLoc.length > 0 && typeof window !== 'undefined' && window.innerWidth >= 768 && (
            <div style={{ position:'absolute', bottom:12, left:12, zIndex:1000, background:'rgba(10,15,26,0.82)', backdropFilter:'blur(16px)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'8px 12px', display:'flex', gap:12, boxShadow:'0 4px 24px rgba(0,0,0,0.4)' }}>
              {[
                { label:'Empreend.', value:devsComLoc.length, color:'#94a3b8' },
                { label:'Disponíveis', value:totalDisponiveis, color:'#4ade80' },
                { label:'Vendidos', value:totalVendidos, color:'#f87171' },
              ].map(function(s) { return (
                <div key={s.label} style={{ textAlign:'center' }}>
                  <p style={{ fontSize:14, fontWeight:900, color:s.color, margin:0, lineHeight:1 }}>{s.value}</p>
                  <p style={{ fontSize:8, color:'rgba(255,255,255,0.3)', margin:'2px 0 0', textTransform:'uppercase', letterSpacing:0.5 }}>{s.label}</p>
                </div>
              ); })}
            </div>
          )}

          {/* Card empreendimento selecionado */}
          {selectedDev && (function() {
            const stats = calcularStats(selectedDev, sales);
            const statusColor = stats.pct >= 90 ? '#ef4444' : stats.pct >= 60 ? '#f59e0b' : '#4ade80';
            return (
              <div style={{ position:'absolute', top:12, left:12, zIndex:1002, width:220, background:'rgba(10,15,26,0.92)', backdropFilter:'blur(20px)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,0.5)', overflow:'hidden' }}>
                {((selectedDev as any).mapaImagemLeveBase64 || (selectedDev as any).mapaImagemUrl) && (
                  <div style={{ height:80, overflow:'hidden', position:'relative' }}>
                    <img src={(selectedDev as any).mapaImagemLeveBase64 || (selectedDev as any).mapaImagemUrl} style={{ width:'100%', height:'100%', objectFit:'cover', opacity:0.7 }} alt=""/>
                    <div style={{ position:'absolute', inset:0, background:'linear-gradient(to bottom, transparent, rgba(10,15,26,0.9))' }}/>
                  </div>
                )}
                <div style={{ padding:'12px' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:12, fontWeight:900, color:'white', margin:'0 0 2px', lineHeight:1.2 }}>{selectedDev.nome}</p>
                      {selectedDev.cidade && <p style={{ fontSize:10, color:'rgba(255,255,255,0.4)', margin:0 }}>{selectedDev.cidade}</p>}
                    </div>
                    <button onClick={function() { setSelectedDev(null); }} style={{ background:'rgba(255,255,255,0.08)', border:'none', color:'rgba(255,255,255,0.5)', borderRadius:6, width:22, height:22, cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4, marginBottom:8 }}>
                    {[['Total',stats.total,'#94a3b8'],['Disp.',stats.disponiveis,'#4ade80'],['Vend.',stats.vendidos,'#f87171']].map(function(item) { return (
                      <div key={String(item[0])} style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'5px 4px', textAlign:'center', border:'1px solid rgba(255,255,255,0.05)' }}>
                        <p style={{ fontSize:13, fontWeight:900, color:String(item[2]), margin:0 }}>{item[1]}</p>
                        <p style={{ fontSize:8, color:'rgba(255,255,255,0.3)', margin:'1px 0 0', textTransform:'uppercase' }}>{item[0]}</p>
                      </div>
                    ); })}
                  </div>
                  <div style={{ height:3, background:'rgba(255,255,255,0.08)', borderRadius:2, overflow:'hidden', marginBottom:10 }}>
                    <div style={{ height:'100%', width: stats.pct + '%', background:'linear-gradient(90deg,' + statusColor + ',' + statusColor + '99)', borderRadius:2 }}/>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                    <button onClick={function() { onVerMapa(selectedDev.id); }} style={{ padding:'8px 0', borderRadius:10, background:'rgba(74,222,128,0.15)', border:'1px solid rgba(74,222,128,0.3)', color:'#4ade80', fontSize:10, fontWeight:900, cursor:'pointer' }}>VER MAPA</button>
                    <button onClick={function() { onAbrirEmpreendimento(selectedDev.id); }} style={{ padding:'8px 0', borderRadius:10, background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.6)', fontSize:10, fontWeight:900, cursor:'pointer' }}>EDITAR</button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Handle de resize */}
      {!focusDevId && !isFullscreen && (
        <div onMouseDown={startResizeDrag} onTouchStart={startResizeDrag}
          style={{ flexShrink:0, height:10, background:'rgba(255,255,255,0.03)', borderTop:'1px solid rgba(255,255,255,0.05)', cursor:'row-resize', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width:32, height:2, background:'rgba(255,255,255,0.15)', borderRadius:2 }}/>
        </div>
      )}

      {/* Painel de configuração de pinos — persiste no banco via onSaveConfig */}
      {!focusDevId && !isFullscreen && (
        <div style={{ flexShrink:0, background:'rgba(10,15,26,0.85)', backdropFilter:'blur(12px)', borderTop:'1px solid rgba(255,255,255,0.06)', padding:'10px 16px', display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
          {/* Tamanho */}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:10, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:0.5, whiteSpace:'nowrap' }}>Tamanho do pino</span>
            <input type="range" min={12} max={40} value={pinSize}
              onChange={function(e) {
                const v = parseInt(e.target.value);
                setPinSize(v);
                salvarPinConfig(v, pinColor);
              }}
              style={{ width:90, accentColor: pinColor, cursor:'pointer' }}
            />
            <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)', minWidth:24 }}>{pinSize}px</span>
            <div style={{ width: pinSize * 0.7, height: pinSize * 0.7, background: pinColor, borderRadius:'50% 50% 50% 0', transform:'rotate(-45deg)', border:'2px solid white', boxShadow:'0 1px 4px ' + pinColor + '99', flexShrink:0 }}/>
          </div>

          {/* Cor */}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:10, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:0.5, whiteSpace:'nowrap' }}>Cor do pino</span>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {[
                { cor:'#e53935', label:'Vermelho' },
                { cor:'#f97316', label:'Laranja' },
                { cor:'#eab308', label:'Amarelo' },
                { cor:'#22c55e', label:'Verde' },
                { cor:'#3b82f6', label:'Azul' },
                { cor:'#a855f7', label:'Roxo' },
                { cor:'#ec4899', label:'Rosa' },
                { cor:'#ffffff', label:'Branco' },
              ].map(function(item) { return (
                <button key={item.cor} title={item.label}
                  onClick={function() { setPinColor(item.cor); salvarPinConfig(pinSize, item.cor); }}
                  style={{ width:20, height:20, borderRadius:'50%', background:item.cor, cursor:'pointer', border: pinColor === item.cor ? '2.5px solid white' : '2px solid rgba(255,255,255,0.15)', boxShadow: pinColor === item.cor ? '0 0 0 2px ' + item.cor : 'none', transition:'all 0.15s', flexShrink:0 }}
                />
              ); })}
              <label title="Cor personalizada" style={{ width:20, height:20, borderRadius:'50%', cursor:'pointer', overflow:'hidden', border:'2px solid rgba(255,255,255,0.2)', flexShrink:0, position:'relative', display:'flex', alignItems:'center', justifyContent:'center', background:'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' }}>
                <input type="color" value={pinColor} onChange={function(e) { setPinColor(e.target.value); salvarPinConfig(pinSize, e.target.value); }} style={{ opacity:0, position:'absolute', inset:0, width:'100%', height:'100%', cursor:'pointer' }}/>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default MapaGlobalDashboard;
