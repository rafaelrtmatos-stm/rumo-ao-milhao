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
  const vendas = sales.filter(s => s.empreendimentoId === dev.id && s.status !== "cancelado");
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
  return devs.map(d => ({ devs: [d], lat: d.lat!, lng: d.lng!, isCluster: false }));
}

export interface MapaGlobalHandle {
  centralizar: () => void;
  minhaLocalizacao: () => void;
}

const MapaGlobalDashboard = forwardRef<MapaGlobalHandle, Props>(function MapaGlobalDashboard(
  props,
  ref
) {
  // Desestruturar via props para evitar que 'config' colida com variáveis do bundle após minificação
  const {
    empreendimentos = [],
    sales = [],
    onAbrirEmpreendimento,
    onVerMapa,
    visible = true,
    focusDevId = null,
    onLocationPick,
    config: appCfg = {} as AppConfig,
    onSaveConfig,
  } = props;

  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);
  const tileRef = useRef<any>(null);
  const overlayRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [selectedDev, setSelectedDev] = useState<Empreendimento | null>(null);
  const [locked] = useState(!!focusDevId);
  const [flashLock, setFlashLock] = useState(false);
  const [mapZoom, setMapZoom] = useState(5);
  const [mapReady, setMapReady] = useState(false);
  const [camada, setCamada] = useState<Camada>("satelite");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapaLocked, setMapaLocked] = useState(true);
  const [mapHeight, setMapHeight] = useState(() => {
    try { const s = localStorage.getItem('mapGlobalHeight'); return s ? Math.max(300, Math.min(window.innerHeight, parseInt(s))) : 480; } catch { return 480; }
  });
  const [pinSize, setPinSize] = useState<number>(22);
  const [pinColor, setPinColor] = useState<string>('#e53935');
  const resizeDragRef = useRef<{startY:number;startH:number}|null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Extrair valores primitivos — evita closure sobre 'appCfg' que pode ser renomeado
  const cfgPinSize = (appCfg as any).mapPinSize as number | undefined;
  const cfgPinColor = (appCfg as any).mapPinColor as string | undefined;

  useEffect(() => {
    if (cfgPinSize) setPinSize(cfgPinSize);
    else { try { const v = parseInt(localStorage.getItem('mapPinSize') || '22'); if (v) setPinSize(v); } catch {} }
  }, [cfgPinSize]);

  useEffect(() => {
    if (cfgPinColor) setPinColor(cfgPinColor);
    else { try { const v = localStorage.getItem('mapPinColor'); if (v) setPinColor(v); } catch {} }
  }, [cfgPinColor]);

  const empreendimentosFiltrados = useMemo(() =>
    focusDevId ? empreendimentos.filter(d => d.id === focusDevId) : empreendimentos,
    [empreendimentos, focusDevId]
  );

  const devsComLoc = useMemo(() =>
    empreendimentosFiltrados.filter(d => validLatLng(d.lat, d.lng)),
    [empreendimentosFiltrados]
  );

  const devsFiltrados = useMemo(() => devsComLoc, [devsComLoc]);

  useEffect(() => {
    if (!containerRef.current || !leafletRef.current) return;
    const snap = devsComLoc;
    const ro = new ResizeObserver(() => {
      if (!leafletRef.current) return;
      leafletRef.current.invalidateSize?.();
      if (!snap.length) return;
      import("leaflet").then(L => {
        if (!leafletRef.current) return;
        const vd = snap.filter(d => validLatLng(d.lat, d.lng));
        if (!vd.length) return;
        if (vd.length === 1) { leafletRef.current.setView([vd[0].lat!, vd[0].lng!], 14, { animate: false }); }
        else { leafletRef.current.fitBounds(L.latLngBounds(vd.map(d => [d.lat!, d.lng!] as [number,number])), { paddingTopLeft:[50,10], paddingBottomRight:[50,120], maxZoom:12, animate:false }); }
      });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [devsComLoc, mapReady]);

  useImperativeHandle(ref, () => ({
    centralizar: () => {
      if (!leafletRef.current) return;
      const devs = devsComLoc.filter(d => validLatLng(d.lat, d.lng));
      if (!devs.length) return;
      const inst = leafletRef.current;
      import("leaflet").then(L => {
        if (!inst || !leafletRef.current) return;
        if (devs.length === 1) inst.flyTo([devs[0].lat!, devs[0].lng!], 15, { animate: true, duration: 1 });
        else inst.fitBounds(L.latLngBounds(devs.map(d => [d.lat!, d.lng!] as [number,number])), { padding:[40,40], maxZoom:14, animate:true });
      });
    },
    minhaLocalizacao: () => {
      navigator.geolocation.getCurrentPosition(
        pos => { leafletRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 15, { animate:true, duration:1 }); },
        err => { const m: Record<number,string>={1:"Permissão negada.",2:"GPS indisponível.",3:"Tempo esgotado."}; alert(m[err.code]||err.message); },
        { enableHighAccuracy:true, timeout:10000, maximumAge:0 }
      );
    },
  }), [devsComLoc]);

  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;
    let cancelled = false;
    import("leaflet").then(L => {
      if (cancelled || !mapRef.current || leafletRef.current) return;
      const map = L.map(mapRef.current!, { center:[-5,-52], zoom:5, zoomControl:false, attributionControl:false, doubleClickZoom:true });
      tileRef.current = L.tileLayer(TILES.satelite.url, TILES.satelite.options).addTo(map);
      map.on("zoomend", () => setMapZoom(map.getZoom()));
      map.on('click', (e: any) => { if (onLocationPick) onLocationPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))); });
      leafletRef.current = map;
      setMapReady(true);
      const centralizarPinos = (tentativa = 0) => {
        if (!leafletRef.current) return;
        const devs = empreendimentos.filter(d => typeof d.lat==='number' && typeof d.lng==='number' && isFinite(d.lat!) && d.lat!==0 && d.lng!==0);
        if (!devs.length) return;
        import("leaflet").then(L2 => {
          if (!leafletRef.current) return;
          leafletRef.current.invalidateSize({ animate:false });
          const sz = leafletRef.current.getSize();
          if (sz.y < 100 && tentativa < 15) { setTimeout(() => centralizarPinos(tentativa+1), 200); return; }
          if (devs.length === 1) { leafletRef.current.setView([devs[0].lat!, devs[0].lng!], 13, { animate:false }); }
          else { leafletRef.current.fitBounds(L2.latLngBounds(devs.map(d => [d.lat!, d.lng!] as [number,number])), { paddingTopLeft:[50,10], paddingBottomRight:[50,120], maxZoom:12, animate:false }); }
        });
      };
      setTimeout(() => centralizarPinos(), 500);
    });
    return () => { cancelled=true; if (leafletRef.current) { leafletRef.current.remove(); leafletRef.current=null; } };
  }, []);

  useEffect(() => {
    if (!visible || !leafletRef.current) return;
    const map = leafletRef.current;
    const fix = () => { map?.invalidateSize({ animate:false }); };
    fix();
    const t1=setTimeout(fix,50), t2=setTimeout(fix,150), t3=setTimeout(fix,400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [visible]);

  useEffect(() => {
    if (!mapRef.current) return;
    const ro = new ResizeObserver(() => { leafletRef.current?.invalidateSize({ animate:false }); });
    ro.observe(mapRef.current);
    return () => ro.disconnect();
  }, [mapReady]);

  const centradoRef = useRef<string | false>(false);
  useEffect(() => {
    if (!mapReady || !leafletRef.current) return;
    const devs = empreendimentosFiltrados.filter(d => d.lat && d.lng && d.lat!==0);
    if (!devs.length) return;
    if (centradoRef.current === (focusDevId||"todos")) return;
    centradoRef.current = focusDevId||"todos";
    import("leaflet").then(L => {
      if (!leafletRef.current) return;
      if (devs.length===1) { leafletRef.current.flyTo([devs[0].lat!, devs[0].lng!], focusDevId?17:15, { animate:true, duration:1 }); }
      else { leafletRef.current.fitBounds(L.latLngBounds(devs.map(d => [d.lat!, d.lng!] as [number,number])), { padding:[60,60], maxZoom:16, animate:true }); }
    });
  }, [mapReady, empreendimentos]);

  // Trocar camada — variável renomeada para 'tileConf' para não colidir com nenhuma variável de bundle
  useEffect(() => {
    if (!mapReady || !leafletRef.current) return;
    import("leaflet").then(L => {
      if (tileRef.current) { tileRef.current.remove(); tileRef.current=null; }
      if (overlayRef.current) { overlayRef.current.remove(); overlayRef.current=null; }
      const tileConf = TILES[camada];
      tileRef.current = L.tileLayer(tileConf.url, tileConf.options).addTo(leafletRef.current!);
      if (camada==='hibrido') {
        overlayRef.current = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          { maxZoom:19, opacity:0.8, crossOrigin:true }
        ).addTo(leafletRef.current!);
      }
    });
  }, [camada, mapReady]);

  useEffect(() => {
    if (!mapReady || !leafletRef.current) return;
    import("leaflet").then(L => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      const clusters = clusterPins(devsComLoc);
      clusters.forEach(cluster => {
        let icon: any;
        if (cluster.isCluster) {
          icon = L.divIcon({
            className: "",
            html: '<div style="background:#1a4a1a;color:white;border-radius:50%;width:46px;height:46px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px;border:3px solid white;box-shadow:0 3px 12px rgba(0,0,0,0.5);cursor:pointer;">' + cluster.devs.length + '</div>',
            iconSize: [46,46], iconAnchor: [23,23],
          });
        } else {
          const dev = cluster.devs[0];
          const preps = new Set(['de','da','do','das','dos','e','em','na','no']);
          const nome = dev.nome.length > 18 ? dev.nome.slice(0,18)+'…' : dev.nome;
          const nomeFmt = nome.toLowerCase().split(' ').map((w,i) => i>0&&preps.has(w)?w:w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
          icon = L.divIcon({
            className: "",
            html: '<div style="display:flex;align-items:center;gap:4px;cursor:pointer;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.45));">'
              + '<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">'
              + '<div style="width:' + pinSize + 'px;height:' + pinSize + 'px;background:' + pinColor + ';border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2.5px solid white;box-shadow:0 2px 6px ' + pinColor + '99;"></div>'
              + '<div style="width:' + Math.round(pinSize*0.18) + 'px;height:' + Math.round(pinSize*0.36) + 'px;background:' + pinColor + ';margin-top:-1px;border-radius:0 0 2px 2px;"></div>'
              + '</div>'
              + '<div style="background:rgba(30,30,30,0.82);color:white;padding:3px 8px;border-radius:8px;font-size:11px;font-weight:700;white-space:nowrap;letter-spacing:0.2px;backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,0.15);max-width:140px;overflow:hidden;text-overflow:ellipsis;">'
              + nomeFmt + '</div></div>',
            iconSize: [200,36], iconAnchor: [Math.round(pinSize*0.5), pinSize+Math.round(pinSize*0.36)],
          });
        }
        const marker = L.marker([cluster.lat, cluster.lng], { icon }).addTo(leafletRef.current!);
        if (cluster.isCluster) {
          marker.on("click", () => {
            if (!validLatLng(cluster.lat, cluster.lng)) return;
            leafletRef.current!.flyTo([cluster.lat, cluster.lng], Math.min(leafletRef.current!.getZoom()+3,15), { animate:true, duration:0.8 });
          });
        } else {
          marker.on("click", () => setSelectedDev(cluster.devs[0]));
        }
        markersRef.current.push(marker);
      });
    });
  }, [devsFiltrados, mapZoom, mapReady, sales, pinSize, pinColor, devsComLoc]);

  function toggleFullscreen() {
    if (!isFullscreen) { setIsFullscreen(true); document.body.style.overflow='hidden'; try{(screen.orientation as any).lock?.('landscape').catch(()=>{});}catch{} }
    else { setIsFullscreen(false); document.body.style.overflow=''; try{(screen.orientation as any).unlock?.();}catch{} }
    const inst = leafletRef.current;
    if (inst) setTimeout(() => { inst?.invalidateSize?.(); }, 300);
  }

  function startResizeDrag(e: React.MouseEvent | React.TouchEvent) {
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    resizeDragRef.current = { startY: clientY, startH: mapHeight };
    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!resizeDragRef.current) return;
      const y = 'touches' in ev ? (ev as TouchEvent).touches[0].clientY : (ev as MouseEvent).clientY;
      const newH = Math.max(300, Math.min(window.innerHeight-100, resizeDragRef.current.startH+(y-resizeDragRef.current.startY)));
      setMapHeight(newH);
      try { localStorage.setItem('mapGlobalHeight', String(Math.round(newH))); } catch {}
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
    window.addEventListener('touchmove', onMove as any, { passive:false });
    window.addEventListener('touchend', onUp);
  }

  const totalDisponiveis = devsComLoc.reduce((s,d) => s+Math.max(0,(d.totalLotes??0)-(d.lotesVendidos??0)), 0);
  const totalVendidos = devsComLoc.reduce((s,d) => s+(d.lotesVendidos??0), 0);

  if (!empreendimentos || !empreendimentos.length) return null;

  return (
    <div ref={containerRef} className="flex flex-col w-full overflow-hidden"
      style={isFullscreen ? { position:'fixed', inset:0, zIndex:9999, width:'100vw', height:'100vh', borderRadius:0, background:'#000', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }
        : { borderRadius:20, background:'transparent', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>

      <div style={{ display:'flex', height: focusDevId?'100%':isFullscreen?'100%':mapHeight, minHeight:300, position:'relative' }}>
        <div style={{ flex:1, position:'relative', minWidth:0 }}>
          <div ref={mapRef} style={{ position:'absolute', inset:0, pointerEvents:(locked||mapaLocked)?'none':'auto' }}/>

          <div style={{ position:'absolute', bottom:16, right:10, zIndex:1020, display:'flex', flexDirection:'column', gap:4 }}>
            <button onClick={() => leafletRef.current?.zoomIn()} style={{ width:32,height:32,borderRadius:8,cursor:'pointer',background:'rgba(255,255,255,0.95)',backdropFilter:'blur(8px)',border:'1px solid rgba(0,0,0,0.08)',boxShadow:'0 2px 8px rgba(0,0,0,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:900,color:'#374151',lineHeight:1 }}>+</button>
            <button onClick={() => leafletRef.current?.zoomOut()} style={{ width:32,height:32,borderRadius:8,cursor:'pointer',background:'rgba(255,255,255,0.95)',backdropFilter:'blur(8px)',border:'1px solid rgba(0,0,0,0.08)',boxShadow:'0 2px 8px rgba(0,0,0,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,fontWeight:900,color:'#374151',lineHeight:1 }}>−</button>
          </div>

          <div style={{ position:'absolute', top:10, right:10, zIndex:1020, display:'flex', flexDirection:'column', gap:6 }}>
            <button title="Centralizar" onClick={() => {
              if (!leafletRef.current) return;
              const devs = devsComLoc; if (!devs.length) return;
              import("leaflet").then(L => {
                if (!leafletRef.current) return;
                if (devs.length===1) leafletRef.current.flyTo([devs[0].lat!, devs[0].lng!], 15, { animate:true, duration:1 });
                else leafletRef.current.fitBounds(L.latLngBounds(devs.map(d => [d.lat!, d.lng!] as [number,number])), { padding:[60,60], maxZoom:14, animate:true });
              });
            }} style={{ width:36,height:36,borderRadius:10,cursor:'pointer',background:'rgba(255,255,255,0.95)',backdropFilter:'blur(8px)',border:'1px solid rgba(0,0,0,0.08)',boxShadow:'0 2px 10px rgba(0,0,0,0.15)',display:'flex',alignItems:'center',justifyContent:'center',color:'#374151' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>
            </button>
            <button title="Minha localização" onClick={() => {
              navigator.geolocation.getCurrentPosition(
                pos => { leafletRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 15, { animate:true, duration:1 }); import("leaflet").then(L => { L.circleMarker([pos.coords.latitude, pos.coords.longitude], { radius:10, color:"#3b82f6", fillColor:"#3b82f6", fillOpacity:0.8, weight:3 }).addTo(leafletRef.current!).bindPopup("Você está aqui").openPopup(); }); },
                err => { const m: Record<number,string>={1:"Permissão negada.",2:"GPS indisponível.",3:"Tempo esgotado."}; alert(m[err.code]||err.message); },
                { enableHighAccuracy:true, timeout:10000, maximumAge:0 }
              );
            }} style={{ width:36,height:36,borderRadius:10,cursor:'pointer',background:'rgba(255,255,255,0.95)',backdropFilter:'blur(8px)',border:'1px solid rgba(0,0,0,0.08)',boxShadow:'0 2px 10px rgba(0,0,0,0.15)',display:'flex',alignItems:'center',justifyContent:'center',color:'#3b82f6' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
            </button>
            <button title={mapaLocked?"Desbloquear mapa":"Bloquear mapa"} onClick={() => setMapaLocked(v => !v)}
              style={{ width:36,height:36,borderRadius:10,cursor:'pointer', background:mapaLocked?(flashLock?'rgba(239,68,68,0.9)':'rgba(239,68,68,0.12)'):'rgba(74,222,128,0.12)', backdropFilter:'blur(8px)', border:mapaLocked?(flashLock?'2px solid rgba(239,68,68,0.8)':'1px solid rgba(239,68,68,0.3)'):'1px solid rgba(74,222,128,0.3)', boxShadow:flashLock?'0 0 16px rgba(239,68,68,0.5)':'0 2px 10px rgba(0,0,0,0.12)', display:'flex',alignItems:'center',justifyContent:'center', color:mapaLocked?(flashLock?'white':'#ef4444'):'#16a34a', transition:'all 0.15s' }}>
              {mapaLocked
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 0 10 0"/></svg>}
            </button>
            <button title="Tela cheia" onClick={toggleFullscreen}
              style={{ width:36,height:36,borderRadius:10,cursor:'pointer', background:isFullscreen?'rgba(26,74,26,0.15)':'rgba(255,255,255,0.95)', backdropFilter:'blur(8px)', border:isFullscreen?'1px solid rgba(26,74,26,0.3)':'1px solid rgba(0,0,0,0.08)', boxShadow:'0 2px 10px rgba(0,0,0,0.12)', display:'flex',alignItems:'center',justifyContent:'center', color:isFullscreen?'#16a34a':'#374151' }}>
              {isFullscreen
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 0 2-2h3M3 16h3a2 2 0 0 0 2 2v3"/></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>}
            </button>
          </div>

          {(locked||mapaLocked) && (
            <div style={{ position:'absolute',inset:0,zIndex:1009,cursor:'not-allowed', background:flashLock?'rgba(239,68,68,0.08)':'transparent', transition:'background 0.15s' }}
              onClick={() => { setFlashLock(true); setTimeout(()=>setFlashLock(false),600); }}
              onWheel={e => e.stopPropagation()}/>
          )}

          {!locked && onLocationPick && (
            <div style={{ position:'absolute',bottom:12,left:'50%',transform:'translateX(-50%)',zIndex:1001,background:'rgba(10,15,26,0.85)',backdropFilter:'blur(12px)',color:'white',padding:'8px 16px',borderRadius:10,fontSize:11,fontWeight:700,whiteSpace:'nowrap',pointerEvents:'none',border:'1px solid rgba(255,255,255,0.1)',boxShadow:'0 4px 20px rgba(0,0,0,0.4)' }}>
              Clique no mapa para definir a localização
            </div>
          )}

          {!focusDevId && !locked && devsComLoc.length > 0 && typeof window !== 'undefined' && window.innerWidth >= 768 && (
            <div style={{ position:'absolute',bottom:12,left:12,zIndex:1000,background:'rgba(10,15,26,0.82)',backdropFilter:'blur(16px)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:12,padding:'8px 12px',display:'flex',gap:12,boxShadow:'0 4px 24px rgba(0,0,0,0.4)' }}>
              {[{label:'Empreend.',value:devsComLoc.length,color:'#94a3b8'},{label:'Disponíveis',value:totalDisponiveis,color:'#4ade80'},{label:'Vendidos',value:totalVendidos,color:'#f87171'}].map(s => (
                <div key={s.label} style={{ textAlign:'center' }}>
                  <p style={{ fontSize:14,fontWeight:900,color:s.color,margin:0,lineHeight:1 }}>{s.value}</p>
                  <p style={{ fontSize:8,color:'rgba(255,255,255,0.3)',margin:'2px 0 0',textTransform:'uppercase',letterSpacing:0.5 }}>{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {selectedDev && (() => {
            const stats = calcularStats(selectedDev, sales);
            const statusColor = stats.pct>=90?'#ef4444':stats.pct>=60?'#f59e0b':'#4ade80';
            return (
              <div style={{ position:'absolute',top:12,left:12,zIndex:1002,width:220,background:'rgba(10,15,26,0.92)',backdropFilter:'blur(20px)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:16,boxShadow:'0 8px 32px rgba(0,0,0,0.5)',overflow:'hidden' }}>
                {((selectedDev as any).mapaImagemLeveBase64||(selectedDev as any).mapaImagemUrl) && (
                  <div style={{ height:80,overflow:'hidden',position:'relative' }}>
                    <img src={(selectedDev as any).mapaImagemLeveBase64||(selectedDev as any).mapaImagemUrl} style={{ width:'100%',height:'100%',objectFit:'cover',opacity:0.7 }} alt=""/>
                    <div style={{ position:'absolute',inset:0,background:'linear-gradient(to bottom,transparent,rgba(10,15,26,0.9))' }}/>
                  </div>
                )}
                <div style={{ padding:'12px' }}>
                  <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:8 }}>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:12,fontWeight:900,color:'white',margin:'0 0 2px',lineHeight:1.2 }}>{selectedDev.nome}</p>
                      {selectedDev.cidade && <p style={{ fontSize:10,color:'rgba(255,255,255,0.4)',margin:0 }}>{selectedDev.cidade}</p>}
                    </div>
                    <button onClick={() => setSelectedDev(null)} style={{ background:'rgba(255,255,255,0.08)',border:'none',color:'rgba(255,255,255,0.5)',borderRadius:6,width:22,height:22,cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>×</button>
                  </div>
                  <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:4,marginBottom:8 }}>
                    {[['Total',stats.total,'#94a3b8'],['Disp.',stats.disponiveis,'#4ade80'],['Vend.',stats.vendidos,'#f87171']].map(([l,v,c]) => (
                      <div key={String(l)} style={{ background:'rgba(255,255,255,0.04)',borderRadius:8,padding:'5px 4px',textAlign:'center',border:'1px solid rgba(255,255,255,0.05)' }}>
                        <p style={{ fontSize:13,fontWeight:900,color:String(c),margin:0 }}>{v}</p>
                        <p style={{ fontSize:8,color:'rgba(255,255,255,0.3)',margin:'1px 0 0',textTransform:'uppercase' }}>{l}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ height:3,background:'rgba(255,255,255,0.08)',borderRadius:2,overflow:'hidden',marginBottom:10 }}>
                    <div style={{ height:'100%',width:stats.pct+'%',background:'linear-gradient(90deg,'+statusColor+','+statusColor+'99)',borderRadius:2 }}/>
                  </div>
                  <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:6 }}>
                    <button onClick={() => onVerMapa(selectedDev.id)} style={{ padding:'8px 0',borderRadius:10,background:'rgba(74,222,128,0.15)',border:'1px solid rgba(74,222,128,0.3)',color:'#4ade80',fontSize:10,fontWeight:900,cursor:'pointer',transition:'all 0.2s' }}>VER MAPA</button>
                    <button onClick={() => onAbrirEmpreendimento(selectedDev.id)} style={{ padding:'8px 0',borderRadius:10,background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.6)',fontSize:10,fontWeight:900,cursor:'pointer',transition:'all 0.2s' }}>EDITAR</button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {!focusDevId && !isFullscreen && (
        <div onMouseDown={startResizeDrag} onTouchStart={startResizeDrag}
          style={{ flexShrink:0,height:10,background:'rgba(255,255,255,0.03)',borderTop:'1px solid rgba(255,255,255,0.05)',cursor:'row-resize',display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div style={{ width:32,height:2,background:'rgba(255,255,255,0.15)',borderRadius:2 }}/>
        </div>
      )}

      {!focusDevId && !isFullscreen && (
        <div style={{ flexShrink:0,background:'rgba(10,15,26,0.85)',backdropFilter:'blur(12px)',borderTop:'1px solid rgba(255,255,255,0.06)',padding:'10px 16px',display:'flex',alignItems:'center',gap:20,flexWrap:'wrap' }}>
          <div style={{ display:'flex',alignItems:'center',gap:8 }}>
            <span style={{ fontSize:10,color:'rgba(255,255,255,0.4)',textTransform:'uppercase',letterSpacing:0.5,whiteSpace:'nowrap' }}>Tamanho do pino</span>
            <input type="range" min={12} max={40} value={pinSize}
              onChange={e => {
                const v = parseInt(e.target.value);
                setPinSize(v);
                try { localStorage.setItem('mapPinSize', String(v)); } catch {}
                if (onSaveConfig) onSaveConfig({ ...appCfg, mapPinSize: v } as AppConfig);
              }}
              style={{ width:90, accentColor:pinColor, cursor:'pointer' }}
            />
            <span style={{ fontSize:10,color:'rgba(255,255,255,0.5)',minWidth:24 }}>{pinSize}px</span>
            <div style={{ width:pinSize*0.7,height:pinSize*0.7,background:pinColor,borderRadius:'50% 50% 50% 0',transform:'rotate(-45deg)',border:'2px solid white',boxShadow:'0 1px 4px '+pinColor+'99',flexShrink:0 }}/>
          </div>
          <div style={{ display:'flex',alignItems:'center',gap:8 }}>
            <span style={{ fontSize:10,color:'rgba(255,255,255,0.4)',textTransform:'uppercase',letterSpacing:0.5,whiteSpace:'nowrap' }}>Cor do pino</span>
            <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
              {[{cor:'#e53935',label:'Vermelho'},{cor:'#f97316',label:'Laranja'},{cor:'#eab308',label:'Amarelo'},{cor:'#22c55e',label:'Verde'},{cor:'#3b82f6',label:'Azul'},{cor:'#a855f7',label:'Roxo'},{cor:'#ec4899',label:'Rosa'},{cor:'#ffffff',label:'Branco'}].map(({cor,label}) => (
                <button key={cor} title={label}
                  onClick={() => {
                    setPinColor(cor);
                    try { localStorage.setItem('mapPinColor', cor); } catch {}
                    if (onSaveConfig) onSaveConfig({ ...appCfg, mapPinColor: cor } as AppConfig);
                  }}
                  style={{ width:20,height:20,borderRadius:'50%',background:cor,cursor:'pointer', border:pinColor===cor?'2.5px solid white':'2px solid rgba(255,255,255,0.15)', boxShadow:pinColor===cor?'0 0 0 2px '+cor:'none', transition:'all 0.15s',flexShrink:0 }}
                />
              ))}
              <label title="Cor personalizada" style={{ width:20,height:20,borderRadius:'50%',cursor:'pointer',overflow:'hidden',border:'2px solid rgba(255,255,255,0.2)',flexShrink:0,position:'relative',display:'flex',alignItems:'center',justifyContent:'center',background:'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' }}>
                <input type="color" value={pinColor} onChange={e => {
                  const v = e.target.value;
                  setPinColor(v);
                  try { localStorage.setItem('mapPinColor', v); } catch {}
                  if (onSaveConfig) onSaveConfig({ ...appCfg, mapPinColor: v } as AppConfig);
                }} style={{ opacity:0,position:'absolute',inset:0,width:'100%',height:'100%',cursor:'pointer' }}/>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default MapaGlobalDashboard;
