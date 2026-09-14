import React, { useState, useEffect } from 'react';
import { X, Check, Copy, Palette, Sparkles, RefreshCw } from 'lucide-react';
import { CORES_PALETA_BOLINHAS } from '../App';

export interface ColorPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentColor: string;
  onSelectColor: (colorHex: string) => void;
  title?: string;
  subtitle?: string;
}

// Tabela organizada de cores agrupadas por família cromática
export const TABELA_CORES_COMPLETA = [
  {
    nome: 'Azuis & Celestes',
    cores: [
      { hex: '#1e3a8a', label: 'Azul Noturno' },
      { hex: '#1d4ed8', label: 'Azul Cobalto' },
      { hex: '#2563eb', label: 'Azul Real' },
      { hex: '#3b82f6', label: 'Azul Padrão' },
      { hex: '#60a5fa', label: 'Azul Claro' },
      { hex: '#0284c7', label: 'Azul Céu' },
      { hex: '#0ea5e9', label: 'Celeste' },
      { hex: '#06b6d4', label: 'Ciano' },
      { hex: '#0891b2', label: 'Turquesa' },
      { hex: '#0e7490', label: 'Azul Petróleo' },
    ],
  },
  {
    nome: 'Verdes & Esmeraldas',
    cores: [
      { hex: '#14532d', label: 'Verde Floresta' },
      { hex: '#15803d', label: 'Verde Bandeira' },
      { hex: '#16a34a', label: 'Verde Folha' },
      { hex: '#22c55e', label: 'Verde Vivo' },
      { hex: '#4ade80', label: 'Verde Menta' },
      { hex: '#047857', label: 'Esmeralda Forte' },
      { hex: '#059669', label: 'Esmeralda' },
      { hex: '#10b981', label: 'Menta Fresco' },
      { hex: '#65a30d', label: 'Oliva' },
      { hex: '#84cc16', label: 'Verde Lima' },
    ],
  },
  {
    nome: 'Laranjas, Amarelos & Âmbar',
    cores: [
      { hex: '#7c2d12', label: 'Ferrugem' },
      { hex: '#c2410c', label: 'Terracota' },
      { hex: '#ea580c', label: 'Laranja Vivo' },
      { hex: '#f97316', label: 'Laranja Cenoura' },
      { hex: '#fb923c', label: 'Laranja Pêssego' },
      { hex: '#b45309', label: 'Âmbar Escuro' },
      { hex: '#d97706', label: 'Âmbar Dourado' },
      { hex: '#f59e0b', label: 'Amarelo Quente' },
      { hex: '#eab308', label: 'Amarelo Ouro' },
      { hex: '#ca8a04', label: 'Mostarda' },
    ],
  },
  {
    nome: 'Vermelhos & Vinhos',
    cores: [
      { hex: '#450a0a', label: 'Vinho Bordô' },
      { hex: '#7f1d1d', label: 'Vinho Escuro' },
      { hex: '#991b1b', label: 'Rubi Escuro' },
      { hex: '#b91c1c', label: 'Vermelho Fogo' },
      { hex: '#dc2626', label: 'Vermelho Vivo' },
      { hex: '#ef4444', label: 'Vermelho Coral' },
      { hex: '#f87171', label: 'Vermelho Claro' },
      { hex: '#9f1239', label: 'Cereja Escuro' },
      { hex: '#be123c', label: 'Carmim' },
      { hex: '#e11d48', label: 'Rosa Carmim' },
    ],
  },
  {
    nome: 'Roxos, Púrpuras & Violetas',
    cores: [
      { hex: '#3b0764', label: 'Roxo Noturno' },
      { hex: '#581c87', label: 'Roxo Profundo' },
      { hex: '#6b21a8', label: 'Púrpura' },
      { hex: '#7c3aed', label: 'Violeta Intenso' },
      { hex: '#8b5cf6', label: 'Violeta Claro' },
      { hex: '#a855f7', label: 'Lavanda' },
      { hex: '#c084fc', label: 'Lilás' },
      { hex: '#4338ca', label: 'Índigo Profundo' },
      { hex: '#4f46e5', label: 'Índigo' },
      { hex: '#6366f1', label: 'Índigo Claro' },
    ],
  },
  {
    nome: 'Rosas & Magentas',
    cores: [
      { hex: '#701a75', label: 'Magenta Escuro' },
      { hex: '#86198f', label: 'Púrpura Magenta' },
      { hex: '#a21caf', label: 'Magenta' },
      { hex: '#c026d3', label: 'Orquídea' },
      { hex: '#d946ef', label: 'Fúcsia' },
      { hex: '#be185d', label: 'Rosa Pink Escuro' },
      { hex: '#db2777', label: 'Pink' },
      { hex: '#ec4899', label: 'Rosa Choque' },
      { hex: '#f472b6', label: 'Rosa Chiclete' },
      { hex: '#fb7185', label: 'Rosa Pastel' },
    ],
  },
  {
    nome: 'Grafite, Chumbo & Neutros',
    cores: [
      { hex: '#09090b', label: 'Preto Puro' },
      { hex: '#0f172a', label: 'Grafite Noite' },
      { hex: '#1e293b', label: 'Ardósia Escura' },
      { hex: '#334155', label: 'Chumbo' },
      { hex: '#475569', label: 'Cinza Ardósia' },
      { hex: '#64748b', label: 'Cinza Médio' },
      { hex: '#78716c', label: 'Cinza Quente' },
      { hex: '#57534e', label: 'Pedra' },
      { hex: '#713f12', label: 'Castanho' },
      { hex: '#854d0e', label: 'Caramelo Madeira' },
    ],
  },
  {
    nome: 'Tons Suaves & Pastéis',
    cores: [
      { hex: '#93c5fd', label: 'Azul Pastel' },
      { hex: '#86efac', label: 'Verde Pastel' },
      { hex: '#fde047', label: 'Amarelo Pastel' },
      { hex: '#fdba74', label: 'Laranja Pastel' },
      { hex: '#fca5a5', label: 'Vermelho Pastel' },
      { hex: '#d8b4fe', label: 'Lavanda Pastel' },
      { hex: '#f9a8d4', label: 'Rosa Pastel' },
      { hex: '#67e8f9', label: 'Ciano Pastel' },
      { hex: '#a7f3d0', label: 'Menta Pastel' },
      { hex: '#cbd5e1', label: 'Cinza Prata' },
    ],
  },
];

const STORAGE_RECENT_COLORS = 'gestor_lotes_recent_colors';

export const ColorPickerModal: React.FC<ColorPickerModalProps> = ({
  isOpen,
  onClose,
  currentColor,
  onSelectColor,
  title = 'Personalizar Cor da Bolinha',
  subtitle = 'Escolha uma cor da tabela ou digite o código hexadecimal',
}) => {
  const [selectedColor, setSelectedColor] = useState(currentColor || '#2563eb');
  const [hexInput, setHexInput] = useState(currentColor || '#2563eb');
  const [abaAtiva, setAbaAtiva] = useState<'tabela' | 'paleta' | 'recentes'>('tabela');
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  // Sincronizar quando abrir
  useEffect(() => {
    if (isOpen) {
      const initial = currentColor || '#2563eb';
      setSelectedColor(initial);
      setHexInput(initial.toUpperCase());

      // Carregar cores recentes do localStorage
      try {
        const saved = localStorage.getItem(STORAGE_RECENT_COLORS);
        if (saved) {
          const list = JSON.parse(saved);
          if (Array.isArray(list)) setRecentColors(list);
        }
      } catch {}
    }
  }, [isOpen, currentColor]);

  if (!isOpen) return null;

  // Normalizar hex
  const handleHexInputChange = (val: string) => {
    let clean = val.trim();
    if (!clean.startsWith('#') && clean.length > 0) {
      clean = '#' + clean;
    }
    setHexInput(clean);

    // Validação de hex de 3 ou 6 dígitos
    const isValidHex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(clean);
    if (isValidHex) {
      setSelectedColor(clean.toLowerCase());
    }
  };

  const handleSelect = (hex: string) => {
    setSelectedColor(hex);
    setHexInput(hex.toUpperCase());
  };

  const handleConfirm = () => {
    let finalColor = selectedColor;
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hexInput)) {
      finalColor = hexInput.toLowerCase();
    }

    // Salvar nas recentes
    try {
      const updated = [finalColor, ...recentColors.filter(c => c.toLowerCase() !== finalColor.toLowerCase())].slice(0, 14);
      setRecentColors(updated);
      localStorage.setItem(STORAGE_RECENT_COLORS, JSON.stringify(updated));
    } catch {}

    onSelectColor(finalColor);
    onClose();
  };

  const copiarHex = () => {
    try {
      navigator.clipboard.writeText(selectedColor);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const isValidHex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hexInput);

  return (
    <div
      id="color-picker-modal-overlay"
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="color-picker-modal-content"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh] animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shadow-xs border border-black/10"
              style={{ background: selectedColor }}
            >
              <Palette className="w-4 h-4 text-white drop-shadow-xs" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800 leading-none">{title}</h3>
              <p className="text-[11px] font-medium text-slate-500 mt-1">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition-colors"
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo com Scroll */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Card de Preview da Bolinha e Código Hexadecimal */}
          <div className="bg-gradient-to-br from-slate-50 to-slate-100/60 border border-slate-200/90 rounded-2xl p-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              {/* Preview visual da bolinha */}
              <div className="flex items-center gap-4">
                <div className="relative flex flex-col items-center">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">No Mapa</span>
                  <div
                    className="w-12 h-12 rounded-full border-[3px] border-white shadow-md flex items-center justify-center transition-all duration-200 group relative"
                    style={{ background: selectedColor }}
                  >
                    <span className="text-[11px] font-black text-white drop-shadow-xs">15</span>
                  </div>
                </div>

                {/* Comparação Atual vs Nova */}
                <div className="flex flex-col justify-center">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500">Cor Atual:</span>
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/20"
                      style={{ background: currentColor || '#2563eb' }}
                    />
                    <span className="text-[10px] font-mono font-bold text-slate-600">
                      {(currentColor || '#2563eb').toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold text-slate-800">Nova Cor:</span>
                    <span
                      className="w-4 h-4 rounded-full border-2 border-white shadow-xs"
                      style={{ background: selectedColor }}
                    />
                    <span className="text-xs font-mono font-black text-slate-900">
                      {selectedColor.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Input Hexadecimal com Seletor Nativo Integrado */}
              <div className="w-full sm:w-auto flex flex-col items-end">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 self-start sm:self-end">
                  Código Hexadecimal
                </span>
                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                  {/* Seletor visual nativo (color picker) integrado e sempre visível */}
                  <label
                    className="relative w-10 h-10 rounded-xl border border-slate-300 shadow-xs cursor-pointer flex-shrink-0 flex items-center justify-center overflow-hidden hover:scale-105 active:scale-95 transition-all"
                    style={{ background: selectedColor }}
                    title="Clique para abrir o seletor visual nativo"
                  >
                    <input
                      type="color"
                      value={selectedColor}
                      onChange={(e) => handleSelect(e.target.value)}
                      className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                    />
                  </label>

                  {/* Campo de texto Hex */}
                  <div className="relative flex-1 sm:w-32">
                    <input
                      type="text"
                      value={hexInput}
                      onChange={(e) => handleHexInputChange(e.target.value)}
                      placeholder="#2563EB"
                      maxLength={7}
                      className={`w-full py-2 pl-3 pr-8 rounded-xl border text-xs font-mono font-black tracking-wide outline-none transition-all ${
                        isValidHex
                          ? 'border-slate-300 focus:border-blue-500 bg-white text-slate-800'
                          : 'border-red-400 bg-red-50/50 text-red-600'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={copiarHex}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                      title="Copiar código Hex"
                    >
                      {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
                {!isValidHex && (
                  <span className="text-[9px] font-bold text-red-500 mt-1">
                    Digite um código hex válido (ex: #2563EB)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Abas de Navegação entre Paletas */}
          <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => setAbaAtiva('tabela')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                abaAtiva === 'tabela'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Palette size={13} />
              <span>Tabela Completa de Cores</span>
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('paleta')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                abaAtiva === 'paleta'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Sparkles size={13} />
              <span>Cores Padrão do Mapa</span>
            </button>
            {recentColors.length > 0 && (
              <button
                type="button"
                onClick={() => setAbaAtiva('recentes')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                  abaAtiva === 'recentes'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <RefreshCw size={13} />
                <span>Usadas Recentemente</span>
              </button>
            )}
          </div>

          {/* Conteúdo da Aba Ativa */}
          {abaAtiva === 'tabela' && (
            <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
              {TABELA_CORES_COMPLETA.map((grupo) => (
                <div key={grupo.nome} className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-2.5">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">
                    {grupo.nome}
                  </span>
                  <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                    {grupo.cores.map((c) => {
                      const isSelected = selectedColor.toLowerCase() === c.hex.toLowerCase();
                      return (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => handleSelect(c.hex)}
                          className={`group relative h-8 rounded-xl transition-all duration-150 flex items-center justify-center border ${
                            isSelected
                              ? 'ring-2 ring-offset-2 ring-slate-900 scale-110 z-10 shadow-sm border-white'
                              : 'border-black/10 hover:scale-110 hover:z-10'
                          }`}
                          style={{ background: c.hex }}
                          title={`${c.label} (${c.hex.toUpperCase()})`}
                        >
                          {isSelected && (
                            <Check size={14} className="text-white drop-shadow-md stroke-[3]" />
                          )}
                          {/* Tooltip rápido ao pairar */}
                          <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-20">
                            {c.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {abaAtiva === 'paleta' && (
            <div className="space-y-3">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                Paleta Padrão de Faixas de Preço e Marcadores
              </span>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5">
                {CORES_PALETA_BOLINHAS.map((c) => {
                  const isSelected = selectedColor.toLowerCase() === c.cor.toLowerCase();
                  return (
                    <button
                      key={c.cor}
                      type="button"
                      onClick={() => handleSelect(c.cor)}
                      className={`group relative h-10 rounded-xl transition-all duration-150 flex flex-col items-center justify-center border ${
                        isSelected
                          ? 'ring-2 ring-offset-2 ring-slate-900 scale-110 z-10 shadow-md border-white'
                          : 'border-black/10 hover:scale-105'
                      }`}
                      style={{ background: c.cor }}
                      title={`${c.nome} (${c.cor.toUpperCase()})`}
                    >
                      {isSelected && (
                        <Check size={16} className="text-white drop-shadow-md stroke-[3]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {abaAtiva === 'recentes' && recentColors.length > 0 && (
            <div className="space-y-3">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                Cores Selecionadas Recentemente
              </span>
              <div className="flex flex-wrap gap-2.5">
                {recentColors.map((hex) => {
                  const isSelected = selectedColor.toLowerCase() === hex.toLowerCase();
                  return (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => handleSelect(hex)}
                      className={`group relative w-11 h-11 rounded-xl transition-all duration-150 flex items-center justify-center border ${
                        isSelected
                          ? 'ring-2 ring-offset-2 ring-slate-900 scale-110 z-10 shadow-md border-white'
                          : 'border-black/10 hover:scale-105'
                      }`}
                      style={{ background: hex }}
                      title={hex.toUpperCase()}
                    >
                      {isSelected && (
                        <Check size={16} className="text-white drop-shadow-md stroke-[3]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Botões de Ação */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 bg-slate-50/80">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            Cancelar
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              className="px-5 py-2 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all shadow-sm flex items-center gap-1.5"
            >
              <Check size={15} />
              <span>Confirmar Cor</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
