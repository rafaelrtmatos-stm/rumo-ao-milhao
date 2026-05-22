import { useEffect, useRef, useState } from "react";

interface Props {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}

export default function PickLocationMap({ lat, lng, onChange }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;

    import("leaflet").then(L => {
      if (!mapRef.current || leafletRef.current) return;

      // Centro inicial: coordenada atual ou Santarém/PA
      const initLat = lat ?? -2.4447;
      const initLng = lng ?? -54.7082;
      const initZoom = (lat && lng) ? 14 : 6;

      const map = L.map(mapRef.current, {
        center: [initLat, initLng],
        zoom: initZoom,
        zoomControl: true,
      });

      // CartoDB Voyager — visual moderno
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 19, subdomains: "abcd",
      }).addTo(map);

      // Ícone personalizado
      const icon = L.divIcon({
        className: "",
        html: `<div style="
          width:28px;height:28px;background:#1a4a1a;border:3px solid white;
          border-radius:50% 50% 50% 0;transform:rotate(-45deg);
          box-shadow:0 2px 8px rgba(0,0,0,0.4);
        "></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });

      // Marcador se já tem coordenada
      if (lat && lng) {
        markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
        markerRef.current.on("dragend", (e: any) => {
          const pos = e.target.getLatLng();
          onChange(pos.lat, pos.lng);
        });
      }

      // Clicar no mapa define/move o marcador
      map.on("click", (e: any) => {
        const { lat, lng } = e.latlng;
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
          markerRef.current.on("dragend", (ev: any) => {
            const pos = ev.target.getLatLng();
            onChange(pos.lat, pos.lng);
          });
        }
        onChange(lat, lng);
      });

      leafletRef.current = map;
      setReady(true);
    });

    return () => {
      if (leafletRef.current) {
        leafletRef.current.remove();
        leafletRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  // Atualizar marcador quando lat/lng muda externamente (via link/DMS)
  useEffect(() => {
    if (!leafletRef.current || !ready) return;
    if (!lat || !lng) return;

    import("leaflet").then(L => {
      const map = leafletRef.current;
      if (!map) return;
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        const icon = L.divIcon({
          className: "",
          html: `<div style="
            width:28px;height:28px;background:#1a4a1a;border:3px solid white;
            border-radius:50% 50% 50% 0;transform:rotate(-45deg);
            box-shadow:0 2px 8px rgba(0,0,0,0.4);
          "></div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 28],
        });
        markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
        markerRef.current.on("dragend", (e: any) => {
          const pos = e.target.getLatLng();
          onChange(pos.lat, pos.lng);
        });
      }
      map.setView([lat, lng], Math.max(map.getZoom(), 14), { animate: true });
    });
  }, [lat, lng, ready]);

  return (
    <div className="mt-2 rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-b border-slate-200">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          📍 Clique no mapa para definir a localização
        </span>
        {lat && lng && (
          <span className="text-[10px] text-emerald-600 font-bold">
            {lat.toFixed(4)}, {lng.toFixed(4)}
          </span>
        )}
      </div>
      <div ref={mapRef} style={{ height: 220 }} />
      {!lat && !lng && (
        <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200">
          <p className="text-[10px] text-slate-400">Ou use o botão 📍 Minha posição ao editar o mapa do empreendimento</p>
        </div>
      )}
    </div>
  );
}
