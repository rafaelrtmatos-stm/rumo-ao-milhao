import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useMemo } from "react";
import type { Empreendimento, Venda } from "../types";

interface Props {
  empreendimentos: Empreendimento[];
  sales: Venda[];
  onAbrirEmpreendimento: (id: string) => void;
  onVerMapa: (id: string) => void;
  visible?: boolean;
  focusDevId?: string | null;
  onLocationPick?: (lat: number, lng: number) => void;
}

type Camada = "satelite" | "hibrido" | "ruas";
type AbaModo = "disponiveis" | "preco";

interface RegraPreco {
  id: string;
  nomeRegra: string;
  valor: number;
  entrada: number;
  parcelas: number;
  lotesInfo: string;
}

function validLatLng(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && typeof lng === 'number'
    && isFinite(lat) && isFinite(lng)
    && lat !== 0 && lng !== 0
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function extrairRegrasScript(scriptText: string | undefined | null): RegraPreco[] {
  if (!scriptText) return [];
  const linhas = scriptText.split('\n');
  const regras: RegraPreco[] = [];
  linhas.forEach((linha, index) => {
    const txt = linha.trim();
    if (txt.toUpperCase().startsWith("REGRA")) {
      const partesNome = txt.split(':');
      const nomeRegra = partesNome[0].trim();
      const matchValor = txt.match(/VALOR\s*:\s*(\d+)/i);
      const matchEntrada = txt.match(/ENTRADA\s*:\s*(\d+)/i);
      const matchParcelas = txt.match(/PARCELAS\s*:\s*(\d+)/i);
      let lotesInfo = "";
      const matchLotes = txt.match(new RegExp(nomeRegra + '\\s*:\\s*([^VALOR]+)', 'i'));
      if (matchLotes && matchLotes[1]) {
        lotesInfo = matchLotes[1].trim().replace(/\.$/, '');
      }
      if (matchValor) {
        regras.push({
          id: nomeRegra + '_' + index,
          nomeRegra,
          valor: parseInt(matchValor[1]),
          entrada: matchEntrada ? parseInt(matchEntrada[1]) : 0,
          parcelas: matchParcelas ? parseInt(matchParcelas[1]) : 0,
          lotesInfo: lotesInfo || "Mapeado no script"
        });
      }
    }
  });
  return regras;
}

// Extrair regras do precosRegras salvo no empreendimento
function extrairRegrasDev(dev: Empreendimento): RegraPreco[] {
  const precosRegras = (dev as any).precosRegras;
  if (precosRegras && Array.isArray(precosRegras) && precosRegras.length > 0) {
    return precosRegras
      .filter((r: any) => r.valor)
      .map((r: any, i: number) => ({
        id: 'regra_' + i,
        nomeRegra: 'Regra ' + (i + 1),
        valor: parseInt(String(r.valor).replace(/\D/g, '')) || 0,
        entrada: parseInt(String(r.entrada).replace(/\D/g, '')) || 0,
        parcelas: parseInt(r.parcelas) || 0,
        lotesInfo: r.script || '',
      }));
  }
  // Fallback: tentar extrair do script de texto
  return extrairRegrasScript((dev as any).mapaScriptRegras);
}

const CORES_REGRAS = ['#e53935','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899'];

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
  const overlayRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  const [abaAtiva, setAbaAtiva] = useState<AbaModo>("disponiveis");
  const [selectedDev, setSelectedDev] = useState<Empreendimento | null>(null);
  const [mapaLocked, setMapaLocked] = useState(true);
  const [flashLock, setFlashLock] = useState(false);
  const [busca, setBusca] = useState("");
  const [mapZoom, setMapZoom] = useState(5);
  const [mapReady, setMapReady] = useState(false);
  const [camada, setCamada] = useState<Camada>("satelite");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapHeight, setMapHeight] = useState(() => {
    const saved = localStorage.getItem('mapGlobalHeight');
    return saved ? Math.max(300, Math.min(window.innerHeight, parseInt(saved))) : 480;
  });
  const resizeDragRef = useRef<{startY:number;startH:number}|null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const empreendimentosFiltrados = useMemo(() => {
    return focusDevId ? empreendimentos.filter(function(d) { return d.id === focusDevId; }) : empreendimentos;
  }, [empreendimentos, focusDevId]);

  const devsComLoc = useMemo(() => {
    return empreendimentosFiltrados.filter(function(d) { return validLatLng(d.lat, d.lng); });
  }, [empreendimentosFiltrados]);

  const devsFiltrados = useMemo(() => {
    let list = devsComLoc;
    if (busca.trim()) {
      const termo = busca.toLowerCase();
      list = list.filter(function(devItem) {
        const nomeCompleto = String(devItem.nome ?? '').toLowerCase();
        const cidadeCompleta = String(devItem.cidade ?? '').toLowerCase();
        return nomeCompleto.includes(termo) || cidadeCompleta.includes(termo);
      });
    }
    return list;
  }, [devsComLoc, busca]);

  useImperativeHandle(ref, () => ({
    centralizar: () => {
      if (!leafletRef.current || !devsComLoc.length) return;
      import("leaflet").then(function(L) {
        if (!leafletRef.current) return;
        if (devsComLoc.length === 1) {
          leafletRef.current.flyTo([devsComLoc[0].lat!, devsComLoc[0].lng!], 15, { animate: true });
        } else {
          const bounds = L.latLngBounds(devsComLoc.map(function(d) { return [d.lat!, d.lng!] as [number,number]; }));
          leafletRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: true });
        }
      });
    },
    minhaLocalizacao: () => {
      navigator.geolocation.getCurrentPosition(
        function(pos) { leafletRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 15, { animate: true }); },
        function() { alert("Erro ao obter localização."); },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    },
  }), [devsComLoc]);

  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;
    let cancelled = false;
    import("leaflet").then(function(L) {
      if (cancelled || !mapRef.current || leafletRef.current) return;
      const map = L.map(mapRef.current, {
        center: [-5, -52],
        zoom: 5,
        zoomControl: false,
        attributionControl: false,
      });
      tileRef.current = L.tileLayer(TILES.satelite.url, TILES.satelite.options).addTo(map);
      map.on("zoomend", function() { setMapZoom(map.getZoom()); });
      map.on('click', function(e: any) {
        if (onLocationPick) onLocationPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
      });
      leafletRef.current = map;
      setMapReady(true);

      // Centralizar após carregar
      setTimeout(function() {
        if (!leafletRef.current) return;
        const devs = empreendimentos.filter(function(d) { return validLatLng(d.lat, d.lng); });
        if (!devs.length) return;
        leafletRef.current.invalidateSize({ animate: false });
        if (devs.length === 1) {
          leafletRef.current.setView([devs[0].lat!, devs[0].lng!], 13, { animate: false });
        } else {
          leafletRef.current.fitBounds(
            L.latLngBounds(devs.map(function(d) { return [d.lat!, d.lng!] as [number,number]; })),
            { paddingTopLeft: [50,10], paddingBottomRight: [50,60], maxZoom: 12, animate: false }
          );
        }
      }, 600);
    });
    return function() {
      cancelled = true;
      if (leafletRef.current) { leafletRef.current.remove(); leafletRef.current = null; }
    };
  }, []);

  useEffect(() => {
    if (!visible || !leafletRef.current) return;
    const map = leafletRef.current;
    const fix = function() { map?.invalidateSize({ animate: false }); };
    fix();
    const t1 = setTimeout(fix, 50);
    const t2 = setTimeout(fix, 200);
    const t3 = setTimeout(fix, 500);
    return function() { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [visible]);

  useEffect(() => {
    if (!mapReady || !leafletRef.current) return;
    import("leaflet").then(function(L) {
      if (tileRef.current) { tileRef.current.remove(); tileRef.current = null; }
      if (overlayRef.current) { overlayRef.current.remove(); overlayRef.current = null; }
      const cfg = TILES[camada];
      tileRef.current = L.tileLayer(cfg.url, cfg.options).addTo(leafletRef.current);
      if (camada === 'hibrido') {
        overlayRef.current = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 19, opacity: 0.8, crossOrigin: true }
        ).addTo(leafletRef.current);
      }
    });
  }, [camada, mapReady]);

  useEffect(() => {
    if (!mapReady || !leafletRef.current) return;
    import("leaflet").then(function(L) {
      markersRef.current.forEach(function(m) { m.remove(); });
      markersRef.current = [];

      const fmtNome = function(n: string) {
        const preps = new Set(['de','da','do','das','dos','e','em','na','no']);
        return n.toLowerCase().split(' ').map(function(w: string, i: number) {
          return i > 0 && preps.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1);
        }).join(' ');
      };

      devsFiltrados.forEach(function(dev) {
        const regras = extrairRegrasDev(dev);
        const nomeCurto = fmtNome(dev.nome.length > 16 ? dev.nome.slice(0,16)+'…' : dev.nome);

        if (abaAtiva === "disponiveis") {
          // ABA DISPONÍVEIS — bolinha verde única
          const icon = L.divIcon({
            className: "",
            html: '<div style="display:flex;align-items:center;gap:4px;cursor:pointer;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.4));">'
              + '<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">'
              + '<div style="width:20px;height:20px;background:#22c55e;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2.5px solid white;box-shadow:0 2px 6px rgba(34,197,94,0.6);"></div>'
              + '<div style="width:3px;height:7px;background:#22c55e;margin-top:-1px;border-radius:0 0 2px 2px;"></div>'
              + '</div>'
              + '<div style="background:rgba(10,10,20,0.88);color:white;padding:2px 7px;border-radius:7px;font-size:10px;font-weight:700;white-space:nowrap;backdrop-filter:blur(4px);border:1px solid rgba(34,197,94,0.4);">'
              + nomeCurto
              + '</div></div>',
            iconSize: [200, 32], iconAnchor: [11, 27],
          });
          const marker = L.marker([dev.lat!, dev.lng!], { icon }).addTo(leafletRef.current);
          marker.on("click", function() { setSelectedDev(dev); });
          markersRef.current.push(marker);

        } else {
          // ABA PREÇOS — uma bolinha por regra com offset
          if (regras.length === 0) {
            // Sem regras: pino cinza
            const icon = L.divIcon({
              className: "",
              html: '<div style="display:flex;align-items:center;gap:4px;cursor:pointer;">'
                + '<div style="width:14px;height:14px;background:#6b7280;border-radius:50%;border:2px solid white;"></div>'
                + '<div style="background:rgba(10,10,20,0.88);color:#94a3b8;padding:2px 6px;border-radius:6px;font-size:9px;font-weight:700;">' + nomeCurto + '</div>'
                + '</div>',
              iconSize: [160, 24], iconAnchor: [7, 12],
            });
            const marker = L.marker([dev.lat!, dev.lng!], { icon }).addTo(leafletRef.current);
            marker.on("click", function() { setSelectedDev(dev); });
            markersRef.current.push(marker);
          } else {
            const totalRegras = regras.length;
            regras.forEach(function(regra, idx) {
              const cor = CORES_REGRAS[idx % CORES_REGRAS.length];
              const mid = (totalRegras - 1) / 2;
              const lngOffset = (idx - mid) * 0.00018;
              const icon = L.divIcon({
                className: "",
                html: '<div style="display:flex;align-items:center;gap:3px;cursor:pointer;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.5));">'
                  + '<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">'
                  + '<div style="width:18px;height:18px;background:' + cor + ';border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 5px ' + cor + '88;"></div>'
                  + '<div style="width:3px;height:6px;background:' + cor + ';margin-top:-1px;border-radius:0 0 2px 2px;"></div>'
                  + '</div>'
                  + '<div style="background:rgba(10,10,20,0.9);color:white;padding:2px 6px;border-radius:6px;font-size:9px;font-weight:700;white-space:nowrap;border:1px solid ' + cor + '55;">'
                  + nomeCurto + ' · ' + regra.nomeRegra
                  + '</div></div>',
                iconSize: [190, 30], iconAnchor: [9, 24],
              });
              const marker = L.marker([dev.lat!, dev.lng! + lngOffset], { icon }).addTo(leafletRef.current);
              marker.on("click", function() { setSelectedDev(dev); });
              markersRef.current.push(marker);
            });
          }
        }
      });
    });
  }, [devsFiltrados, abaAtiva, mapReady]);

  function startResizeDrag(e: React.MouseEvent | React.TouchEvent) {
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    resizeDragRef.current = { startY: clientY, startH: mapHeight };
    const onMove = function(ev: MouseEvent | TouchEvent) {
      if (!resizeDragRef.current) return;
      const y = 'touches' in ev ? (ev as TouchEvent).touches[0].clientY : (ev as MouseEvent).clientY;
      const newH = Math.max(300, Math.min(window.innerHeight - 100, resizeDragRef.current.startH + (y - resizeDragRef.current.startY)));
      setMapHeight(newH);
      localStorage.setItem('mapGlobalHeight', String(Math.round(newH)));
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

  function toggleFullscreen() {
    setIsFullscreen(function(v) { return !v; });
    setTimeout(function() { leafletRef.current?.invalidateSize?.(); }, 300);
  }

  const totalDisponiveis = devsComLoc.reduce(function(s,d) { return s + Math.max(0,(d.totalLotes??0)-(d.lotesVendidos??0)); }, 0);
  const totalVendidos = devsComLoc.reduce(function(s,d) { return s + (d.lotesVendidos??0); }, 0);

  return (
    <div ref={containerRef} className="flex flex-col w-full overflow-hidden"
      style={isFullscreen
        ? { position:'fixed', inset:0, zIndex:9999, width:'100vw', height:'100vh', borderRadius:0, background:'#000' }
        : { borderRadius:20, background:'transparent' }}>

      {/* ABAS */}
      <div style={{ display:'flex', background:'#111827', padding:'8px 12px', gap:8, borderTopLeftRadius:16, borderTopRightRadius:16, flexShrink:0 }}>
        <button onClick={function() { setAbaAtiva("disponiveis"); setSelectedDev(null); }}
          style={{ flex:1, padding:'8px 12px', borderRadius:8, cursor:'pointer', border:'none', fontWeight:'bold', fontSize:12,
            background: abaAtiva === "disponiveis" ? '#22c55e' : '#374151', color:'white', transition:'all 0.2s' }}>
          📊 Disponíveis
        </button>
        <button onClick={function() { setAbaAtiva("preco"); setSelectedDev(null); }}
          style={{ flex:1, padding:'8px 12px', borderRadius:8, cursor:'pointer', border:'none', fontWeight:'bold', fontSize:12,
            background: abaAtiva === "preco" ? '#f97316' : '#374151', color:'white', transition:'all 0.2s' }}>
          💰 Preços
        </button>
        {/* Busca */}
        <input value={busca} onChange={function(e) { setBusca(e.target.value); }} placeholder="Buscar..."
          style={{ flex:2, padding:'6px 10px', borderRadius:8, border:'1px solid #374151', background:'#1f2937', color:'white', fontSize:11, outline:'none' }}/>
        {/* Camadas */}
        {(['satelite','ruas'] as Camada[]).map(function(c) {
          return (
            <button key={c} onClick={function() { setCamada(c); }}
              style={{ padding:'6px 10px', borderRadius:8, cursor:'pointer', border:'none', fontSize:10, fontWeight:'bold',
                background: camada === c ? '#3b82f6' : '#374151', color:'white' }}>
              {c === 'satelite' ? '🛰' : '🗺'}
            </button>
          );
        })}
        <button onClick={toggleFullscreen}
          style={{ padding:'6px 10px', borderRadius:8, cursor:'pointer', border:'none', fontSize:12, background:'#374151', color:'white' }}>
          {isFullscreen ? '⊠' : '⤢'}
        </button>
      </div>

      {/* MAPA */}
      <div style={{ display:'flex', height: isFullscreen ? 'calc(100vh - 80px)' : mapHeight, position:'relative', flexShrink:0 }}>
        <div style={{ flex:1, position:'relative', minWidth:0 }}>
          <div ref={mapRef} style={{ position:'absolute', inset:0, pointerEvents: mapaLocked ? 'none' : 'auto' }}/>

          {/* Botões direita */}
          <div style={{ position:'absolute', top:10, right:10, zIndex:1020, display:'flex', flexDirection:'column', gap:5 }}>
            <button onClick={function() { leafletRef.current?.zoomIn(); }}
              style={{ width:32, height:32, borderRadius:8, cursor:'pointer', background:'rgba(255,255,255,0.95)', border:'1px solid #e2e8f0', fontSize:18, fontWeight:900, color:'#374151', display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
            <button onClick={function() { leafletRef.current?.zoomOut(); }}
              style={{ width:32, height:32, borderRadius:8, cursor:'pointer', background:'rgba(255,255,255,0.95)', border:'1px solid #e2e8f0', fontSize:22, fontWeight:900, color:'#374151', display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
            <button title={mapaLocked ? "Desbloquear" : "Bloquear"} onClick={function() { setMapaLocked(function(v) { return !v; }); }}
              style={{ width:32, height:32, borderRadius:8, cursor:'pointer', background: mapaLocked ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)', border: mapaLocked ? '1px solid #ef4444' : '1px solid #22c55e', color: mapaLocked ? '#ef4444' : '#22c55e', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>
              {mapaLocked ? "🔒" : "🔓"}
            </button>
            <button onClick={function() {
                if (!leafletRef.current || !devsComLoc.length) return;
                import("leaflet").then(function(L) {
                  if (!leafletRef.current) return;
                  leafletRef.current.invalidateSize({ animate: false });
                  if (devsComLoc.length === 1) {
                    leafletRef.current.flyTo([devsComLoc[0].lat!, devsComLoc[0].lng!], 13, { animate: true });
                  } else {
                    leafletRef.current.fitBounds(
                      L.latLngBounds(devsComLoc.map(function(d) { return [d.lat!, d.lng!] as [number,number]; })),
                      { padding: [40,40], maxZoom: 12, animate: true }
                    );
                  }
                });
              }}
              style={{ width:32, height:32, borderRadius:8, cursor:'pointer', background:'rgba(255,255,255,0.95)', border:'1px solid #e2e8f0', color:'#374151', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>
              ⊕
            </button>
          </div>

          {/* Stats rodapé mapa */}
          {devsComLoc.length > 0 && (
            <div style={{ position:'absolute', bottom:12, left:12, zIndex:1000, background:'rgba(10,15,26,0.82)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'7px 11px', display:'flex', gap:12 }}>
              {[
                { label:'Empreend.', value:devsComLoc.length, color:'#94a3b8' },
                { label:'Disponíveis', value:totalDisponiveis, color:'#4ade80' },
                { label:'Vendidos', value:totalVendidos, color:'#f87171' },
              ].map(function(s) {
                return (
                  <div key={s.label} style={{ textAlign:'center' }}>
                    <p style={{ fontSize:14, fontWeight:900, color:s.color, margin:0, lineHeight:1 }}>{s.value}</p>
                    <p style={{ fontSize:8, color:'rgba(255,255,255,0.3)', margin:'2px 0 0', textTransform:'uppercase' }}>{s.label}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Overlay bloqueio */}
          {mapaLocked && (
            <div style={{ position:'absolute', inset:0, zIndex:1009, cursor:'not-allowed',
              background: flashLock ? 'rgba(239,68,68,0.08)' : 'transparent', transition:'background 0.15s' }}
              onClick={function() { setFlashLock(true); setTimeout(function() { setFlashLock(false); }, 600); }}
              onWheel={function(e) { e.stopPropagation(); }}/>
          )}

          {/* Card popup selectedDev */}
          {selectedDev && (function() {
            const regrasAtivas = extrairRegrasDev(selectedDev);
            const totalLotes = selectedDev.totalLotes ?? 0;
            const vendidos = selectedDev.lotesVendidos ?? 0;
            const disponiveis = Math.max(0, totalLotes - vendidos);
            const pct = totalLotes > 0 ? Math.round((vendidos / totalLotes) * 100) : 0;
            const statusColor = pct >= 90 ? '#ef4444' : pct >= 60 ? '#f59e0b' : '#4ade80';
            return (
              <div style={{ position:'absolute', top:12, left:12, zIndex:1002, width:240,
                maxHeight:'80vh', overflowY:'auto', background:'rgba(10,15,26,0.95)',
                backdropFilter:'blur(16px)', border:'1px solid rgba(255,255,255,0.1)',
                borderRadius:16, color:'white' }}>
                {/* Header */}
                <div style={{ padding:'10px 12px 8px', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <p style={{ fontSize:12, fontWeight:900, margin:'0 0 2px' }}>{selectedDev.nome}</p>
                      {selectedDev.cidade && <p style={{ fontSize:10, color:'rgba(255,255,255,0.4)', margin:0 }}>📍 {selectedDev.cidade}</p>}
                    </div>
                    <button onClick={function() { setSelectedDev(null); }}
                      style={{ background:'rgba(255,255,255,0.08)', border:'none', color:'rgba(255,255,255,0.5)', borderRadius:6, width:22, height:22, cursor:'pointer', fontSize:14 }}>×</button>
                  </div>
                  {/* Stats */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4, marginTop:8 }}>
                    {[['Total',totalLotes,'#94a3b8'],['Disp.',disponiveis,'#4ade80'],['Vend.',vendidos,'#f87171']].map(function(item) {
                      return (
                        <div key={String(item[0])} style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'4px', textAlign:'center' }}>
                          <p style={{ fontSize:13, fontWeight:900, color:String(item[2]), margin:0 }}>{item[1]}</p>
                          <p style={{ fontSize:8, color:'rgba(255,255,255,0.3)', margin:0, textTransform:'uppercase' }}>{item[0]}</p>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ height:3, background:'rgba(255,255,255,0.08)', borderRadius:2, overflow:'hidden', marginTop:8 }}>
                    <div style={{ height:'100%', width:pct+'%', background:statusColor, borderRadius:2 }}/>
                  </div>
                </div>

                {/* Conteúdo por aba */}
                <div style={{ padding:'8px 10px', display:'flex', flexDirection:'column', gap:6 }}>
                  {abaAtiva === "disponiveis" ? (
                    <div style={{ background:'rgba(34,197,94,0.08)', borderRadius:10, padding:'8px 10px', border:'1px solid rgba(34,197,94,0.2)' }}>
                      <span style={{ fontSize:10, fontWeight:900, color:'#22c55e', textTransform:'uppercase', letterSpacing:'0.5px' }}>📊 Ocupação</span>
                      <p style={{ margin:'6px 0 0', fontSize:11, color:'rgba(255,255,255,0.7)' }}>
                        {disponiveis} lotes disponíveis de {totalLotes} no total ({pct}% ocupado)
                      </p>
                    </div>
                  ) : regrasAtivas.length === 0 ? (
                    <p style={{ fontSize:10, color:'rgba(255,255,255,0.3)', textAlign:'center', padding:'8px 0' }}>
                      Nenhuma regra de preço configurada
                    </p>
                  ) : (
                    regrasAtivas.map(function(regra, idx) {
                      const cor = CORES_REGRAS[idx % CORES_REGRAS.length];
                      const valorParcela = regra.parcelas > 0 ? Math.round((regra.valor - regra.entrada) / regra.parcelas) : 0;
                      return (
                        <div key={regra.id} style={{ background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'8px 10px', border:'1px solid '+cor+'44' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                            <div style={{ width:8, height:8, borderRadius:'50%', background:cor, flexShrink:0 }}/>
                            <span style={{ fontSize:10, fontWeight:900, color:cor, textTransform:'uppercase', letterSpacing:'0.5px' }}>{regra.nomeRegra}</span>
                            {regra.lotesInfo && (
                              <span style={{ fontSize:8, color:'rgba(255,255,255,0.35)', marginLeft:'auto', maxWidth:80, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {regra.lotesInfo}
                              </span>
                            )}
                          </div>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:3 }}>
                            <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:6, padding:'4px 6px' }}>
                              <p style={{ fontSize:8, color:'rgba(255,255,255,0.35)', margin:0 }}>TOTAL</p>
                              <p style={{ fontSize:11, fontWeight:900, color:'white', margin:0 }}>R$ {regra.valor.toLocaleString('pt-BR')}</p>
                            </div>
                            <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:6, padding:'4px 6px' }}>
                              <p style={{ fontSize:8, color:'rgba(255,255,255,0.35)', margin:0 }}>ENTRADA</p>
                              <p style={{ fontSize:11, fontWeight:900, color:cor, margin:0 }}>R$ {regra.entrada.toLocaleString('pt-BR')}</p>
                            </div>
                            <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:6, padding:'4px 6px', gridColumn:'span 2' }}>
                              <p style={{ fontSize:8, color:'rgba(255,255,255,0.35)', margin:0 }}>PARCELAS</p>
                              <p style={{ fontSize:11, fontWeight:900, color:'white', margin:0 }}>{regra.parcelas}× R$ {valorParcela.toLocaleString('pt-BR')}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Botões */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, padding:'0 10px 10px' }}>
                  <button onClick={function() { onVerMapa(selectedDev.id); }}
                    style={{ padding:'8px 0', borderRadius:10, background:'rgba(74,222,128,0.15)', border:'1px solid rgba(74,222,128,0.3)', color:'#4ade80', fontSize:10, fontWeight:900, cursor:'pointer' }}>
                    VER MAPA
                  </button>
                  <button onClick={function() { onAbrirEmpreendimento(selectedDev.id); }}
                    style={{ padding:'8px 0', borderRadius:10, background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.6)', fontSize:10, fontWeight:900, cursor:'pointer' }}>
                    EDITAR
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* RESIZE HANDLE */}
      {!isFullscreen && (
        <div onMouseDown={startResizeDrag} onTouchStart={startResizeDrag}
          style={{ flexShrink:0, height:10, background:'rgba(255,255,255,0.03)', borderTop:'1px solid rgba(255,255,255,0.05)', cursor:'row-resize', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width:32, height:2, background:'rgba(255,255,255,0.15)', borderRadius:2 }}/>
        </div>
      )}
    </div>
  );
});

export default MapaGlobalDashboard;
