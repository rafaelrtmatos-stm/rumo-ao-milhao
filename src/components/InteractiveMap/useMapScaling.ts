import { useRef, useState, useCallback, useEffect } from 'react';

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.2;

export const useMapScaling = (
  containerRef: React.RefObject<HTMLDivElement>
) => {
  const imageRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [markerSize, setMarkerSize] = useState(1);

  // Calculate scale and marker size based on rendered dimensions
  const calculateScale = useCallback(() => {
    if (!containerRef.current || !imageRef.current) return;

    const container = containerRef.current;
    const image = imageRef.current;

    // Get original image dimensions
    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;

    // Get rendered dimensions
    const renderedWidth = container.offsetWidth;
    const renderedHeight = container.offsetHeight;

    if (naturalWidth && naturalHeight) {
      const scaleX = renderedWidth / naturalWidth;
      const scaleY = renderedHeight / naturalHeight;
      const calculatedScale = Math.min(scaleX, scaleY);

      setScale(calculatedScale);
      // Marker size scales with rendered dimensions
      setMarkerSize(calculatedScale);
    }
  }, []);

  // Recalculate on resize
  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        calculateScale();
      });
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [calculateScale]);

  // Recalculate on image load
  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;

    if (image.complete) {
      calculateScale();
    } else {
      image.addEventListener('load', calculateScale);
      return () => image.removeEventListener('load', calculateScale);
    }
  }, [calculateScale]);

  // Handle orientation change
  useEffect(() => {
    const handleOrientationChange = () => {
      setTimeout(() => {
        calculateScale();
      }, 100);
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    return () =>
      window.removeEventListener('orientationchange', handleOrientationChange);
  }, [calculateScale]);

  // Handle fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setTimeout(() => {
        calculateScale();
      }, 300);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [calculateScale]);

  const zoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(MIN_ZOOM);
  }, []);

  return {
    imageRef,
    scale,
    zoom,
    markerSize,
    zoomIn,
    zoomOut,
    resetZoom,
    calculateScale,
  };
};
