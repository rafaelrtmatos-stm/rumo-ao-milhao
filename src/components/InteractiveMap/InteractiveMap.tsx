import React, { useRef, useState, useEffect, useCallback } from 'react';
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
}

export interface InteractiveMapProps {
  mapImageUrl: string;
  logoUrl?: string;
  markers?: MapMarker[];
  title?: string;
  onMarkerClick?: (markerId: string) => void;
  baseMarkerSize?: number;
  showSplash?: boolean;
  splashDuration?: number;
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  mapImageUrl,
  logoUrl,
  markers = [],
  title = 'Mapa Interativo',
  onMarkerClick,
  baseMarkerSize = 24,
  showSplash = true,
  splashDuration = 2000,
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
                color={marker.color}
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
