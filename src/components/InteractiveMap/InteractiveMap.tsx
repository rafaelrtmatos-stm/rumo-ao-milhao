import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useMapScaling } from './useMapScaling';
import { Marker } from './Marker';
import { MapControls } from './MapControls';
import { SplashScreen } from './SplashScreen';
import { exportMapAsImage, exportMapAsPDF } from './ExportUtils';

export interface MapMarker {
  id: string;
  xPercent: number;
  yPercent: number;
  color?: string;
  label?: string;
  /** quadra do lote, ex: "1", "2", "7" */
  quadra?: string;
}

// ─── Tipos de visualização ────────────────────────────────────────────────────
export type MapViewMode = 'status' | 'precos';

// ─── Regra de preço: 1=Vermelho, 2=Laranja, 3=Amarelo, 4=Roxo/Azul ───────────
export type RegraPreco = 1 | 2 | 3 | 4;

export const REGRA_CORES: Record<RegraPreco, string> = {
  1: '#ef4444', // Vermelho
  2: '#f97316', // Laranja
  3: '#eab308', // Amarelo
  4: '#7c3aed', // Roxo/Azul
};

export const REGRA_LABELS: Record<RegraPreco, string> = {
  1: 'Regra 1 — Vermelho',
  2: 'Regra 2 — Laranja',
  3: 'Regra 3 — Amarelo',
  4: 'Regra 4 — Roxo',
};

/**
 * Parseia o mapaScriptRegras de um empreendimento e retorna um Map<quadra, regra>.
 *
 * Formato aceito (múltiplos formatos, separados por ponto-e-vírgula ou nova linha):
 *   Q1:Regra1 Q2:Regra1 Q3:Regra2 ; Q7:Regra3 Q8:Regra4
 *   Q1:R1, Q2:R2 ; Q3:R3
 *   Q1:1, Q2:2 ; Q3:3, Q4:4
 *
 * Normaliza "Regra1" / "R1" / "1" → 1, etc.
 * Ignora entradas malformadas silenciosamente.
 */
export function parseScriptRegras(script: string): Map<string, RegraPreco> {
  const result = new Map<string, RegraPreco>();
  if (!script || !script.trim()) return result;

  // Divide por ponto-e-vírgula ou nova linha (permissivo)
  const segmentos = script.split(/[;\n]/);

  for (const segmento of segmentos) {
    // Dentro de cada segmento, busca padrões Q<num>:<regra>
    const matches = segmento.matchAll(/Q(\w+)\s*:\s*(Regra\s*)?(\d)/gi);
    for (const m of matches) {
      const quadra = m[1].trim().toUpperCase();
      const regNum = parseInt(m[3], 10);
      if (regNum >= 1 && regNum <= 4) {
        result.set(quadra, regNum as RegraPreco);
        // Também aceita minúscula normalizada para lookup
        result.set(quadra.toLowerCase(), regNum as RegraPreco);
      }
    }
  }

  return result;
}

/**
 * Retorna a cor CSS (#hex) para uma bolinha dada sua quadra e o mapa de regras.
 * Se a quadra não estiver no mapa ou a regra for inválida, retorna null
 * (o chamador deve usar a cor de status padrão).
 */
export function getCorPorRegra(
  quadra: string | undefined,
  regraMap: Map<string, RegraPreco>
): string | null {
  if (!quadra) return null;
  const key = String(quadra).trim().toUpperCase();
  const regra = regraMap.get(key) ?? regraMap.get(key.toLowerCase());
  if (!regra) return null;
  return REGRA_CORES[regra] ?? null;
}

// ─── Props ────────────────────────────────────────────────────────────────────
export interface InteractiveMapProps {
  mapImageUrl: string;
  logoUrl?: string;
  markers?: MapMarker[];
  title?: string;
  onMarkerClick?: (markerId: string) => void;
  baseMarkerSize?: number;
  showSplash?: boolean;
  splashDuration?: number;
  /**
   * Modo de visualização:
   * - 'status'  → cores de status (padrão): Disponível=azul, Reservado=amarelo, Indisponível=vermelho
   * - 'precos'  → cores por regra de preço, derivadas de mapaScriptRegras do empreendimento
   */
  viewMode?: MapViewMode;
  /**
   * Script de regras de preço do empreendimento.
   * Processado INDIVIDUALMENTE por empreendimento — cada loteamento tem o seu próprio.
   * Formato: "Q1:Regra1 Q2:Regra2 ; Q7:Regra3 Q8:Regra4"
   */
  mapaScriptRegras?: string;
}

// ─── Componente ───────────────────────────────────────────────────────────────
export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  mapImageUrl,
  logoUrl,
  markers = [],
  title = 'Mapa Interativo',
  onMarkerClick,
  baseMarkerSize = 24,
  showSplash = true,
  splashDuration = 2000,
  viewMode = 'status',
  mapaScriptRegras = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapControlsRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(showSplash);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);

  const {
    scale,
    zoom,
    imageRef,
    zoomIn,
    zoomOut,
    resetZoom,
    markerSize,
    calculateScale,
  } = useMapScaling(containerRef);

  /**
   * Mapa de regras processado INDIVIDUALMENTE para este empreendimento.
   * É recalculado apenas quando mapaScriptRegras muda — nunca mistura dados de
   * outros empreendimentos.
   */
  const regraMap = useMemo(
    () => parseScriptRegras(mapaScriptRegras ?? ''),
    [mapaScriptRegras]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault();
          zoomIn();
          break;
        case '-':
          e.preventDefault();
          zoomOut();
          break;
        case 'r':
        case 'R':
          if (e.ctrlKey === false && e.metaKey === false) {
            e.preventDefault();
            resetZoom();
          }
          break;
        case 'f':
        case 'F':
          if (e.ctrlKey === false && e.metaKey === false) {
            e.preventDefault();
            handleToggleFullscreen();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Mouse wheel zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) return;

      e.preventDefault();
      if (e.deltaY < 0) {
        zoomIn();
      } else {
        zoomOut();
      }
    };

    const container = containerRef.current;
    container?.addEventListener('wheel', handleWheel, { passive: false });
    return () => container?.removeEventListener('wheel', handleWheel);
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
      // Recalculate after fullscreen change
      setTimeout(() => calculateScale(), 300);
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  }, [calculateScale]);

  const handleExportImage = useCallback(async () => {
    try {
      await exportMapAsImage(containerRef, {
        fileName: title.toLowerCase().replace(/\s+/g, '-'),
        scale: 4,
        pixelRatio: 2,
      });
    } catch (error) {
      console.error('Export image error:', error);
      alert('Erro ao exportar imagem');
    }
  }, [title]);

  const handleExportPDF = useCallback(async () => {
    try {
      await exportMapAsPDF(containerRef, {
        fileName: title.toLowerCase().replace(/\s+/g, '-'),
        title: title,
        scale: 4,
        pixelRatio: 2,
      });
    } catch (error) {
      console.error('Export PDF error:', error);
      alert('Erro ao exportar PDF');
    }
  }, [title]);

  const calculatedMarkerSize = baseMarkerSize * markerSize;

  /**
   * Determina a cor de cada marcador:
   * - viewMode='precos' → usa regraMap (individual deste empreendimento) para colorir por quadra
   * - viewMode='status' → usa a cor passada diretamente no marker.color (status padrão)
   */
  const resolveMarkerColor = useCallback(
    (marker: MapMarker): string | undefined => {
      if (viewMode === 'precos') {
        const cor = getCorPorRegra(marker.quadra, regraMap);
        // Se a quadra não foi mapeada, usa cinza para indicar "sem regra definida"
        return cor ?? '#94a3b8';
      }
      return marker.color;
    },
    [viewMode, regraMap]
  );

  return (
    <>
      {/* Splash Screen */}
      <SplashScreen
        logoUrl={logoUrl || '/logo-placeholder.png'}
        title={title}
        isLoading={isLoading}
        duration={splashDuration}
        onComplete={() => setIsLoading(false)}
      />

      {/* Main Container */}
      <div
        ref={containerRef}
        className={`relative w-full overflow-hidden bg-gray-100 ${
          isFullscreen
            ? 'fixed inset-0 z-50'
            : 'h-[600px] md:h-[600px] sm:h-[400px] rounded-lg'
        }`}
      >
        {/* Legenda de Preços — só aparece no modo 'precos' */}
        {viewMode === 'precos' && regraMap.size > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              zIndex: 30,
              background: 'rgba(255,255,255,0.93)',
              backdropFilter: 'blur(8px)',
              borderRadius: 12,
              padding: '8px 12px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
              border: '1px solid rgba(0,0,0,0.08)',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, color: '#64748b', marginBottom: 6 }}>
              Tabela de Preços
            </p>
            {([1, 2, 3, 4] as RegraPreco[]).map((r) => {
              const hasRegra = Array.from(regraMap.values()).includes(r);
              if (!hasRegra) return null;
              return (
                <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: REGRA_CORES[r], flexShrink: 0 }} />
                  <span style={{ color: '#374151' }}>{REGRA_LABELS[r]}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Map Image */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            transition: 'transform 0.1s ease-out',
          }}
        >
          <img
            ref={imageRef}
            src={mapImageUrl}
            alt="Mapa Interativo"
            className="h-full w-full object-contain"
            onLoad={calculateScale}
          />

          {/* Markers Overlay */}
          <div className="absolute inset-0">
            {markers.map((marker) => (
              <Marker
                key={marker.id}
                id={marker.id}
                x={marker.xPercent}
                y={marker.yPercent}
                size={calculatedMarkerSize}
                color={resolveMarkerColor(marker)}
                label={marker.label}
                isActive={activeMarkerId === marker.id}
                onClick={() => {
                  setActiveMarkerId(marker.id);
                  onMarkerClick?.(marker.id);
                }}
              />
            ))}
          </div>
        </div>

        {/* Map Controls */}
        <MapControls
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onReset={resetZoom}
          onExportImage={handleExportImage}
          onExportPDF={handleExportPDF}
          onToggleFullscreen={handleToggleFullscreen}
          isFullscreen={isFullscreen}
        />

        {/* Zoom Level Indicator */}
        <div className="absolute bottom-4 left-4 bg-white px-3 py-2 rounded-lg shadow text-sm font-medium text-gray-700">
          Zoom: {(zoom * 100).toFixed(0)}%
        </div>
      </div>
    </>
  );
};
