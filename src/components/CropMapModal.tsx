import React, { useState, useRef, useEffect } from "react";
import { X, Check, RotateCcw, Crop, AlertTriangle, ZoomIn, ZoomOut } from "lucide-react";
import { MapaPonto } from "../types";

interface CropMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  existingPoints?: MapaPonto[];
  onConfirmCrop: (
    croppedBase64: string,
    updatedPoints: MapaPonto[],
    cropArea: { x: number; y: number; width: number; height: number },
    croppedBlob?: Blob | null
  ) => Promise<void> | void;
}

export const CropMapModal: React.FC<CropMapModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  existingPoints = [],
  onConfirmCrop,
}) => {
  // Margens de corte em porcentagem (0 a 100)
  const [crop, setCrop] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });

  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [adjustPoints, setAdjustPoints] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [dragMode, setDragMode] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    initialCrop: { x: number; y: number; width: number; height: number };
  } | null>(null);

  // Carregar imagem de forma segura evitando problemas de CORS / canvas tainted
  const getSafeImage = async (src: string): Promise<HTMLImageElement> => {
    let activeSrc = src;
    if (src.startsWith("http://") || src.startsWith("https://")) {
      try {
        const resp = await fetch(src);
        if (resp.ok) {
          const blob = await resp.blob();
          activeSrc = URL.createObjectURL(blob);
        }
      } catch {
        // fallback para src direto se fetch falhar
      }
    }
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => {
        // Tentar sem crossOrigin caso anônimo falhe
        const img2 = new Image();
        img2.onload = () => resolve(img2);
        img2.onerror = reject;
        img2.src = src;
      };
      img.src = activeSrc;
    });
  };

  // Carregar dimensões originais da imagem
  useEffect(() => {
    if (!imageUrl || !isOpen) return;
    let isCancelled = false;

    getSafeImage(imageUrl)
      .then((img) => {
        if (isCancelled) return;
        setNaturalSize({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
        // Iniciar com área total
        setCrop({ x: 0, y: 0, width: 100, height: 100 });
      })
      .catch((err) => {
        console.warn("Erro ao carregar dimensões da imagem do mapa:", err);
      });

    return () => {
      isCancelled = true;
    };
  }, [imageUrl, isOpen]);

  if (!isOpen) return null;

  // Lógica de arrasto e redimensionamento da caixa de corte
  const handlePointerDown = (e: React.PointerEvent, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragMode(handle);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      initialCrop: { ...crop },
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragMode || !dragStartRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const deltaXPct = ((e.clientX - dragStartRef.current.clientX) / rect.width) * 100;
    const deltaYPct = ((e.clientY - dragStartRef.current.clientY) / rect.height) * 100;
    const initial = dragStartRef.current.initialCrop;

    let next = { ...initial };

    if (dragMode === "move") {
      next.x = Math.max(0, Math.min(100 - initial.width, initial.x + deltaXPct));
      next.y = Math.max(0, Math.min(100 - initial.height, initial.y + deltaYPct));
    } else {
      if (dragMode.includes("w")) {
        const newX = Math.max(0, Math.min(initial.x + initial.width - 5, initial.x + deltaXPct));
        next.width = initial.width + (initial.x - newX);
        next.x = newX;
      }
      if (dragMode.includes("e")) {
        next.width = Math.max(5, Math.min(100 - initial.x, initial.width + deltaXPct));
      }
      if (dragMode.includes("n")) {
        const newY = Math.max(0, Math.min(initial.y + initial.height - 5, initial.y + deltaYPct));
        next.height = initial.height + (initial.y - newY);
        next.y = newY;
      }
      if (dragMode.includes("s")) {
        next.height = Math.max(5, Math.min(100 - initial.y, initial.height + deltaYPct));
      }
    }

    setCrop(next);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragMode) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      setDragMode(null);
      dragStartRef.current = null;
    }
  };

  // Contagem de bolinhas dentro da área
  const pointsInside = existingPoints.filter(
    (p) =>
      p.xPercent >= crop.x &&
      p.xPercent <= crop.x + crop.width &&
      p.yPercent >= crop.y &&
      p.yPercent <= crop.y + crop.height
  ).length;

  const pointsOutside = existingPoints.length - pointsInside;

  // Executar corte e salvar
  const handleConfirm = async () => {
    if (!naturalSize.width || !naturalSize.height) return;
    setIsProcessing(true);

    try {
      const img = await getSafeImage(imageUrl);

      const sx = Math.max(0, Math.round((crop.x / 100) * naturalSize.width));
      const sy = Math.max(0, Math.round((crop.y / 100) * naturalSize.height));
      const sw = Math.min(naturalSize.width - sx, Math.round((crop.width / 100) * naturalSize.width));
      const sh = Math.min(naturalSize.height - sy, Math.round((crop.height / 100) * naturalSize.height));

      if (sw <= 0 || sh <= 0) {
        alert("Área de corte inválida.");
        setIsProcessing(false);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setIsProcessing(false);
        return;
      }

      // Desenhar a área recortada em alta fidelidade
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      const croppedBase64 = canvas.toDataURL("image/png", 1.0);
      const croppedBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/webp", 0.95);
      });

      // Se solicitado, ajustar posições das bolinhas para o novo enquadramento
      let updatedPoints = [...existingPoints];
      if (adjustPoints && existingPoints.length > 0) {
        updatedPoints = existingPoints.map((p) => {
          const newXPct = ((p.xPercent - crop.x) / crop.width) * 100;
          const newYPct = ((p.yPercent - crop.y) / crop.height) * 100;
          return {
            ...p,
            xPercent: Number(newXPct.toFixed(4)),
            yPercent: Number(newYPct.toFixed(4)),
            atualizadoEm: new Date().toISOString(),
          };
        });
      }

      await onConfirmCrop(croppedBase64, updatedPoints, crop, croppedBlob);
      onClose();
    } catch (err) {
      console.error("Erro ao recortar imagem:", err);
      alert("Não foi possível recortar a imagem. Tente novamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const finalWidthPx = naturalSize.width ? Math.round((crop.width / 100) * naturalSize.width) : 0;
  const finalHeightPx = naturalSize.height ? Math.round((crop.height / 100) * naturalSize.height) : 0;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[10060] flex flex-col items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl flex flex-col w-full max-w-5xl h-[94vh] max-h-[900px] overflow-hidden border border-slate-200">
        {/* Cabeçalho */}
        <div className="p-4 sm:px-6 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/10 text-amber-700 flex items-center justify-center border border-amber-500/20">
              <Crop size={18} />
            </div>
            <div>
              <h3 className="font-display font-black text-slate-800 text-base sm:text-lg flex items-center gap-2">
                Recortar / Enquadrar Mapa
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                Selecione a área útil do mapa para remover bordas indesejadas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Corpo: Área do Mapa com Caixa de Recorte Interativa */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* Viewport da Imagem */}
          <div className="flex-1 bg-slate-900 relative overflow-hidden flex items-center justify-center p-3 select-none">
            <div
              ref={containerRef}
              className="relative max-w-full max-h-full inline-block shadow-2xl"
              style={{
                aspectRatio: naturalSize.width && naturalSize.height ? `${naturalSize.width} / ${naturalSize.height}` : "auto",
              }}
            >
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Mapa para corte"
                className="block max-w-full max-h-[58vh] lg:max-h-[70vh] object-contain pointer-events-none rounded-lg"
                draggable={false}
              />

              {/* Máscara escura fora da área de corte */}
              {/* Topo */}
              <div
                className="absolute top-0 left-0 right-0 bg-black/60 pointer-events-none transition-all"
                style={{ height: `${crop.y}%` }}
              />
              {/* Base */}
              <div
                className="absolute bottom-0 left-0 right-0 bg-black/60 pointer-events-none transition-all"
                style={{ height: `${100 - (crop.y + crop.height)}%` }}
              />
              {/* Esquerda */}
              <div
                className="absolute left-0 bg-black/60 pointer-events-none transition-all"
                style={{
                  top: `${crop.y}%`,
                  height: `${crop.height}%`,
                  width: `${crop.x}%`,
                }}
              />
              {/* Direita */}
              <div
                className="absolute right-0 bg-black/60 pointer-events-none transition-all"
                style={{
                  top: `${crop.y}%`,
                  height: `${crop.height}%`,
                  width: `${100 - (crop.x + crop.width)}%`,
                }}
              />

              {/* Caixa de Recorte com Borda e Handles */}
              <div
                className="absolute border-2 border-amber-400 shadow-[0_0_0_1px_rgba(0,0,0,0.4)] cursor-move transition-shadow hover:shadow-[0_0_15px_rgba(245,158,11,0.5)]"
                style={{
                  left: `${crop.x}%`,
                  top: `${crop.y}%`,
                  width: `${crop.width}%`,
                  height: `${crop.height}%`,
                }}
                onPointerDown={(e) => handlePointerDown(e, "move")}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                {/* Linhas de Terços (Grid) */}
                <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-30">
                  <div className="border-r border-b border-amber-200" />
                  <div className="border-r border-b border-amber-200" />
                  <div className="border-b border-amber-200" />
                  <div className="border-r border-b border-amber-200" />
                  <div className="border-r border-b border-amber-200" />
                  <div className="border-b border-amber-200" />
                  <div className="border-r border-amber-200" />
                  <div className="border-r border-amber-200" />
                  <div />
                </div>

                {/* Handles dos 4 cantos */}
                <div
                  onPointerDown={(e) => handlePointerDown(e, "nw")}
                  className="absolute -top-2 -left-2 w-4 h-4 bg-amber-400 border-2 border-white rounded-full cursor-nwse-resize shadow-md"
                />
                <div
                  onPointerDown={(e) => handlePointerDown(e, "ne")}
                  className="absolute -top-2 -right-2 w-4 h-4 bg-amber-400 border-2 border-white rounded-full cursor-nesw-resize shadow-md"
                />
                <div
                  onPointerDown={(e) => handlePointerDown(e, "sw")}
                  className="absolute -bottom-2 -left-2 w-4 h-4 bg-amber-400 border-2 border-white rounded-full cursor-nesw-resize shadow-md"
                />
                <div
                  onPointerDown={(e) => handlePointerDown(e, "se")}
                  className="absolute -bottom-2 -right-2 w-4 h-4 bg-amber-400 border-2 border-white rounded-full cursor-nwse-resize shadow-md"
                />

                {/* Handles das 4 bordas */}
                <div
                  onPointerDown={(e) => handlePointerDown(e, "n")}
                  className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-8 h-2 bg-amber-400 border border-white rounded-full cursor-ns-resize shadow-sm"
                />
                <div
                  onPointerDown={(e) => handlePointerDown(e, "s")}
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-8 h-2 bg-amber-400 border border-white rounded-full cursor-ns-resize shadow-sm"
                />
                <div
                  onPointerDown={(e) => handlePointerDown(e, "w")}
                  className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-2 h-8 bg-amber-400 border border-white rounded-full cursor-ew-resize shadow-sm"
                />
                <div
                  onPointerDown={(e) => handlePointerDown(e, "e")}
                  className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-2 h-8 bg-amber-400 border border-white rounded-full cursor-ew-resize shadow-sm"
                />
              </div>

              {/* Preview sutil das bolinhas existentes para orientar o recorte */}
              {existingPoints.map((p) => {
                const isInside =
                  p.xPercent >= crop.x &&
                  p.xPercent <= crop.x + crop.width &&
                  p.yPercent >= crop.y &&
                  p.yPercent <= crop.y + crop.height;
                return (
                  <div
                    key={p.id}
                    className={`absolute w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-opacity ${
                      isInside ? "bg-emerald-400 ring-1 ring-white opacity-80" : "bg-red-400 opacity-40"
                    }`}
                    style={{ left: `${p.xPercent}%`, top: `${p.yPercent}%` }}
                    title={`Q${p.quadra} L${p.lote}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Painel Lateral: Controles e Ajustes de Precisão */}
          <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-slate-100 p-4 sm:p-5 flex flex-col justify-between bg-white overflow-y-auto space-y-4">
            <div className="space-y-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                  Resolução e Dimensões
                </span>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Original:</span>
                    <span className="font-mono font-bold text-slate-700">
                      {naturalSize.width} × {naturalSize.height} px
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Área Recortada:</span>
                    <span className="font-mono font-black text-amber-700">
                      {finalWidthPx} × {finalHeightPx} px
                    </span>
                  </div>
                </div>
              </div>

              {/* Status dos Marcadores */}
              {existingPoints.length > 0 && (
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                    Marcadores / Lotes
                  </span>
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Dentro do corte:</span>
                      <span className="font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        {pointsInside} de {existingPoints.length}
                      </span>
                    </div>
                    {pointsOutside > 0 && (
                      <div className="flex items-start gap-1.5 p-2 bg-amber-50 rounded-xl text-amber-800 text-[11px] font-bold">
                        <AlertTriangle size={14} className="flex-shrink-0 text-amber-600 mt-0.5" />
                        <span>{pointsOutside} marcador(es) ficarão fora da área recortada.</span>
                      </div>
                    )}

                    <label className="flex items-center gap-2 cursor-pointer pt-1 border-t border-slate-200/60">
                      <input
                        type="checkbox"
                        checked={adjustPoints}
                        onChange={(e) => setAdjustPoints(e.target.checked)}
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-[11px] font-bold text-slate-700 leading-tight">
                        Ajustar posições das bolinhas para o novo enquadramento
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Presets Rápidos */}
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">
                  Atalhos de Enquadramento
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCrop({ x: 0, y: 0, width: 100, height: 100 })}
                    className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black transition-colors text-center"
                  >
                    100% Total
                  </button>
                  <button
                    type="button"
                    onClick={() => setCrop({ x: 5, y: 5, width: 90, height: 90 })}
                    className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black transition-colors text-center"
                  >
                    Bordas -5%
                  </button>
                  <button
                    type="button"
                    onClick={() => setCrop({ x: 10, y: 10, width: 80, height: 80 })}
                    className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black transition-colors text-center"
                  >
                    Centro 80%
                  </button>
                </div>
              </div>

              {/* Micro-ajustes via Sliders */}
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                  Ajuste Fino por Borda
                </span>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-bold">Topo:</span>
                    <span className="font-mono text-slate-700">{Math.round(crop.y)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, 100 - crop.height)}
                    value={crop.y}
                    onChange={(e) => setCrop({ ...crop, y: Number(e.target.value) })}
                    className="w-full accent-amber-500"
                  />

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-bold">Base:</span>
                    <span className="font-mono text-slate-700">{Math.round(100 - (crop.y + crop.height))}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={100 - crop.y}
                    value={crop.height}
                    onChange={(e) => setCrop({ ...crop, height: Number(e.target.value) })}
                    className="w-full accent-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* Ações */}
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isProcessing}
                className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black text-xs rounded-2xl transition-all shadow-md flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Salvando corte no Supabase...</span>
                  </div>
                ) : (
                  <>
                    <Check size={16} />
                    <span>Confirmar e Salvar Recorte</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all text-center"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
