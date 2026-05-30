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
  valorParcela: number;
  lotesInfo: string;
}

function validLatLng(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && typeof lng === 'number'
    && isFinite(lat) && isFinite(lng)
    && lat !== 0 && lng !== 0
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

// Função de extração corrigida e robusta para o novo padrão de script do usuário
function extrairRegrasScript(scriptText: string | undefined | null): RegraPreco[] {
  if (!scriptText) return [];
  const linhas = scriptText.split('\n');
  const resultadoRegras: RegraPreco[] = [];

  for (let i = 0; i < linhas.length; i++) {
    const linhaLimpa = linhas[i].trim();
    if (linhaLimpa.toUpperCase().startsWith("REGRA")) {
      const partes = linhaLimpa.split(':');
      const nomeEncontrado = partes[0].trim();
      
      // Captura flexível de números ignorando espaços
      const vMatch = linhaLimpa.match(/VALOR\s*:\s*(\d+)/i);
      const eMatch = linhaLimpa.match(/ENTRADA\s*:\s*(\d+)/i);
      
      // Captura especial para o formato PARCELAS:87 ou PARCELAS:87x650
      const pMatch = linhaLimpa.match(/PARCELAS\s*:\s*(\d+)(?:x(\d+))?/i);
      
      // Captura amigável de tudo que está entre o Nome da Regra e a palavra VALOR
      let infoLotes = "";
      const idxValor = linhaLimpa.toUpperCase().indexOf("VALOR");
      if (idxValor > 0) {
        infoLotes = linhaLimpa.substring(nomeEncontrado.length + 1, idxValor).trim();
        infoLotes = infoLotes.replace(/[\s\.]*$/, ''); // Remove pontos ou espaços no final
      }

      if (vMatch) {
        const numParcelas = pMatch ? parseInt(pMatch[1]) : 0;
        const valParcela = pMatch && pMatch[2] ? parseInt(pMatch[2]) : 0;

        resultadoRegras.push({
          id: nomeEncontrado + "_" + i,
          nomeRegra: nomeEncontrado,
          valor: parseInt(vMatch[1]),
          entrada: eMatch ? parseInt(eMatch[1]) : 0,
          parcelas: numParcelas,
          valorParcela: valParcela,
          lotesInfo: infoLotes || "Mapeado no script"
        });
      }
    }
  }

  return resultadoRegras;
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
  const [mapHeight, setMapHeight] = useState(480);
  const resizeDragRef = useRef<{startY:number;startH:number}|null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const empreendimentosFiltrados = useMemo(() => {
    return focusDevId ? empreendimentos.filter(d => d.id === focusDevId) : empreendimentos;
  }, [empreendimentos, focusDevId]);

  const devsComLoc = useMemo(() => {
    return empreendimentosFiltrados.filter(d => validLatLng(d.lat, d.lng));
  }, [empreendimentosFiltrados]);

  const devsFiltrados = useMemo(() => {
    let list = devsComLoc;
    if (busca.trim()) {
      list = list.filter(d => {
        const nComp = String(d.nome ?? '').toLowerCase();
        const cComp = String(d.cidade ?? '').toLowerCase();
        return nComp.includes(busca.toLowerCase()) || cComp.includes(busca.toLowerCase());
      });
    }
    return list;
  }, [devsComLoc, busca]);

  useImperativeHandle(ref, () => ({
    centralizar: () => {
      if (!leafletRef.current || !devsComLoc.length) return;
      import("leaflet").then(L => {
        if (!leafletRef.current) return;
        if (devsComLoc.length === 1) {
          leafletRef.current.flyTo([devsComLoc[0].lat!, devsComLoc[0].lng!], 15, { animate: true });
        } else {
          const bounds = L.latLngBounds(devsComLoc.map(d => [d.lat!, d.lng!] as [number, number]));
          leafletRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: true });
        }
      });
    },
    minhaLocalizacao: () => {
      navigator.geolocation.getCurrentPosition(
        pos => { leafletRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 15, { animate: true }); },
        err => { alert("Erro ao obter localização."); },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    },
  }), [devsComLoc]);

  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;
    import("leaflet").then(L => {
      if (!mapRef.current || leafletRef.current) return;
      const map = L.map(mapRef.current, {
        center: [-15, -55],
        zoom: 5,
        zoomControl: false,
        attributionControl: false,
      });
      tileRef.current = L.tileLayer(TILES.satelite.url, TILES.satelite.options).addTo(map);
      map.on("zoomend", () => setMapZoom(map.getZoom()));
      map.on('click', (e: any) => {
        if (onLocationPick) {
          onLocationPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
        }
      });
      leafletRef.current = map;
      setMapReady(true);
    });
    return () => {
      if (leafletRef.current) { leafletRef.current.remove(); leafletRef.current = null; }
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !leafletRef.current) return;
    import("leaflet").then(L => {
      if (tileRef.current) { tileRef.current.remove(); }
      if (overlayRef.current) { overlayRef.current.remove(); }
      tileRef.current = L.tileLayer(TILES[camada].url, TILES[camada].options).addTo(leafletRef.current);
      if (camada === 'hibrido') {
        overlayRef.current = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 19, opacity: 0.8, crossOrigin: true }
        ).addTo(leafletRef.current);
      }
    });
  }, [camada, mapReady]);

  // Renderização inteligente de múltiplos pinos com offsets calculados
  useEffect(() => {
    if (!mapReady || !leafletRef.current) return;
    import("leaflet").then(L => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      for (let k = 0; k < devsFiltrados.length; k++) {
        const dev = devsFiltrados[k];
        const listaRegras = extrairRegrasScript(dev.mapaScriptRegras);

        if (abaAtiva === "disponiveis") {
          const icon = L.divIcon({
            className: "",
            html: `<div style="display:flex;align-items:center;gap:4px;cursor:pointer;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.4));">
              <div style="width:18px;height:18px;background:#22c55e;border:2px solid white;border-radius:50%;"></div>
              <div style="background:rgba(20,20,20,0.85);color:white;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:bold;white-space:nowrap;">${dev.nome}</div>
            </div>`,
            iconSize: [150, 30], iconAnchor: [9, 9]
          });
          const marker = L.marker([dev.lat!, dev.lng!], { icon }).addTo(leafletRef.current);
          marker.on("click", () => setSelectedDev(dev));
          markersRef.current.push(marker);
        } else {
          for (let idx = 0; idx < listaRegras.length; idx++) {
            const r = listaRegras[idx];
            
            // Cores explícitas para as 4 Regras
            let corDaBolinha = "#e53935"; // Regra 1 -> Vermelho
            if (r.nomeRegra.toUpperCase().includes("REGRA2")) corDaBolinha = "#f97316"; // Regra 2 -> Laranja
            if (r.nomeRegra.toUpperCase().includes("REGRA3")) corDaBolinha = "#eab308"; // Regra 3 -> Amarelo
            if (r.nomeRegra.toUpperCase().includes("REGRA4")) corDaBolinha = "#a855f7"; // Regra 4 -> Roxo

            // Afastamento artificial lado a lado (evita sobreposição)
            const deslocamentoLat = (idx - (listaRegras.length - 1) / 2) * 0.0003;
            
            const icon = L.divIcon({
              className: "",
              html: `<div style="display:flex;align-items:center;gap:4px;cursor:pointer;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.4));">
                <div style="width:16px;height:16px;background:${corDaBolinha};border:2px solid white;border-radius:50%;"></div>
                <div style="background:rgba(20,20,20,0.85);color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;white-space:nowrap;">${dev.nome} (${r.nomeRegra})</div>
              </div>`,
              iconSize: [180, 30], iconAnchor: [8, 8]
            });

            const marker = L.marker([dev.lat! + deslocamentoLat, dev.lng!], { icon }).addTo(leafletRef.current);
            marker.on("click", () => setSelectedDev(dev));
            markersRef.current.push(marker);
          }
        }
      }
    });
  }, [devsFiltrados, abaAtiva, mapReady]);

  function startResizeDrag(e: React.MouseEvent | React.TouchEvent) {
    const cY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    resizeDragRef.current = { startY: cY, startH: mapHeight };
    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!resizeDragRef.current) return;
      const y = 'touches' in ev ? (ev as TouchEvent).touches[0].clientY : (ev as MouseEvent).clientY;
      setMapHeight(Math.max(300, resizeDragRef.current.startH + (y - resizeDragRef.current.startY)));
      leafletRef.current?.invalidateSize?.();
    };
    const onUp = () => { resizeDragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  }

  return (
    <div ref={containerRef} className="flex flex-col w-full overflow-hidden" style={{ borderRadius: 20, background: 'transparent', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', background: '#111827', padding: '8px 16px', gap: '12px', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
        <button onClick={() => { setAbaAtiva("disponiveis"); setSelectedDev(null); }} style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer', border: 'none', fontWeight: 'bold', fontSize: 13, background: abaAtiva === "disponiveis" ? '#22c55e' : '#374151', color: 'white' }}>
          📊 VER DISPONÍVEIS
        </button>
        <button onClick={() => { setAbaAtiva("preco"); setSelectedDev(null); }} style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer', border: 'none', fontWeight: 'bold', fontSize: 13, background: abaAtiva === "preco" ? '#f97316' : '#374151', color: 'white' }}>
          💰 VER PREÇOS (REGRAS)
        </button>
      </div>

      <div style={{ display:'flex', height: mapHeight, position:'relative' }}>
        <div style={{ flex:1, position:'relative', minWidth:0 }}>
          <div ref={mapRef} style={{ position:'absolute', inset:0, pointerEvents: mapaLocked ? 'none' : 'auto' }}/>
          <div style={{ position:'absolute', top:10, right:10, zIndex:1020, display:'flex', flexDirection:'column', gap:6 }}>
            <button title={mapaLocked ? "Desbloquear mapa" : "Bloquear mapa"} onClick={() => setMapaLocked(v => !v)} style={{ width:36, height:36, borderRadius:10, cursor:'pointer', background: mapaLocked ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)', border: mapaLocked ? '1px solid #ef4444' : '1px solid #22c55e', color: mapaLocked ? '#ef4444' : '#22c55e', display:'flex', alignItems:'center', justifyContent:'center' }}>
              {mapaLocked ? "🔒" : "🔓"}
            </button>
          </div>

          {selectedDev && (() => {
            const regrasAtivas = extrairRegrasScript(selectedDev.mapaScriptRegras);
            const totalLotes = selectedDev.totalLotes ?? 0;
            const vendidos = selectedDev.lotesVendidos ?? 0;
            const disponiveis = Math.max(0, totalLotes - vendidos);

            return (
              <div style={{ position:'absolute', top:12, left:12, zIndex:1002, width:260, background:'rgba(10,15,26,0.95)', backdropFilter:'blur(10px)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:16, padding:12, color:'white', maxHeight:'90%', overflowY:'auto', display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <b style={{ fontSize:13 }}>{selectedDev.nome}</b>
                  <button onClick={() => setSelectedDev(null)} style={{ background:'none', border:'none', color:'gray', cursor:'pointer', fontSize:16 }}>×</button>
                </div>

                {abaAtiva === "disponiveis" ? (
                  <div style={{ background:'rgba(255,255,255,0.05)', padding:10, borderRadius:8, border:'1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize:10, color:'#22c55e', fontWeight:'bold', display:'block', marginBottom:6 }}>📊 OCUPAÇÃO GLOBAL</span>
                    <p style={{ margin:'3px 0', fontSize:11 }}>Total Lotes: <b>{totalLotes}</b></p>
                    <p style={{ margin:'3px 0', fontSize:11 }}>Disponíveis: <b style={{ color:'#4ade80' }}>{disponiveis}</b></p>
                    <p style={{ margin:'3px 0', fontSize:11 }}>Vendidos: <b style={{ color:'#f87171' }}>{vendidos}</b></p>
                  </div>
                ) : (
                  regrasAtivas.length === 0 ? (
                    <p style={{ fontSize:11, color:'rgba(255,255,255,0.4)', textAlign:'center' }}>Nenhuma regra de preço configurada no script.</p>
                  ) : (
                    regrasAtivas.map((regra) => {
                      let corTag = "#e53935";
                      if (regra.nomeRegra.toUpperCase().includes("REGRA2")) corTag = "#f97316";
                      if (regra.nomeRegra.toUpperCase().includes("REGRA3")) corTag = "#eab308";
                      if (regra.nomeRegra.toUpperCase().includes("REGRA4")) corTag = "#a855f7";

                      return (
                        <div key={regra.id} style={{ background:'rgba(255,255,255,0.04)', padding:10, borderRadius:8, border:`1px solid ${corTag}44`, display:'flex', flexDirection:'column', gap:4 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            <span style={{ fontSize:10, background:corTag, color:'white', padding:'2px 6px', borderRadius:4, fontWeight:'bold' }}>{regra.nomeRegra}</span>
                            <span style={{ fontSize:9, color:'rgba(255,255,255,0.4)', maxWidth:'60%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={regra.lotesInfo}>{regra.lotesInfo}</span>
                          </div>
                          <p style={{ margin:'4px 0 2px', fontSize:13, fontWeight:'bold', color:'#4ade80' }}>R$ {regra.valor.toLocaleString('pt-BR')},00</p>
                          <p style={{ margin:0, fontSize:10, color:'rgba(255,255,255,0.6)' }}>Entrada: R$ {regra.entrada.toLocaleString('pt-BR')},00</p>
                          <p style={{ margin:0, fontSize:10, color:'rgba(255,255,255,0.6)' }}>
                            Plano: {regra.parcelas}x {regra.valorParcela > 0 ? `de R$ ${regra.valorParcela.toLocaleString('pt-BR')},00` : ''}
                          </p>
                        </div>
                      );
                    })
                  )
                )}
                
                <button onClick={() => onVerMapa(selectedDev.id)} style={{ width:'100%', padding:'6px', background:'#3b82f6', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontSize:11, fontWeight:'bold', marginTop:4 }}>
                  🗺️ ABRIR MAPA INTERATIVO
                </button>
              </div>
            );
          })()}
        </div>
      </div>

      <div onMouseDown={startResizeDrag} style={{ height:10, background:'rgba(255,255,255,0.05)', cursor:'row-resize', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ width:32, height:2, background:'rgba(255,255,255,0.2)', borderRadius:2 }}/>
      </div>
    </div>
  );
});

export default MapaGlobalDashboard;
