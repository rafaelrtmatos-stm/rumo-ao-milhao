import React, { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard,
  Building2,
  ShoppingCart,
  FileText,
  Users,
  Cake,
  Calculator,
  ChevronRight,
  ChevronLeft,
  TrendingUp,
  DollarSign,
  Package,
  Calendar,
  LogOut,
  MapPin,
  Search,
  Plus,
  Trash2,
  Printer,
  X,
  Settings,
  Info,
  FileDown,
  UserCheck,
  Pencil,
  ArrowLeft,
  User,
  List,
  Check,
  Monitor,
  Smartphone,
  ClipboardPaste,
  Upload,
  AlertTriangle,
  Database,
  ShieldCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  Section,
  Empreendimento,
  Cliente,
  Venda,
  Vendedor,
  Proprietario,
  Address,
  AppConfig,
  AppTheme,
} from "./types";
import { dbService, setCurrentUser } from "./dbService";
import { authFetch } from "./lib/authFetch";
import { maskCPF, maskRG, maskCEP, maskPhone, validateCPF } from "./lib/masks";
import { geminiService } from "./geminiService";

function parseFicha(text: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = text.split(/\r?\n/);
  const cleanCurrency = (v: string) =>
    parseFloat(v.replace(/R\$\s*/gi, "").replace(/\./g, "").replace(",", ".").trim()) || 0;

  // Converte DD/MM/AAAA ou DD/MM/AA → YYYY-MM-DD (formato do input type="date")
  const toISODate = (v: string): string => {
    const m = v.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (!m) return v;
    const day = m[1].padStart(2, "0");
    const month = m[2].padStart(2, "0");
    const year = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${year}-${month}-${day}`;
  };

  for (const rawLine of lines) {
    const colonIdx = rawLine.indexOf(":");
    if (colonIdx < 0) continue;
    // Normalize key: remove accents, uppercase, and strip trailing parenthetical like (3) or (2)
    const key = rawLine.slice(0, colonIdx).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s*[\(\[]\d+[\)\]]\s*$/, "").trim();
    const val = rawLine.slice(colonIdx + 1).trim();
    if (!val) continue;

    if (key === "NOME") { result.nome = val; }
    else if (key === "RG") { result.rg = val; }
    else if (key === "CPF") { result.cpf = val; }
    else if (key === "ESTADO CIVIL") { result.estadoCivil = val; }
    else if (["DATA DE ANIVERSARIO", "NASCIMENTO", "DATA NASC", "DATA NASCIMENTO", "ANIVERSARIO", "DATA DE NASCIMENTO"].includes(key)) {
      result.nascimento = toISODate(val);
    }
    else if (["ENDERECO", "RUA"].includes(key)) { result.endereco = val; }
    else if (["No", "NUMERO", "NUM", "Nº"].includes(key.replace(/[ºo]/i, "o"))) { result.numero = val; }
    else if (key === "BAIRRO") { result.bairro = val; }
    else if (key === "CEP") { result.cep = val; }
    else if (["CONTATO", "TELEFONE", "FONE", "TEL", "CONTATO PRINCIPAL"].includes(key)) {
      const phones = val.split("/").map((p) => p.trim()).filter(Boolean);
      if (phones[0]) result.telefone1 = phones[0];
      if (phones[1]) result.telefone2 = phones[1];
    }
    else if (["CONTATO SECUNDARIO", "TELEFONE 2", "FONE 2", "TEL 2", "CELULAR 2"].includes(key)) {
      result.telefone2 = val.split("/")[0].trim();
    }
    else if (key === "LOTE") { result.lote = val; }
    else if (key === "QUADRA") { result.quadra = val; }
    else if (key === "EMPREENDIMENTO") { result.empreendimento = val; }
    else if (["VALOR TOTAL", "VALOR"].includes(key)) { result.valorTotal = cleanCurrency(val); }
    else if (key === "ENTRADA") { result.entrada = cleanCurrency(val); }
    else if (["PARCELAS", "QUANTIDADE DE PARCELAS"].includes(key)) {
      const m = val.match(/^(\d+)[xX]?\s*(?:de\s*)?(?:R\$\s*)?([\d.,]+)/i);
      if (m) { result.numeroParcelas = parseInt(m[1]); result.valorParcela = cleanCurrency(m[2]); }
      else { result.numeroParcelas = parseInt(val.replace(/\D/g, "")) || 0; }
    }
    else if (["VENCIMENTO", "DATA DE VENCIMENTO", "DATA VENCIMENTO"].includes(key)) {
      // Handle "TODO DIA 10", "DIA 10", "10", or full date "10/05/2025"
      const dayMatch = val.match(/\b(\d{1,2})\b/);
      const fullDate = toISODate(val);
      if (fullDate !== val) {
        result.dataVencimento = fullDate;
      } else if (dayMatch) {
        result.diaVencimento = dayMatch[1];
      }
    }
    else if (key === "PROFISSAO") { result.profissao = val; }
    else if (key === "CIDADE") { result.cidade = val; }
    else if (key === "ESTADO") { result.estado = val; }
    else if (key === "NACIONALIDADE") { result.nacionalidade = val; }
  }
  return result;
}

function getLotesDeQuadra(faixa?: { inicio?: number; fim?: number; especificos?: string }): string[] {
  if (!faixa) return [];
  if (faixa.especificos && faixa.especificos.trim()) {
    return faixa.especificos
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .sort((a, b) => Number(a) - Number(b));
  }
  if (faixa.inicio !== undefined && faixa.fim !== undefined && faixa.fim >= faixa.inicio && faixa.fim > 0) {
    return Array.from({ length: faixa.fim - faixa.inicio + 1 }, (_, i) => (faixa.inicio! + i).toString());
  }
  return [];
}

function getRuaSugerida(dev: Empreendimento, quadra: string, lote: string): string | null {
  const loteNum = parseInt(lote.replace(/\D/g, ""), 10);
  if (!isNaN(loteNum) && dev.ruasFaixas && dev.ruasFaixas.length > 0) {
    const faixa = dev.ruasFaixas.find(
      (f) => f.quadra.toUpperCase() === quadra.toUpperCase() && loteNum >= f.loteInicio && loteNum <= f.loteFim
    );
    if (faixa?.rua) return faixa.rua;
  }
  const ruasQ = dev.ruasPorQuadra?.[quadra];
  if (ruasQ) {
    const arr = ruasQ.split(",").map((r) => r.trim()).filter(Boolean);
    if (arr.length === 1) return arr[0];
  }
  return null;
}

function getRuasSugeridas(dev: Empreendimento, quadra: string, lote: string): string[] {
  const exact = getRuaSugerida(dev, quadra, lote);
  if (exact) return [exact];
  if (dev.ruasFaixas) {
    const ruas = dev.ruasFaixas
      .filter((f) => f.quadra.toUpperCase() === quadra.toUpperCase() && f.rua)
      .map((f) => f.rua);
    if (ruas.length > 0) return [...new Set(ruas)];
  }
  const ruasQ = dev.ruasPorQuadra?.[quadra];
  if (ruasQ) return ruasQ.split(",").map((r) => r.trim()).filter(Boolean);
  return [];
}

function getFilledFieldNames(data: Record<string, any>): string[] {
  const map: Record<string, string> = {
    nome: "Nome", nomeComprador: "Nome",
    cpf: "CPF", rg: "RG", nascimento: "Nascimento",
    estadoCivil: "Estado Civil", profissao: "Profissão",
    nacionalidade: "Nacionalidade",
    endereco: "Endereço", numero: "Número", bairro: "Bairro",
    cidade: "Cidade", estado: "Estado", cep: "CEP",
    telefone1: "Telefone 1", telefone2: "Telefone 2",
    lote: "Lote", numeroLote: "Lote", quadra: "Quadra",
    empreendimento: "Empreendimento", empreendimentoNome: "Empreendimento",
    valorTotal: "Valor Total", valorLote: "Valor Total",
    entrada: "Entrada", valorEntrada: "Entrada",
    numeroParcelas: "Parcelas", quantidadeParcelas: "Parcelas",
    valorParcela: "Valor Parcela",
    diaVencimento: "Vencimento", vendedor: "Vendedor",
  };
  const seen = new Set<string>();
  const result: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (!map[k]) continue;
    if (!v || v === 0 || v === "") continue;
    const label = map[k];
    if (!seen.has(label)) { seen.add(label); result.push(label); }
  }
  return result;
}

function defaultVencimento(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split("T")[0];
}

function validarCPF(cpf: string): boolean {
  const c = cpf.replace(/\D/g, "");
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(c[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(c[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(c[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(c[10]);
}

function validarRG(rg: string): boolean {
  const clean = rg.replace(/\s+/g, "").trim();
  if (clean.length < 5 || clean.length > 14) return false;
  return /^[a-zA-Z0-9.\-/]+$/.test(clean);
}

function cpfStatus(v: string | undefined | null): "empty" | "valid" | "invalid" {
  if (!v) return "empty";
  const digits = v.replace(/\D/g, "");
  if (!digits.length) return "empty";
  if (digits.length < 11) return "invalid";
  return validarCPF(v) ? "valid" : "invalid";
}

function rgStatus(v: string | undefined | null): "empty" | "valid" | "invalid" {
  if (!v) return "empty";
  const clean = v.replace(/\s+/g, "").trim();
  if (!clean.length) return "empty";
  return validarRG(clean) ? "valid" : "invalid";
}

function genderizeEstadoCivil(raw: string, genero: string): string {
  const base = (raw || "")
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/\ba\b/g, "")
    .trim();
  const masc: Record<string, string> = {
    solteiro: "Solteiro", solteira: "Solteiro", casado: "Casado", casada: "Casado",
    divorciado: "Divorciado", divorciada: "Divorciado", viúvo: "Viúvo", viuvo: "Viúvo",
    viúva: "Viúvo", viuva: "Viúvo", separado: "Separado", separada: "Separado",
    "união estável": "União Estável",
  };
  const fem: Record<string, string> = {
    solteiro: "Solteira", solteira: "Solteira", casado: "Casada", casada: "Casada",
    divorciado: "Divorciada", divorciada: "Divorciada", viúvo: "Viúva", viuvo: "Viúva",
    viúva: "Viúva", viuva: "Viúva", separado: "Separada", separada: "Separada",
    "união estável": "União Estável",
  };
  const outro: Record<string, string> = {
    solteiro: "Solteiro(a)", solteira: "Solteiro(a)", casado: "Casado(a)", casada: "Casado(a)",
    divorciado: "Divorciado(a)", divorciada: "Divorciado(a)", viúvo: "Viúvo(a)", viuvo: "Viúvo(a)",
    viúva: "Viúvo(a)", viuva: "Viúvo(a)", separado: "Separado(a)", separada: "Separado(a)",
    "união estável": "União Estável",
  };
  const map = genero === "F" ? fem : genero === "O" ? outro : masc;
  return map[base] || raw;
}
import {
  Sparkles,
  Copy,
  Save,
  FileCheck,
  MessageCircle,
  BarChart3,
  Download,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  PieChart as PieChartIcon,
  Trophy,
  Medal,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";

const DELETE_PASSWORD = "Geper3tp@";

function useDeleteConfirm() {
  const [pending, setPending] = React.useState<{ message: string; onConfirm: () => void } | null>(null);
  const [inputVal, setInputVal] = React.useState("");
  const [error, setError] = React.useState(false);

  const request = (message: string, onConfirm: () => void) => {
    setInputVal("");
    setError(false);
    setPending({ message, onConfirm });
  };

  const confirm = () => {
    if (inputVal === DELETE_PASSWORD) {
      pending?.onConfirm();
      setPending(null);
      setInputVal("");
      setError(false);
    } else {
      setError(true);
      setInputVal("");
    }
  };

  const cancel = () => {
    setPending(null);
    setInputVal("");
    setError(false);
  };

  const Modal = pending ? (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
      <div className="bg-white w-full max-w-sm rounded-[24px] shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="p-2.5 bg-red-50 rounded-xl text-red-500">
            <Trash2 size={20} />
          </div>
          <div>
            <h4 className="font-display font-bold text-slate-800">Confirmar exclusão</h4>
            <p className="text-[11px] text-slate-400 font-medium">Digite a senha para continuar</p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">{pending.message}</p>
          <div>
            <label className="label">Senha de segurança</label>
            <input
              type="password"
              autoFocus
              className={`input-field ${error ? "border-red-400 bg-red-50" : ""}`}
              placeholder="Digite a senha..."
              value={inputVal}
              onChange={(e) => { setInputVal(e.target.value); setError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") confirm(); if (e.key === "Escape") cancel(); }}
            />
            {error && <p className="text-xs text-red-500 font-semibold mt-1">Senha incorreta. Tente novamente.</p>}
          </div>
        </div>
        <div className="p-6 border-t border-slate-100 flex gap-3">
          <button onClick={cancel} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={confirm} className="flex-1 h-11 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
            <Trash2 size={16} />
            Excluir
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { request, Modal };
}

const exportToCSV = (sales: Venda[]) => {
  const headers = [
    "Contrato",
    "Cliente",
    "Empreendimento",
    "Quadra",
    "Lote",
    "Valor",
    "Status",
    "Data",
  ];
  const rows = sales.map((s) => [
    s.numeroContrato,
    s.clienteNome,
    s.empreendimentoNome,
    s.quadra,
    s.numeroLote,
    s.valorLote,
    s.status || "pendente",
    new Date(s.dataVenda).toLocaleDateString(),
  ]);

  const csvContent =
    "data:text/csv;charset=utf-8," +
    headers.join(",") +
    "\n" +
    rows.map((e) => e.join(",")).join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute(
    "download",
    `vendas_rumo_ao_milhao_${new Date().toLocaleDateString()}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// --- Shake + scroll utility ---
function triggerShake(containerEl: HTMLElement | null) {
  if (!containerEl) return;
  containerEl.classList.remove('shake');
  void containerEl.offsetWidth;
  containerEl.classList.add('shake');
  containerEl.addEventListener('animationend', () => containerEl.classList.remove('shake'), { once: true });

  const firstInvalid = containerEl.querySelector<HTMLElement>(
    'input:invalid, select:invalid, textarea:invalid'
  ) || containerEl.querySelector<HTMLElement>(
    'input[required], select[required], textarea[required]'
  );
  if (firstInvalid) {
    firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    firstInvalid.classList.add('field-invalid');
    const clear = () => { firstInvalid.classList.remove('field-invalid'); };
    firstInvalid.addEventListener('input', clear, { once: true });
    firstInvalid.addEventListener('change', clear, { once: true });
  }
}

// --- Components ---

const Sidebar = ({
  currentSection,
  setSection,
  isOpen,
  setIsOpen,
  onLogout,
  isAdmin,
  forceDesktop,
  onToggleDesktop,
  userPermissions,
  userEmail,
}: {
  currentSection: Section;
  setSection: (s: Section) => void;
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  onLogout?: () => void;
  isAdmin?: boolean;
  forceDesktop: boolean;
  onToggleDesktop: () => void;
  userPermissions?: Record<string, boolean>;
  userEmail?: string;
}) => {
  const allMenuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "vendas", label: "Nova Venda", icon: ShoppingCart },
    { id: "empreendimentos", label: "Empreendimentos", icon: Building2 },
    { id: "proprietarios", label: "Proprietários", icon: UserCheck },
    { id: "contratos", label: "Contratos", icon: FileText },
    { id: "clientes", label: "Clientes", icon: Users },
    { id: "aniversarios", label: "Aniversários", icon: Cake },
    { id: "calculadora", label: "Calculadora", icon: Calculator },
    { id: "usuarios", label: "Usuários", icon: User },
  ];

  // Filtra itens de menu por permissão (admin sempre vê tudo)
  const mainMenuItems = isAdmin
    ? allMenuItems
    : allMenuItems.filter((item) => userPermissions?.[item.id] !== false);

  const configItem = { id: "config", label: "Configurações", icon: Settings };
  const showConfig = isAdmin || userPermissions?.["config"] !== false;

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[55] lg:hidden"
          />
        )}
      </AnimatePresence>

      <div
        className={`w-72 bg-surface-card h-screen flex flex-col fixed left-0 top-0 border-r border-border-subtle shadow-xl z-[60] transition-transform duration-300 transform ${forceDesktop || isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div className="p-5 sm:p-8 flex justify-between items-center bg-surface-card border-b border-border-subtle">
          <div>
            <h1 className="text-2xl font-display font-bold text-primary-main italic tracking-tight">
              Rumo ao Milhão
            </h1>
            <p className="text-[10px] uppercase font-bold text-slate-400 mt-0.5 tracking-widest">
              Soluções Imobiliárias
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="lg:hidden p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-4 py-8 space-y-2 overflow-y-auto">
          {mainMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setSection(item.id as Section);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-200 group ${
                  isActive
                    ? "bg-primary-main text-primary-contrast shadow-lg shadow-primary-main/20 font-semibold"
                    : "text-slate-500 hover:bg-slate-50 hover:text-primary-main"
                }`}
              >
                <div
                  className={`p-2 rounded-lg ${isActive ? "bg-white/20" : "bg-slate-100 group-hover:bg-primary-light/10 text-slate-400 group-hover:text-primary-main"} transition-colors`}
                >
                  <Icon size={18} />
                </div>
                <span className="text-sm">{item.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="nav-active"
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-contrast shadow-sm"
                  />
                )}
              </button>
            );
          })}

          {/* Toggle Mobile / PC */}
          <button
            onClick={onToggleDesktop}
            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-200 group text-slate-500 hover:bg-slate-50 hover:text-primary-main"
          >
            <div className="p-2 rounded-lg bg-slate-100 group-hover:bg-primary-light/10 text-slate-400 group-hover:text-primary-main transition-colors">
              {forceDesktop ? <Smartphone size={18} /> : <Monitor size={18} />}
            </div>
            <span className="text-sm font-medium">
              {forceDesktop ? "Versão Mobile" : "Versão PC"}
            </span>
          </button>

          {/* Config */}
          {showConfig && (() => {
            const item = configItem;
            const Icon = item.icon;
            const isActive = currentSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setSection(item.id as Section);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-200 group ${
                  isActive
                    ? "bg-primary-main text-primary-contrast shadow-lg shadow-primary-main/20 font-semibold"
                    : "text-slate-500 hover:bg-slate-50 hover:text-primary-main"
                }`}
              >
                <div
                  className={`p-2 rounded-lg ${isActive ? "bg-white/20" : "bg-slate-100 group-hover:bg-primary-light/10 text-slate-400 group-hover:text-primary-main"} transition-colors`}
                >
                  <Icon size={18} />
                </div>
                <span className="text-sm">{item.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="nav-active"
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-contrast shadow-sm"
                  />
                )}
              </button>
            );
          })()}
        </nav>

        <div className="p-6 border-t border-slate-50 space-y-2">
          {userEmail && (
            <div className="px-3 py-2 rounded-xl bg-slate-50 mb-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Logado como</p>
              <p className="text-xs font-bold text-slate-500 truncate">{userEmail}</p>
              {isAdmin && <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Administrador</p>}
            </div>
          )}
          <button
            onClick={onLogout}
            className="flex items-center gap-3 px-5 py-4 text-slate-400 hover:text-red-500 transition-colors w-full rounded-2xl hover:bg-red-50"
          >
            <LogOut size={20} />
            <span className="font-semibold text-sm">Sair do Sistema</span>
          </button>
        </div>
      </div>
    </>
  );
};

const Header = ({
  title,
  toggleSidebar,
  forceDesktop,
}: {
  title: string;
  toggleSidebar: () => void;
  forceDesktop: boolean;
}) => (
  <header className={`h-20 lg:h-24 bg-surface-card/80 backdrop-blur-md border-b border-border-subtle flex items-center px-6 lg:px-10 fixed top-0 right-0 z-40 ${forceDesktop ? "left-72" : "left-0 lg:left-72"}`}>
    <button
      onClick={toggleSidebar}
      className={`${forceDesktop ? "hidden" : "lg:hidden"} p-3 mr-4 bg-surface-bg hover:bg-slate-100 rounded-2xl text-slate-600 transition-colors`}
    >
      <LayoutDashboard size={22} />
    </button>
    <h2 className="text-xl lg:text-2xl font-display font-bold text-slate-800 tracking-tight truncate">
      {title}
    </h2>
  </header>
);

const BottomNav = ({
  currentSection,
  setSection,
}: {
  currentSection: Section;
  setSection: (s: Section) => void;
}) => {
  const items = [
    { id: "dashboard", label: "Início", icon: LayoutDashboard },
    { id: "clientes", label: "Clientes", icon: Users },
    { id: "aniversarios", label: "Niver", icon: Cake },
    { id: "calculadora", label: "Simulador", icon: Calculator },
  ];

  return (
    <nav className="lg:hidden fixed bottom-6 left-6 right-6 h-18 bg-surface-card/90 backdrop-blur-xl border border-border-subtle rounded-3xl shadow-2xl flex items-center justify-around px-2 z-50 no-print">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = currentSection === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setSection(item.id as Section)}
            className={`flex flex-col items-center justify-center gap-1.5 transition-all duration-300 relative px-4 py-2 ${isActive ? "text-primary-main" : "text-slate-400 hover:text-slate-600"}`}
          >
            {isActive && (
              <motion.div
                layoutId="bottom-nav-indicator"
                className="absolute -top-1 w-8 h-1 bg-primary-main rounded-full"
              />
            )}
            <Icon
              size={isActive ? 22 : 20}
              className={isActive ? "stroke-[2.5]" : "stroke-[2]"}
            />
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? "opacity-100" : "opacity-70"}`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

const FAB = ({ setSection }: { setSection: (s: Section) => void }) => (
  <button
    onClick={() => setSection("vendas")}
    className="lg:hidden fixed right-6 bottom-28 w-16 h-16 bg-primary-main text-primary-contrast rounded-2xl shadow-2xl shadow-primary-main/30 flex items-center justify-center z-50 active:scale-90 transition-transform no-print"
  >
    <Plus size={28} />
  </button>
);

const StatCard = ({
  title,
  value,
  icon: Icon,
  colorClass,
  onClick,
  subtitle,
}: {
  title: string;
  value: string;
  icon: any;
  colorClass: string;
  onClick?: () => void;
  subtitle?: string;
}) => (
  <div
    className={`stat-card-gradient ${colorClass} ${onClick ? "cursor-pointer hover:scale-[1.03] hover:-translate-y-1 transition-transform duration-200" : ""}`}
    onClick={onClick}
  >
    <div className="flex justify-between items-start">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-2">
          {title}
        </p>
        <p className="text-2xl sm:text-4xl font-display font-bold tracking-tight">
          {value}
        </p>
        {subtitle && (
          <p className="text-[10px] opacity-70 mt-1 font-semibold">{subtitle}</p>
        )}
      </div>
      <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
        <Icon size={24} className="stroke-[2.5]" />
      </div>
    </div>
    <div className="absolute -right-6 -bottom-6 opacity-10">
      <Icon size={120} />
    </div>
    {onClick && (
      <p className="text-[9px] font-bold uppercase tracking-widest opacity-50 mt-3 flex items-center gap-1">
        Clique para ver <span className="text-base leading-none">›</span>
      </p>
    )}
  </div>
);

// --- Sections ---

const DashboardSection = ({
  sales,
  developments,
  clients,
  onNavigate,
  onViewContract,
}: {
  sales: Venda[];
  developments: Empreendimento[];
  clients: Cliente[];
  onNavigate?: (s: Section) => void;
  onViewContract?: (v: Venda) => void;
}) => {
  const totalRevenue = sales.reduce((acc, sale) => acc + sale.valorLote, 0);
  const totalLotesDisponiveis = developments.reduce(
    (acc, d) => acc + Math.max(0, d.totalLotes - d.lotesVendidos),
    0,
  );

  // Chart Data: Sales per Day (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }).reverse();

  const salesData = last7Days.map((day) => ({
    name: day,
    total: sales.filter(
      (s) =>
        new Date(s.dataVenda).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "short",
        }) === day,
    ).length,
  }));

  // Chart Data: Occupancy per development
  const occupancyData = developments.map((d) => ({
    name: d.nome.split(" ")[0],
    vendidos: d.lotesVendidos,
    total: d.totalLotes,
  }));

  return (
    <div className="space-y-5 sm:space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-2">
        <h3 className="text-xl font-display font-bold text-slate-800 flex items-center gap-3">
          <LayoutDashboard className="text-primary-main" />
          Visão Geral
        </h3>
        <button
          onClick={() => exportToCSV(sales)}
          className="btn-ghost text-xs px-3 sm:px-4 py-2 border-slate-200 self-start sm:self-auto"
        >
          <Download size={14} />
          <span className="hidden sm:inline">Exportar Vendas</span>
          <span className="sm:hidden">Exportar</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
        <StatCard
          title="Vendas"
          value={sales.length.toString()}
          icon={TrendingUp}
          colorClass="bg-gradient-to-br from-primary-main to-primary-accent"
        />
        <StatCard
          title="Faturamento"
          value={new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
            maximumFractionDigits: 0,
          }).format(totalRevenue)}
          icon={DollarSign}
          colorClass="bg-gradient-to-br from-slate-800 to-slate-900"
        />
        <StatCard
          title="Lotes Disponíveis"
          value={totalLotesDisponiveis.toString()}
          icon={LayoutDashboard}
          colorClass="bg-gradient-to-br from-chumbo-base to-chumbo-muted text-primary-contrast"
          onClick={() => onNavigate?.("empreendimentos")}
          subtitle={`em ${developments.length} empreendimento${developments.length !== 1 ? "s" : ""}`}
        />
        <StatCard
          title="Clientes"
          value={clients.length.toString()}
          icon={Users}
          colorClass="bg-gradient-to-br from-primary-main/90 to-primary-accent/80"
          onClick={() => onNavigate?.("clientes")}
          subtitle="cadastrados"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
        <div className="card-premium">
          <div className="flex items-center gap-2 mb-4 sm:mb-8">
            <BarChart3 size={18} className="text-primary-main" />
            <h4 className="font-display font-bold text-slate-800">
              Tendência de Vendas (7 dias)
            </h4>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={salesData}
                margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f1f5f9"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
                />
                <Tooltip
                  cursor={{ fill: "#f8fafc" }}
                  contentStyle={{
                    borderRadius: "16px",
                    border: "none",
                    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                />
                <Bar
                  dataKey="total"
                  fill="#2d5016"
                  radius={[6, 6, 0, 0]}
                  barSize={24}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-premium">
          <div className="flex items-center gap-2 mb-4 sm:mb-8">
            <PieChartIcon size={18} className="text-primary-main" />
            <h4 className="font-display font-bold text-slate-800">
              Ocupação por Loteamento
            </h4>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={occupancyData}
                layout="vertical"
                margin={{ top: 0, right: 30, left: 40, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  stroke="#f1f5f9"
                />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700, fill: "#1e293b" }}
                />
                <Tooltip
                  cursor={{ fill: "transparent" }}
                  contentStyle={{
                    borderRadius: "16px",
                    border: "none",
                    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Bar
                  dataKey="total"
                  fill="#e2e8f0"
                  radius={[0, 4, 4, 0]}
                  barSize={12}
                />
                <Bar
                  dataKey="vendidos"
                  fill="#2d5016"
                  radius={[0, 4, 4, 0]}
                  barSize={12}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card-premium">
        <div className="flex items-center justify-between mb-4 sm:mb-8">
          <h3 className="text-lg lg:text-xl font-display font-bold text-slate-800 flex items-center gap-2">
            <div className="w-1.5 h-6 bg-primary-main rounded-full" />
            Vendas Recentes
          </h3>
          <button
            onClick={() => onNavigate?.("contratos")}
            className="text-sm font-bold text-primary-main hover:underline"
          >
            Ver tudo
          </button>
        </div>

        <div className="overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
          <table className="w-full text-left border-separate border-spacing-y-2">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <th className="pb-3 px-4">Comprador</th>
                <th className="pb-3 px-4">Local</th>
                <th className="pb-3 px-4">Lote</th>
                <th className="pb-3 px-4 text-right">Valor</th>
                <th className="pb-3 px-4 lg:table-cell hidden">Data</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {sales.slice(0, 5).map((venda) => (
                <tr
                  key={venda.id}
                  className="group cursor-pointer"
                  onClick={() => onViewContract?.(venda)}
                >
                  <td className="py-4 px-4 bg-slate-50 group-hover:bg-primary-main/5 rounded-l-2xl transition-colors font-semibold">
                    {venda.clienteNome}
                  </td>
                  <td className="py-4 px-4 bg-slate-50 group-hover:bg-primary-main/5 transition-colors text-slate-500">
                    {venda.empreendimentoNome}
                  </td>
                  <td className="py-4 px-4 bg-slate-50 group-hover:bg-primary-main/5 transition-colors font-mono font-bold text-xs">
                    L:{venda.numeroLote}/Q:{venda.quadra}
                  </td>
                  <td className="py-4 px-4 bg-slate-50 group-hover:bg-primary-main/5 transition-colors text-right font-display font-bold text-primary-main">
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(venda.valorLote)}
                  </td>
                  <td className="py-4 px-4 bg-slate-50 group-hover:bg-primary-main/5 rounded-r-2xl transition-colors text-[10px] font-bold text-slate-400 lg:table-cell hidden">
                    {new Date(venda.dataVenda).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-12 text-center text-slate-300 font-medium italic"
                  >
                    Nenhuma venda registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const LotDashboard = ({
  dev,
  sales,
  clients,
  onStartSale,
  onClose,
  onViewContract,
}: {
  dev: Empreendimento;
  sales: Venda[];
  clients: Cliente[];
  onStartSale: (v: Partial<Venda>) => void;
  onClose: () => void;
  onViewContract: (v: Venda) => void;
}) => {
  const quadras = dev.quadras?.split(",").map((q) => q.trim()) || [];
  const soldLots = sales.filter((s) => s.empreendimentoId === dev.id);
  const [selectedLotSale, setSelectedLotSale] = useState<Venda | null>(null);

  const isSold = (q: string, l: string) => {
    return soldLots.some(
      (s) => s.quadra.toUpperCase() === q.toUpperCase() && s.numeroLote === l,
    );
  };

  const getSale = (q: string, l: string) => {
    return soldLots.find(
      (s) => s.quadra.toUpperCase() === q.toUpperCase() && s.numeroLote === l,
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white w-full max-w-5xl max-h-[90vh] rounded-[32px] shadow-2xl relative overflow-hidden flex flex-col"
      >
        <div className="p-6 sm:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary-main text-white rounded-2xl shadow-lg shadow-primary-main/20">
              <Package size={24} />
            </div>
            <div>
              <h3 className="text-xl font-display font-bold text-slate-800">
                {dev.nome}
              </h3>
              <p className="text-sm text-slate-400 font-medium">
                Dashboard de Ocupação de Lotes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 sm:p-10 space-y-12">
          {quadras.length > 0 ? (
            quadras.map((q) => {
              // 1. Fonte primária: faixa ou lista específica configurada no empreendimento (independente de vendas/vendedor)
              const configuredLots = getLotesDeQuadra(dev.lotesPorQuadra?.[q]);

              // 2. Fallback: lotes que aparecem em lotesInfo para essa quadra
              const lotesInfoKeys = Object.keys(dev.lotesInfo || {})
                .filter((key) => key.startsWith(q.toUpperCase() + "-"))
                .map((key) => key.split("-")[1]);

              // 3. Fallback final: padrão 12 lotes
              const displayLots: string[] = configuredLots.length > 0
                ? configuredLots
                : lotesInfoKeys.length > 0
                  ? lotesInfoKeys.sort((a, b) => Number(a) - Number(b))
                  : Array.from({ length: 12 }, (_, i) => (i + 1).toString());

              return (
                <div key={q} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <h4 className="px-4 py-1.5 bg-slate-900 text-white rounded-lg font-display font-bold text-sm">
                      Quadra {q}
                    </h4>
                    <div className="h-px flex-1 bg-slate-100" />
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                    {displayLots.map((l) => {
                      const soldData = getSale(q, l);
                      const sold = !!soldData;
                      const lotInfo =
                        dev.lotesInfo?.[`${q}-${l}`.toUpperCase()];

                      return (
                        <div
                          key={l}
                          onClick={() => { if (sold && soldData) setSelectedLotSale(soldData); }}
                          className={`group relative p-4 rounded-2xl border aspect-square flex flex-col items-center justify-center transition-all ${
                            sold
                              ? "bg-red-50 border-red-100 text-red-600 cursor-pointer hover:bg-red-100 hover:border-red-200 hover:shadow-lg"
                              : "bg-white border-slate-100 hover:border-primary-main hover:shadow-xl hover:shadow-primary-main/5 text-slate-400"
                          }`}
                        >
                          <span className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-1">
                            Lote
                          </span>
                          <span className="text-lg font-display font-bold leading-none">
                            {l}
                          </span>

                          {sold ? (
                            <div className="mt-2 p-1 bg-red-100 rounded-full text-[8px] font-bold uppercase tracking-widest">
                              Vendido
                            </div>
                          ) : (
                            <button
                              onClick={() =>
                                onStartSale({
                                  empreendimentoId: dev.id,
                                  quadra: q,
                                  numeroLote: l,
                                  rua: lotInfo?.rua,
                                })
                              }
                              className="absolute inset-0 flex items-center justify-center bg-primary-main/90 text-white opacity-0 group-hover:opacity-100 rounded-2xl transition-all font-bold text-[10px] uppercase tracking-widest translate-y-2 group-hover:translate-y-0"
                            >
                              Vender
                            </button>
                          )}

                          {/* Hover Tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-3 bg-slate-900 text-white text-[10px] rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-10 shadow-xl">
                            <p className="font-bold border-b border-white/10 pb-1.5 mb-1.5 uppercase tracking-widest">
                              Detalhes do Lote
                            </p>
                            <p>
                              <span className="text-white/40">Status:</span>{" "}
                              {sold ? "Vendido" : "Disponível"}
                            </p>
                            {lotInfo?.rua && (
                              <p>
                                <span className="text-white/40">Rua:</span>{" "}
                                {lotInfo.rua}
                              </p>
                            )}
                            {soldData && (
                              <p>
                                <span className="text-white/40">Cliente:</span>{" "}
                                {soldData.clienteNome}
                              </p>
                            )}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-20 space-y-4">
              <div className="p-4 bg-slate-50 rounded-full w-fit mx-auto text-slate-300">
                <Info size={32} />
              </div>
              <p className="text-slate-400 font-medium">
                Nenhuma quadra cadastrada para este empreendimento.
              </p>
              <p className="text-xs text-slate-300 max-w-xs mx-auto">
                Tente ler o mapa com a IA para identificar as quadras e lotes
                automaticamente.
              </p>
            </div>
          )}
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-white border border-slate-200" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Disponível
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Vendido — clique para ver cliente
            </span>
          </div>
        </div>

        {/* Client detail overlay — slides in from the right */}
        <AnimatePresence>
          {selectedLotSale && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="absolute inset-0 bg-white z-20 flex flex-col overflow-hidden rounded-[32px]"
            >
              <div className="p-6 sm:p-8 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50">
                <button
                  onClick={() => setSelectedLotSale(null)}
                  className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="flex-1">
                  <h3 className="text-xl font-display font-bold text-slate-800">
                    Quadra {selectedLotSale.quadra} · Lote {selectedLotSale.numeroLote}
                  </h3>
                  <p className="text-sm text-red-400 font-medium">{dev.nome} — Lote Vendido</p>
                </div>
                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full ${
                  selectedLotSale.status === "pago" ? "bg-green-100 text-green-700" :
                  selectedLotSale.status === "cancelado" ? "bg-red-100 text-red-700" :
                  "bg-amber-100 text-amber-700"
                }`}>
                  {selectedLotSale.status === "pago" ? "Pago" : selectedLotSale.status === "cancelado" ? "Cancelado" : "Pendente"}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-5">
                {/* Comprador */}
                <div className="card-premium space-y-4">
                  <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                    <div className="p-2 bg-primary-main/10 rounded-xl text-primary-main">
                      <User size={18} />
                    </div>
                    <h4 className="font-bold text-slate-800">Comprador</h4>
                  </div>
                  <p className="text-lg font-display font-bold text-slate-800">{selectedLotSale.clienteNome}</p>
                  {(() => {
                    const c = clients.find((c) => c.id === selectedLotSale!.clienteId);
                    if (!c) return null;
                    return (
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        {c.cpf && <p><span className="text-slate-400">CPF:</span> <span className="font-medium">{c.cpf}</span></p>}
                        {c.telefone1 && <p><span className="text-slate-400">Tel:</span> <span className="font-medium">{c.telefone1}</span></p>}
                        {c.estadoCivil && <p><span className="text-slate-400">Est. Civil:</span> <span className="font-medium capitalize">{c.estadoCivil}</span></p>}
                        {c.profissao && <p><span className="text-slate-400">Profissão:</span> <span className="font-medium">{c.profissao}</span></p>}
                        {c.endereco && (
                          <p className="col-span-2">
                            <span className="text-slate-400">Endereço:</span>{" "}
                            <span className="font-medium">{c.endereco}{c.numero ? `, ${c.numero}` : ""} — {c.bairro}, {c.cidade}/{c.estado}</span>
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Dados da Venda */}
                <div className="card-premium space-y-4">
                  <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                    <div className="p-2 bg-slate-100 rounded-xl text-slate-600">
                      <FileText size={18} />
                    </div>
                    <h4 className="font-bold text-slate-800">Dados da Venda</h4>
                    <span className="ml-auto text-[10px] font-bold text-slate-400">Nº {selectedLotSale.numeroContrato}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    {selectedLotSale.rua && <p className="col-span-2"><span className="text-slate-400">Rua:</span> <span className="font-medium">{selectedLotSale.rua}</span></p>}
                    <p><span className="text-slate-400">Valor total:</span> <span className="font-bold text-slate-800">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(selectedLotSale.valorLote)}</span></p>
                    <p><span className="text-slate-400">Entrada:</span> <span className="font-medium">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(selectedLotSale.valorEntrada)}</span></p>
                    <p><span className="text-slate-400">Parcelas:</span> <span className="font-medium">{selectedLotSale.quantidadeParcelas}x {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(selectedLotSale.valorParcela)}</span></p>
                    <p><span className="text-slate-400">Vencimento:</span> <span className="font-medium">dia {selectedLotSale.dataVencimento ? new Date(selectedLotSale.dataVencimento + "T12:00:00").getDate() : "—"}</span></p>
                    <p><span className="text-slate-400">Data venda:</span> <span className="font-medium">{selectedLotSale.dataVenda ? new Date(selectedLotSale.dataVenda + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</span></p>
                    {selectedLotSale.vendedor && <p><span className="text-slate-400">Vendedor:</span> <span className="font-medium">{selectedLotSale.vendedor}</span></p>}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 flex justify-between items-center">
                <button
                  onClick={() => setSelectedLotSale(null)}
                  className="btn-secondary px-6 flex items-center gap-2"
                >
                  <ArrowLeft size={16} />
                  Voltar ao Mapa
                </button>
                <button
                  onClick={() => { onViewContract(selectedLotSale!); onClose(); }}
                  className="btn-primary px-8 flex items-center gap-2"
                >
                  <FileText size={16} />
                  Ver Contrato
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

// fix-sales-scope
const EmpreendimentosSection = ({
  developments,
  sales,
  clients,
  onSave,
  onDelete,
  onUpdateLotesInfo,
  onDeleteLot,
  onStartSale,
  onViewContract,
  proprietarios = [],
}: {
  developments: Empreendimento[];
  sales: Venda[];
  clients: Cliente[];
  onSave: (d: Empreendimento) => void;
  onDelete: (id: string) => void;
  onUpdateLotesInfo: (
    id: string,
    info: Record<string, { rua: string; status?: 'disponivel' | 'indisponivel'; desistente?: { clienteId: string; clienteNome: string; dataDesistencia: string } }>,
  ) => void;
  onDeleteLot: (devId: string, key: string) => void;
  onStartSale: (v: Partial<Venda>) => void;
  onViewContract: (v: Venda) => void;
  proprietarios?: Proprietario[];
}) => {
  const emptyForm: Partial<Empreendimento> = {
    nome: "", endereco: "", cidade: "", estado: "", totalLotes: 0,
    descricao: "", comunidade: "", quadras: "", ruas: "", ruasPorQuadra: {}, ruasFaixas: [], lotesPorQuadra: {},
  };
  const [isAdding, setIsAdding] = useState(false);
  const [editingDev, setEditingDev] = useState<Empreendimento | null>(null);
  const [formData, setFormData] = useState<Partial<Empreendimento>>(emptyForm);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const devFormRef = useRef<HTMLFormElement>(null);
  const [selectedDevForMap, setSelectedDevForMap] = useState<Empreendimento | null>(null);
  const [lotRegDev, setLotRegDev] = useState<Empreendimento | null>(null);
  const [lotRegForm, setLotRegForm] = useState({ quadra: "", numeroLote: "", rua: "", status: "disponivel" as "disponivel" | "indisponivel" });
  const [lotRegTab, setLotRegTab] = useState<"cadastrar" | "lotes" | "acoesMassa">("cadastrar");
  const [bulkAvailDev, setBulkAvailDev] = useState<Empreendimento | null>(null);
  const [bulkAvailTab, setBulkAvailTab] = useState<"marcarIndisponiveis" | "marcarDisponiveis">("marcarIndisponiveis");
  const [bulkSelectedQuadras, setBulkSelectedQuadras] = useState<string[]>([]);
  const [bulkLotesEspecificos, setBulkLotesEspecificos] = useState<Record<string, string>>({});
  const { request: requestDelete, Modal: DeleteModal } = useDeleteConfirm();

  const handleSalvarLote = () => {
    if (!lotRegDev || !lotRegForm.quadra || !lotRegForm.numeroLote) {
      alert("Preencha a quadra e o número do lote.");
      return;
    }
    const key = `${lotRegForm.quadra}-${lotRegForm.numeroLote}`.toUpperCase();
    const existing = lotRegDev.lotesInfo?.[key] || {};
    onUpdateLotesInfo(lotRegDev.id, { [key]: { ...existing, rua: lotRegForm.rua, status: lotRegForm.status } });
    setLotRegDev((prev) => {
      if (!prev) return null;
      const existingInfo = prev.lotesInfo?.[key] || {};
      return { ...prev, lotesInfo: { ...(prev.lotesInfo || {}), [key]: { ...existingInfo, rua: lotRegForm.rua, status: lotRegForm.status } } };
    });
    setLotRegForm({ quadra: "", numeroLote: "", rua: "", status: "disponivel" });
    setLotRegTab("lotes");
  };

  const openAddForm = () => {
    setEditingDev(null);
    setFormData(emptyForm);
    setIsAdding(true);
  };

  const openEditForm = (dev: Empreendimento) => {
    setEditingDev(dev);
    setFormData({
      nome: dev.nome, endereco: dev.endereco, cidade: dev.cidade, estado: dev.estado,
      totalLotes: dev.totalLotes, descricao: dev.descricao, comunidade: dev.comunidade,
      quadras: dev.quadras, ruas: dev.ruas,
      ruasPorQuadra: dev.ruasPorQuadra || {},
      ruasFaixas: dev.ruasFaixas || [],
      lotesPorQuadra: dev.lotesPorQuadra || {},
    });
    setIsAdding(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome) {
      triggerShake(devFormRef.current);
      return;
    }
    if (editingDev) {
      onSave({
        ...editingDev,
        ...formData,
      } as Empreendimento);
    } else {
      onSave({
        ...(formData as Empreendimento),
        id: Date.now().toString(),
        lotesVendidos: 0,
        lotesInfo: {},
      });
    }
    setIsAdding(false);
    setEditingDev(null);
    setFormData(emptyForm);
  };

  const handleMapUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    try {
      const result = await geminiService.analyzeMap(file);

      const newLotesInfo: Record<string, { rua: string; status?: 'disponivel' | 'indisponivel'; desistente?: { clienteId: string; clienteNome: string; dataDesistencia: string } }> = {};
      result.lotes.forEach((item: any) => {
        const key = `${item.quadra}-${item.lote}`.toUpperCase();
        newLotesInfo[key] = { rua: item.rua };
      });

      // Update form if we are adding
      setFormData((prev) => ({
        ...prev,
        totalLotes: result.totalLotes || prev.totalLotes,
        ruas: result.ruasEncontradas
          ? result.ruasEncontradas.join(", ")
          : prev.ruas,
        lotesInfo: newLotesInfo,
      }));

      alert(
        `Sucesso! IA identificou ${result.lotes.length} lotes e ${result.ruasEncontradas?.length || 0} ruas no mapa.`,
      );
      setIsAnalyzing(false);
    } catch (err: any) {
      console.error(err);
      alert("Erro ao analisar mapa: " + (err?.message || "Tente novamente."));
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary-main rounded-2xl text-primary-contrast shadow-lg shadow-primary-main/20">
            <Building2 size={24} />
          </div>
          <div>
            <h3 className="text-xl font-display font-bold text-slate-800">
              Empreendimentos
            </h3>
            <p className="text-sm text-slate-400 font-medium">
              Gestão de Loteamentos
            </p>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <label className="btn-ghost flex-1 sm:flex-none relative overflow-hidden cursor-pointer">
            <input
              type="file"
              className="hidden"
              accept="image/*,application/pdf"
              onChange={handleMapUpload}
              disabled={isAnalyzing}
            />
            {isAnalyzing ? (
              <span className="animate-pulse">Analisando Mapa...</span>
            ) : (
              <>
                <FileText size={18} />
                <span>Ler Mapa (PDF/IA)</span>
              </>
            )}
          </label>
          <button
            onClick={() => {
              if (isAdding) { setIsAdding(false); setEditingDev(null); setFormData(emptyForm); }
              else openAddForm();
            }}
            className="btn-primary flex-1 sm:flex-none"
          >
            {isAdding ? <X size={20} /> : <Plus size={20} />}
            <span>{isAdding ? "Cancelar" : "Novo Loteamento"}</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <form
              ref={devFormRef}
              onSubmit={handleSubmit}
              className="card-premium grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50"
            >
              <div className="md:col-span-2">
                <label className="label">Nome do Empreendimento</label>
                <input
                  required
                  className="input-field"
                  value={formData.nome}
                  onChange={(e) =>
                    setFormData({ ...formData, nome: e.target.value })
                  }
                  placeholder="Nome Completo"
                />
              </div>

              <div className="md:col-span-1">
                <label className="label">Cidade</label>
                <input
                  className="input-field"
                  value={formData.cidade}
                  onChange={(e) =>
                    setFormData({ ...formData, cidade: e.target.value })
                  }
                  placeholder="0"
                />
              </div>
              <div className="md:col-span-1">
                <label className="label">Estado</label>
                <input
                  className="input-field font-bold"
                  value={formData.estado}
                  onChange={(e) =>
                    setFormData({ ...formData, estado: e.target.value })
                  }
                  placeholder="0"
                />
              </div>

              <div>
                <label className="label">Comunidade / Região</label>
                <input
                  className="input-field"
                  value={formData.comunidade}
                  onChange={(e) =>
                    setFormData({ ...formData, comunidade: e.target.value })
                  }
                  placeholder="Ex: Centro, Vila Nova"
                />
              </div>
              <div className="md:col-span-2 space-y-4">
                <div>
                  <label className="label">Quadras Disponíveis</label>
                  <input
                    className="input-field"
                    value={formData.quadras}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const quadraList = raw.split(",").map((q) => q.trim()).filter(Boolean);
                      const existing = formData.lotesPorQuadra || {};
                      const newLpq: Record<string, { inicio?: number; fim?: number; especificos?: string }> = {};
                      quadraList.forEach((q) => { newLpq[q] = existing[q] ?? {}; });
                      const soma = Object.values(newLpq).reduce((s, r) => s + getLotesDeQuadra(r).length, 0);
                      setFormData({ ...formData, quadras: raw, lotesPorQuadra: newLpq, totalLotes: soma || formData.totalLotes || 0 });
                    }}
                    placeholder="Ex: A, B, C, D"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Separe por vírgula. O total de lotes será calculado automaticamente abaixo.</p>
                </div>

                {/* Editor de lotes por quadra */}
                {(() => {
                  const quadraList = (formData.quadras || "").split(",").map((q) => q.trim()).filter(Boolean);
                  if (quadraList.length === 0) return null;
                  return (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Lotes por Quadra
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {quadraList.map((q) => {
                          const entry = (formData.lotesPorQuadra || {})[q] ?? {};
                          const isEspecificos = entry.especificos !== undefined;
                          const count = getLotesDeQuadra(entry).length;
                          const recalc = (updated: Record<string, { inicio?: number; fim?: number; especificos?: string }>) => {
                            const soma = Object.values(updated).reduce((s, r) => s + getLotesDeQuadra(r).length, 0);
                            setFormData({ ...formData, lotesPorQuadra: updated, totalLotes: soma });
                          };
                          return (
                            <div key={q} className="flex flex-col gap-2 bg-slate-50 border border-slate-100 rounded-xl p-3">
                              <div className="flex items-center justify-between">
                                <label className="text-[9px] font-black uppercase tracking-widest text-primary-main">
                                  Quadra {q}
                                </label>
                                {count > 0 && (
                                  <span className="text-[9px] font-bold bg-primary-main/10 text-primary-main rounded-md px-1.5 py-0.5">
                                    {count} lotes
                                  </span>
                                )}
                              </div>

                              {/* Toggle: Faixa / Específicos */}
                              <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[9px] font-bold">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const { especificos: _, ...rest } = entry;
                                    const updated = { ...(formData.lotesPorQuadra || {}), [q]: rest };
                                    recalc(updated);
                                  }}
                                  className={`flex-1 py-1 transition-colors ${!isEspecificos ? "bg-primary-main text-white" : "text-slate-400 hover:bg-slate-100"}`}
                                >
                                  Faixa
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = { ...(formData.lotesPorQuadra || {}), [q]: { especificos: entry.especificos ?? "" } };
                                    recalc(updated);
                                  }}
                                  className={`flex-1 py-1 transition-colors ${isEspecificos ? "bg-primary-main text-white" : "text-slate-400 hover:bg-slate-100"}`}
                                >
                                  Específicos
                                </button>
                              </div>

                              {isEspecificos ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[8px] text-slate-400 font-bold uppercase">Lotes disponíveis (separados por vírgula)</span>
                                  <input
                                    type="text"
                                    className="input-field text-sm font-bold w-full py-1.5"
                                    placeholder="Ex: 1, 2, 6, 10, 15"
                                    value={entry.especificos ?? ""}
                                    onChange={(e) => {
                                      const updated = { ...(formData.lotesPorQuadra || {}), [q]: { especificos: e.target.value } };
                                      recalc(updated);
                                    }}
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <div className="flex flex-col gap-0.5 flex-1">
                                    <span className="text-[8px] text-slate-400 font-bold uppercase">De</span>
                                    <input
                                      type="number"
                                      min={1}
                                      className="input-field text-sm font-bold w-full py-1.5"
                                      placeholder="1"
                                      value={entry.inicio ?? ""}
                                      onChange={(e) => {
                                        const val = Number(e.target.value) || 1;
                                        const updated = { ...(formData.lotesPorQuadra || {}), [q]: { ...entry, inicio: val } };
                                        recalc(updated);
                                      }}
                                    />
                                  </div>
                                  <span className="text-slate-300 font-bold mt-4">—</span>
                                  <div className="flex flex-col gap-0.5 flex-1">
                                    <span className="text-[8px] text-slate-400 font-bold uppercase">Até</span>
                                    <input
                                      type="number"
                                      min={1}
                                      className="input-field text-sm font-bold w-full py-1.5"
                                      placeholder="20"
                                      value={entry.fim ?? ""}
                                      onChange={(e) => {
                                        const val = Number(e.target.value) || 0;
                                        const updated = { ...(formData.lotesPorQuadra || {}), [q]: { ...entry, fim: val } };
                                        recalc(updated);
                                      }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs font-bold text-slate-500 pt-1">
                        Total calculado:{" "}
                        <span className="text-primary-main">
                          {Object.values(formData.lotesPorQuadra || {}).reduce((s, r) => s + getLotesDeQuadra(r).length, 0)} lotes
                        </span>
                      </p>
                    </div>
                  );
                })()}

                {/* Faixas de Rua por Lote */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Faixas de Rua por Lote
                      </p>
                      <p className="text-[10px] text-slate-300 normal-case font-normal mt-0.5">
                        Ex: Q1 lotes 1–4 → Rua Principal · Q1 lotes 5–8 → Rua Amparo
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          ruasFaixas: [
                            ...(formData.ruasFaixas || []),
                            { quadra: formData.quadras?.split(",")[0]?.trim() || "", loteInicio: 1, loteFim: 4, rua: "" },
                          ],
                        })
                      }
                      className="flex items-center gap-1 text-[10px] font-bold text-primary-main hover:underline shrink-0"
                    >
                      <Plus size={11} /> Adicionar faixa
                    </button>
                  </div>
                  {(formData.ruasFaixas || []).length === 0 && (
                    <p className="text-[10px] text-slate-300 italic py-2">
                      Nenhuma faixa definida. Clique em "Adicionar faixa" para mapear ruas por lote.
                    </p>
                  )}
                  {(formData.ruasFaixas || []).map((faixa, idx) => (
                    <div key={idx} className="flex flex-wrap items-end gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Quadra</label>
                        <input
                          list="faixa-quadras-list"
                          className="input-field text-xs w-16 font-bold"
                          placeholder="A"
                          value={faixa.quadra}
                          onChange={(e) => {
                            const updated = [...(formData.ruasFaixas || [])];
                            updated[idx] = { ...faixa, quadra: e.target.value };
                            setFormData({ ...formData, ruasFaixas: updated });
                          }}
                        />
                        <datalist id="faixa-quadras-list">
                          {formData.quadras?.split(",").map((q) => <option key={q.trim()} value={q.trim()} />)}
                        </datalist>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Lote início</label>
                        <input
                          type="number"
                          min={1}
                          className="input-field text-xs w-20"
                          placeholder="1"
                          value={faixa.loteInicio || ""}
                          onChange={(e) => {
                            const updated = [...(formData.ruasFaixas || [])];
                            updated[idx] = { ...faixa, loteInicio: Number(e.target.value) };
                            setFormData({ ...formData, ruasFaixas: updated });
                          }}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Lote fim</label>
                        <input
                          type="number"
                          min={1}
                          className="input-field text-xs w-20"
                          placeholder="4"
                          value={faixa.loteFim || ""}
                          onChange={(e) => {
                            const updated = [...(formData.ruasFaixas || [])];
                            updated[idx] = { ...faixa, loteFim: Number(e.target.value) };
                            setFormData({ ...formData, ruasFaixas: updated });
                          }}
                        />
                      </div>
                      <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
                        <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Rua / Acesso</label>
                        <input
                          className="input-field text-xs"
                          placeholder="Ex: Rua Principal"
                          value={faixa.rua}
                          onChange={(e) => {
                            const updated = [...(formData.ruasFaixas || [])];
                            updated[idx] = { ...faixa, rua: e.target.value };
                            setFormData({ ...formData, ruasFaixas: updated });
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (formData.ruasFaixas || []).filter((_, i) => i !== idx);
                          setFormData({ ...formData, ruasFaixas: updated });
                        }}
                        className="p-2 hover:bg-red-50 text-red-400 rounded-lg transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Total de Lotes</label>
                {(formData.quadras || "").split(",").map(q => q.trim()).filter(Boolean).length > 0 ? (
                  <div className="input-field font-bold bg-slate-100 cursor-not-allowed flex items-center justify-between">
                    <span className="text-primary-main">{formData.totalLotes}</span>
                    <span className="text-[10px] text-slate-400 font-normal">calculado automaticamente</span>
                  </div>
                ) : (
                  <input
                    type="number"
                    className="input-field font-bold"
                    value={formData.totalLotes}
                    onChange={(e) =>
                      setFormData({ ...formData, totalLotes: Number(e.target.value) })
                    }
                  />
                )}
              </div>

              <div className="md:col-span-2 flex justify-between items-center pt-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {editingDev ? `Editando: ${editingDev.nome}` : "Novo Loteamento"}
                </p>
                <button
                  type="submit"
                  className="btn-primary w-full sm:w-auto px-12"
                >
                  {editingDev ? "Salvar Alterações" : "Criar Empreendimento"}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {developments.map((dev) => (
          <motion.div
            layout
            key={dev.id}
            whileHover={{ scale: 1.01, translateY: -4 }}
            className="card-premium flex flex-col group relative overflow-hidden"
          >

            <div className="mb-6 flex items-center gap-4">
              <div className="p-4 bg-slate-50 text-primary-main rounded-2xl group-hover:bg-primary-main group-hover:text-primary-contrast transition-colors duration-300">
                <Building2 size={24} className="stroke-[2.5]" />
              </div>
              <div>
                <h4 className="text-xl font-display font-bold text-slate-800 leading-tight">
                  {dev.nome}
                </h4>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider">
                  <MapPin size={12} className="text-primary-light" />
                  {dev.cidade} • {dev.estado}
                </div>
              </div>
            </div>

            <div className="mb-4 px-1">
              {dev.comunidade && (
                <p className="text-[10px] font-bold text-primary-main uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-main" />
                  {dev.comunidade}
                </p>
              )}
              {dev.ruasFaixas && dev.ruasFaixas.length > 0 ? (
                <div className="mb-1 space-y-0.5">
                  {dev.ruasFaixas.slice(0, 3).map((f, i) => (
                    <p key={i} className="text-xs text-slate-500 line-clamp-1">
                      <span className="font-bold text-slate-700">Q.{f.quadra} ({f.loteInicio}–{f.loteFim}):</span>{" "}{f.rua}
                    </p>
                  ))}
                  {dev.ruasFaixas.length > 3 && (
                    <p className="text-[10px] text-slate-400">+{dev.ruasFaixas.length - 3} faixas</p>
                  )}
                </div>
              ) : dev.ruasPorQuadra && Object.keys(dev.ruasPorQuadra).length > 0 ? (
                <div className="mb-1">
                  {Object.entries(dev.ruasPorQuadra).slice(0, 2).map(([q, ruas]) => ruas ? (
                    <p key={q} className="text-xs text-slate-500 line-clamp-1">
                      <span className="font-bold text-slate-700">Q.{q}:</span>{" "}{ruas}
                    </p>
                  ) : null)}
                </div>
              ) : dev.ruas ? (
                <p className="text-xs text-slate-500 line-clamp-1 mb-1">
                  <span className="font-bold text-slate-700">Ruas:</span>{" "}{dev.ruas}
                </p>
              ) : null}
              {dev.quadras && (
                dev.lotesPorQuadra && Object.values(dev.lotesPorQuadra).some((r) => getLotesDeQuadra(r).length > 0) ? (
                  <div className="mt-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Lotes por quadra</p>
                    <div className="flex flex-wrap gap-1">
                      {dev.quadras.split(",").map((q) => q.trim()).filter(Boolean).map((q) => {
                        const entry = dev.lotesPorQuadra?.[q];
                        const lotes = getLotesDeQuadra(entry);
                        if (lotes.length === 0) return null;
                        const label = entry?.especificos !== undefined
                          ? `${lotes.length} espec.`
                          : `${entry?.inicio}–${entry?.fim}`;
                        return (
                          <span key={q} className="inline-flex items-center gap-1 text-[10px] font-bold bg-primary-main/8 text-primary-main rounded-lg px-2 py-0.5">
                            Q.{q} <span className="font-black">{label}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 line-clamp-1">
                    <span className="font-bold text-slate-700">Quadras:</span>{" "}
                    {dev.quadras}
                  </p>
                )
              )}
            </div>


            <div className="mt-auto space-y-5 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
              {/* Warning: quadras sem faixa configurada */}
              {(() => {
                const quadraList = (dev.quadras || "").split(",").map(q => q.trim()).filter(Boolean);
                const semFaixa = quadraList.filter(q => getLotesDeQuadra(dev.lotesPorQuadra?.[q]).length === 0);
                const somaQuadras = quadraList.reduce((s, q) => s + getLotesDeQuadra(dev.lotesPorQuadra?.[q]).length, 0);
                const diffTotal = quadraList.length > 0 && somaQuadras > 0 && somaQuadras !== dev.totalLotes;
                if (semFaixa.length === 0 && !diffTotal) return null;
                return (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <AlertCircle size={15} className="text-amber-500 mt-0.5 shrink-0" />
                    <div className="text-[11px] font-bold text-amber-700 space-y-0.5">
                      {semFaixa.length > 0 && (
                        <p>⚠️ Quadra{semFaixa.length > 1 ? 's' : ''} sem lotes configurados: <span className="font-black">{semFaixa.map(q => `Q.${q}`).join(', ')}</span></p>
                      )}
                      {diffTotal && (
                        <p>⚠️ Total configurado ({somaQuadras}) difere do total cadastrado ({dev.totalLotes}). Confira as faixas.</p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Métricas: Vendidos / Disponíveis / Total */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white rounded-xl p-2.5 border border-slate-100">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Vendidos</p>
                  <p className="text-lg font-display font-bold text-slate-800">{dev.lotesVendidos}</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-2.5 border border-emerald-100">
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-0.5">Disponíveis</p>
                  <p className="text-lg font-display font-bold text-emerald-700">{Math.max(0, dev.totalLotes - dev.lotesVendidos)}</p>
                </div>
                <div className="bg-white rounded-xl p-2.5 border border-slate-100">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Total</p>
                  <p className="text-lg font-display font-bold text-slate-800">{dev.totalLotes}</p>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <span>Progresso de vendas</span>
                  <span className="text-primary-main">{dev.totalLotes > 0 ? Math.round((dev.lotesVendidos / dev.totalLotes) * 100) : 0}%</span>
                </div>
                <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${dev.totalLotes > 0 ? (dev.lotesVendidos / dev.totalLotes) * 100 : 0}%` }}
                    className="bg-primary-main h-full rounded-full shadow-[0_0_8px_rgba(45,80,22,0.3)]"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-widest pt-2 border-t border-slate-100">
                <span className="text-slate-400">Dados do Mapa:</span>
                <span className="text-primary-main">
                  {Object.keys(dev.lotesInfo || {}).length} lotes mapeados
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSelectedDevForMap(dev)}
                  className="flex items-center justify-center gap-2 py-3 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-primary-main transition-colors shadow-lg shadow-slate-900/10"
                >
                  <MapPin size={14} />
                  <span>Ver Mapa</span>
                </button>
                <button
                  onClick={() => { setLotRegDev(dev); setLotRegForm({ quadra: "", numeroLote: "", rua: "", status: "disponivel" }); setLotRegTab("cadastrar"); setBulkAvailTab("marcarIndisponiveis"); setBulkSelectedQuadras([]); setBulkLotesEspecificos({}); }}
                  className="flex items-center justify-center gap-2 py-3 bg-primary-main/10 text-primary-main rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-primary-main hover:text-white transition-colors"
                >
                  <Settings size={14} />
                  <span>Gerenciar Lotes</span>
                </button>
                <button
                  onClick={() => openEditForm(dev)}
                  className="flex items-center justify-center gap-2 py-3 bg-blue-50 text-blue-600 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-colors"
                >
                  <Pencil size={14} />
                  <span>Editar</span>
                </button>
                <button
                  onClick={() => requestDelete(`Excluir o empreendimento "${dev.nome}"? Esta ação não pode ser desfeita.`, () => onDelete(dev.id))}
                  className="flex items-center justify-center gap-2 py-3 bg-red-50 text-red-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-red-500 hover:text-white transition-colors"
                >
                  <Trash2 size={14} />
                  <span>Excluir</span>
                </button>
              </div>
            </div>
          </motion.div>
        ))}
        {developments.length === 0 && !isAdding && (
          <div className="col-span-full py-20 text-center flex flex-col items-center gap-4 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
            <div className="p-4 bg-surface-card rounded-full text-slate-300 shadow-sm">
              <Building2 size={48} strokeWidth={1} />
            </div>
            <p className="text-slate-400 font-medium italic">
              Sua base de empreendimentos está vazia.
            </p>
            <button
              onClick={() => setIsAdding(true)}
              className="btn-ghost text-sm mt-2 font-bold px-8"
            >
              Adicionar Primeiro Loteamento
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedDevForMap && (
          <LotDashboard
            dev={selectedDevForMap}
            sales={sales}
            clients={clients}
            onStartSale={(v) => {
              onStartSale(v);
              setSelectedDevForMap(null);
            }}
            onClose={() => setSelectedDevForMap(null)}
            onViewContract={onViewContract}
          />
        )}
      </AnimatePresence>

      {/* Modal: Cadastrar / Gerenciar Lotes */}
      <AnimatePresence>
        {lotRegDev && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-[28px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary-main rounded-xl text-primary-contrast">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-bold text-slate-800">Lotes do Empreendimento</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{lotRegDev.nome}</p>
                  </div>
                </div>
                <button onClick={() => setLotRegDev(null)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-100 overflow-x-auto">
                <button
                  onClick={() => setLotRegTab("cadastrar")}
                  className={`shrink-0 flex-1 flex items-center justify-center gap-1.5 py-3 text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-colors whitespace-nowrap px-3 ${
                    lotRegTab === "cadastrar"
                      ? "text-primary-main border-b-2 border-primary-main"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <Plus size={13} />
                  {lotRegForm.quadra && lotRegForm.numeroLote && lotRegDev.lotesInfo?.[`${lotRegForm.quadra}-${lotRegForm.numeroLote}`.toUpperCase()]
                    ? "Editar Lote"
                    : "Cadastrar"}
                </button>
                <button
                  onClick={() => setLotRegTab("lotes")}
                  className={`shrink-0 flex-1 flex items-center justify-center gap-1.5 py-3 text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-colors whitespace-nowrap px-3 ${
                    lotRegTab === "lotes"
                      ? "text-primary-main border-b-2 border-primary-main"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <List size={13} />
                  Lotes
                  {Object.keys(lotRegDev.lotesInfo || {}).length > 0 && (
                    <span className="bg-slate-100 text-slate-600 text-[9px] font-black px-1.5 py-0.5 rounded-full">
                      {Object.keys(lotRegDev.lotesInfo || {}).length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => { setLotRegTab("acoesMassa"); setBulkAvailTab("marcarIndisponiveis"); setBulkSelectedQuadras([]); setBulkLotesEspecificos({}); }}
                  className={`shrink-0 flex-1 flex items-center justify-center gap-1.5 py-3 text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-colors whitespace-nowrap px-3 ${
                    lotRegTab === "acoesMassa"
                      ? "text-slate-700 border-b-2 border-slate-700"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <Settings size={13} />
                  <span className="hidden sm:inline">Ações em Massa</span>
                  <span className="sm:hidden">Em Massa</span>
                </button>
              </div>

              {/* Tab: Cadastrar */}
              {lotRegTab === "cadastrar" && (
                <>
                  <div className="p-6 space-y-4 overflow-y-auto flex-1">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label">Quadra *</label>
                        <input
                          list="lot-reg-quadras"
                          className="input-field"
                          placeholder="Ex: A"
                          value={lotRegForm.quadra}
                          onChange={(e) => setLotRegForm({ ...lotRegForm, quadra: e.target.value, rua: "" })}
                        />
                        <datalist id="lot-reg-quadras">
                          {lotRegDev.quadras?.split(",").map((q) => (
                            <option key={q.trim()} value={q.trim()} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <label className="label">Nº do Lote *</label>
                        <input
                          className="input-field"
                          placeholder="Ex: 01"
                          value={lotRegForm.numeroLote}
                          onChange={(e) => setLotRegForm({ ...lotRegForm, numeroLote: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      {(() => {
                        const quadra = lotRegForm.quadra.trim();
                        const sugestoes = quadra ? getRuasSugeridas(lotRegDev, quadra, lotRegForm.numeroLote) : [];
                        const exactRua = quadra && lotRegForm.numeroLote ? getRuaSugerida(lotRegDev, quadra, lotRegForm.numeroLote) : null;
                        return (
                          <>
                            <label className="label flex items-center gap-2">
                              Rua / Acesso do Lote
                              {sugestoes.length > 0 && (
                                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full normal-case">
                                  {sugestoes.length} sugestão(ões)
                                </span>
                              )}
                            </label>
                            <input
                              list="lot-reg-ruas"
                              className="input-field"
                              placeholder={sugestoes.length > 0 ? `Ex: ${sugestoes[0]}` : "Nome da rua ou acesso"}
                              value={lotRegForm.rua}
                              onChange={(e) => setLotRegForm({ ...lotRegForm, rua: e.target.value })}
                            />
                            {sugestoes.length > 0 && (
                              <datalist id="lot-reg-ruas">
                                {sugestoes.map((r) => <option key={r} value={r} />)}
                              </datalist>
                            )}
                            {sugestoes.length > 0 && (
                              <p className="text-[10px] text-slate-400 mt-1">Sugestões para Q.{quadra}: {sugestoes.join(", ")}</p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    {lotRegForm.quadra && lotRegForm.numeroLote && (
                      <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-500">
                        <span className="font-bold text-slate-700">Chave:</span>{" "}
                        {`${lotRegForm.quadra}-${lotRegForm.numeroLote}`.toUpperCase()}
                        {lotRegDev.lotesInfo?.[`${lotRegForm.quadra}-${lotRegForm.numeroLote}`.toUpperCase()] && (
                          <span className="ml-2 text-amber-600 font-bold">⚠ Será atualizado</span>
                        )}
                      </div>
                    )}
                    <div>
                      <label className="label">Disponibilidade</label>
                      <div className="flex rounded-xl overflow-hidden border border-slate-200 w-fit text-sm font-bold">
                        <button
                          type="button"
                          onClick={() => setLotRegForm({ ...lotRegForm, status: "disponivel" })}
                          className={`px-5 py-2.5 flex items-center gap-2 transition-colors ${lotRegForm.status === "disponivel" ? "bg-emerald-500 text-white" : "text-slate-500 hover:bg-slate-50"}`}
                        >
                          <Check size={14} />
                          Disponível
                        </button>
                        <button
                          type="button"
                          onClick={() => setLotRegForm({ ...lotRegForm, status: "indisponivel" })}
                          className={`px-5 py-2.5 flex items-center gap-2 transition-colors ${lotRegForm.status === "indisponivel" ? "bg-slate-700 text-white" : "text-slate-500 hover:bg-slate-50"}`}
                        >
                          <X size={14} />
                          Indisponível
                        </button>
                      </div>
                      {lotRegForm.status === "indisponivel" && (
                        <p className="text-[10px] text-slate-400 mt-2">Este lote não aparecerá como disponível para venda no dashboard.</p>
                      )}
                    </div>
                  </div>
                  <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
                    <button onClick={() => setLotRegDev(null)} className="btn-secondary px-6">Cancelar</button>
                    <button onClick={handleSalvarLote} className="btn-primary px-8">Salvar Lote</button>
                  </div>
                </>
              )}

              {/* Tab: Lotes Registrados */}
              {lotRegTab === "lotes" && (
                <>
                  <div className="flex-1 overflow-y-auto">
                    {Object.keys(lotRegDev.lotesInfo || {}).length === 0 ? (
                      <div className="p-10 text-center text-slate-400 space-y-2">
                        <MapPin size={32} className="mx-auto opacity-30" />
                        <p className="font-medium text-sm">Nenhum lote cadastrado ainda.</p>
                        <button onClick={() => setLotRegTab("cadastrar")} className="text-xs text-primary-main font-bold underline">
                          Cadastrar primeiro lote
                        </button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[380px]">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Quadra</th>
                            <th className="text-left px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Lote</th>
                            <th className="text-left px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                            <th className="text-left px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Comprador</th>
                            <th className="px-3 py-3" />
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(lotRegDev.lotesInfo || {})
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([key, info]) => {
                              const [quadra, ...loteParts] = key.split("-");
                              const lote = loteParts.join("-");
                              const venda = sales.find(
                                (s) => s.empreendimentoId === lotRegDev.id &&
                                  s.quadra.toUpperCase() === quadra &&
                                  s.numeroLote === lote
                              );
                              const isIndisponivel = info.status === "indisponivel";
                              const temDesistente = !!(info as any).desistente;
                              return (
                                <tr key={key} className={`border-t border-slate-50 transition-colors ${isIndisponivel ? "bg-slate-50/60" : "hover:bg-slate-50/50"}`}>
                                  <td className="px-4 py-3">
                                    <span className="font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-xs">{quadra}</span>
                                  </td>
                                  <td className="px-4 py-3 font-bold text-slate-800">{lote}</td>
                                  <td className="px-4 py-3">
                                    {venda ? (
                                      <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Vendido</span>
                                    ) : isIndisponivel ? (
                                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Indisponível</span>
                                    ) : (
                                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Disponível</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-xs max-w-[130px]">
                                    {venda ? (
                                      <span className="text-red-600 font-bold flex items-center gap-1 truncate">
                                        <User size={11} />
                                        {venda.clienteNome.split(" ")[0]}
                                      </span>
                                    ) : temDesistente ? (
                                      <div>
                                        <span className="text-amber-600 font-bold flex items-center gap-1 truncate">
                                          <AlertCircle size={11} />
                                          {(info as any).desistente.clienteNome.split(" ")[0]}
                                        </span>
                                        <span className="text-[9px] text-slate-400">Desistente</span>
                                      </div>
                                    ) : (
                                      <span className="text-slate-300 italic text-[10px]">—</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center justify-end gap-1">
                                      {/* Botão editar */}
                                      <button
                                        onClick={() => {
                                          setLotRegForm({ quadra, numeroLote: lote, rua: info.rua || "", status: (info.status as any) || "disponivel" });
                                          setLotRegTab("cadastrar");
                                        }}
                                        className="p-1.5 hover:bg-primary-main/10 text-primary-main rounded-lg transition-colors"
                                        title="Editar lote"
                                      >
                                        <Pencil size={13} />
                                      </button>
                                      {/* Botão alternar disponibilidade (só sem venda ativa) */}
                                      {!venda && (
                                        <button
                                          onClick={() => {
                                            const novoStatus = isIndisponivel ? "disponivel" : "indisponivel";
                                            onUpdateLotesInfo(lotRegDev.id, { [key]: { ...(info as any), status: novoStatus } });
                                            setLotRegDev((prev) => {
                                              if (!prev) return null;
                                              return { ...prev, lotesInfo: { ...(prev.lotesInfo || {}), [key]: { ...(info as any), status: novoStatus } } };
                                            });
                                          }}
                                          className={`p-1.5 rounded-lg transition-colors ${isIndisponivel ? "hover:bg-emerald-50 text-emerald-500" : "hover:bg-slate-100 text-slate-400"}`}
                                          title={isIndisponivel ? "Marcar como disponível" : "Marcar como indisponível"}
                                        >
                                          {isIndisponivel ? <Check size={13} /> : <X size={13} />}
                                        </button>
                                      )}
                                      {/* Botão desistência — desvincular cliente mantendo histórico */}
                                      {venda && (
                                        <button
                                          onClick={() => {
                                            requestDelete(
                                              `Desvincular ${venda.clienteNome} do lote ${key}? A venda será cancelada e o lote ficará disponível. O cliente permanece no sistema.`,
                                              () => {
                                                // Salva desistente no lotesInfo
                                                const infoAtualizada = {
                                                  ...(info as any),
                                                  status: "disponivel",
                                                  desistente: {
                                                    clienteId: venda.clienteId,
                                                    clienteNome: venda.clienteNome,
                                                    dataDesistencia: new Date().toISOString().split("T")[0],
                                                  }
                                                };
                                                onUpdateLotesInfo(lotRegDev.id, { [key]: infoAtualizada });
                                                setLotRegDev((prev) => {
                                                  if (!prev) return null;
                                                  return { ...prev, lotesInfo: { ...(prev.lotesInfo || {}), [key]: infoAtualizada } };
                                                });
                                                // Cancela a venda (status cancelado)
                                                const updatedSales = sales.map((s) => s.id === venda.id ? { ...s, status: "cancelado" as const } : s);
                                                // Chama update via prop — acessa window temporariamente
                                                (window as any).__onCancelVenda?.(venda.id);
                                              }
                                            );
                                          }}
                                          className="p-1.5 hover:bg-amber-50 text-amber-500 rounded-lg transition-colors"
                                          title="Desvincular cliente do lote (lote ficará disponível)"
                                        >
                                          <ArrowLeft size={13} />
                                        </button>
                                      )}
                                      {/* Limpar histórico de desistente */}
                                      {temDesistente && !venda && (
                                        <button
                                          onClick={() => {
                                            const infoAtualizada = { ...(info as any) };
                                            delete infoAtualizada.desistente;
                                            onUpdateLotesInfo(lotRegDev.id, { [key]: infoAtualizada });
                                            setLotRegDev((prev) => {
                                              if (!prev) return null;
                                              return { ...prev, lotesInfo: { ...(prev.lotesInfo || {}), [key]: infoAtualizada } };
                                            });
                                          }}
                                          className="p-1.5 hover:bg-slate-100 text-slate-300 rounded-lg transition-colors"
                                          title="Limpar histórico de desistência"
                                        >
                                          <RefreshCw size={13} />
                                        </button>
                                      )}
                                      {/* Botão remover (só sem venda e sem desistente) */}
                                      {!venda && !temDesistente && (
                                        <button
                                          onClick={() => {
                                            requestDelete(`Remover lote ${key}?`, () => {
                                              onDeleteLot(lotRegDev.id, key);
                                              setLotRegDev((prev) => {
                                                if (!prev) return null;
                                                const newInfo = { ...(prev.lotesInfo || {}) };
                                                delete newInfo[key];
                                                return { ...prev, lotesInfo: newInfo };
                                              });
                                            });
                                          }}
                                          className="p-1.5 hover:bg-red-50 text-red-400 rounded-lg transition-colors"
                                          title="Remover lote"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                      </div>
                    )}
                  </div>
                  <div className="p-4 border-t border-slate-100 flex justify-between items-center">
                    <p className="text-[10px] text-slate-400">Lotes com comprador não podem ser removidos.</p>
                    <button
                      onClick={() => { setLotRegForm({ quadra: "", numeroLote: "", rua: "", status: "disponivel" }); setLotRegTab("cadastrar"); }}
                      className="btn-primary px-5 py-2 text-xs flex items-center gap-2"
                    >
                      <Plus size={13} />
                      Novo Lote
                    </button>
                  </div>
                </>
              )}

              {/* Tab: Ações em Massa */}
              {lotRegTab === "acoesMassa" && (
                <>
                  <div className="flex border-b border-slate-100 overflow-x-auto px-4 sm:px-6 pt-4 gap-3 sm:gap-4">
                    <button
                      onClick={() => { setBulkAvailTab("marcarIndisponiveis"); setBulkSelectedQuadras([]); setBulkLotesEspecificos({}); }}
                      className={`shrink-0 pb-3 text-[10px] sm:text-xs font-bold uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap ${bulkAvailTab === "marcarIndisponiveis" ? "text-slate-700 border-slate-700" : "text-slate-400 border-transparent hover:text-slate-600"}`}
                    >
                      <span className="flex items-center gap-1.5"><X size={13} /><span className="hidden sm:inline">Marcar </span>Indisponíveis</span>
                    </button>
                    <button
                      onClick={() => { setBulkAvailTab("marcarDisponiveis"); setBulkSelectedQuadras([]); setBulkLotesEspecificos({}); }}
                      className={`shrink-0 pb-3 text-[10px] sm:text-xs font-bold uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap ${bulkAvailTab === "marcarDisponiveis" ? "text-emerald-600 border-emerald-500" : "text-slate-400 border-transparent hover:text-slate-600"}`}
                    >
                      <span className="flex items-center gap-1.5"><Check size={13} /><span className="hidden sm:inline">Definir </span>Disponíveis</span>
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {(() => {
                      const quadraList = (lotRegDev.quadras || "").split(",").map(q => q.trim()).filter(Boolean);
                      if (quadraList.length === 0) {
                        return <p className="text-slate-400 text-sm text-center py-8">Nenhuma quadra configurada neste empreendimento.</p>;
                      }
                      if (bulkAvailTab === "marcarIndisponiveis") {
                        return (
                          <div className="space-y-4">
                            <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-200">
                              <p className="font-bold text-slate-700 mb-1">⚠️ Atenção</p>
                              <p>Todos os lotes das quadras selecionadas serão marcados como <span className="font-bold text-slate-700">indisponíveis</span>. Lotes com venda ativa não serão alterados.</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Selecionar Quadras</p>
                              <div className="flex flex-wrap gap-2 mb-3">
                                <button
                                  onClick={() => setBulkSelectedQuadras(quadraList.length === bulkSelectedQuadras.length ? [] : [...quadraList])}
                                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${bulkSelectedQuadras.length === quadraList.length ? "bg-slate-700 text-white border-slate-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                                >
                                  {bulkSelectedQuadras.length === quadraList.length ? "Desmarcar todas" : "Todas as quadras"}
                                </button>
                              </div>
                              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                {quadraList.map(q => {
                                  const isSelected = bulkSelectedQuadras.includes(q);
                                  const lotes = getLotesDeQuadra(lotRegDev.lotesPorQuadra?.[q]);
                                  return (
                                    <button
                                      key={q}
                                      onClick={() => setBulkSelectedQuadras(prev => isSelected ? prev.filter(x => x !== q) : [...prev, q])}
                                      className={`flex flex-col items-center gap-0.5 px-3 py-3 rounded-xl border-2 text-xs font-bold transition-all ${isSelected ? "bg-slate-700 text-white border-slate-700 shadow-md" : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"}`}
                                    >
                                      <span>Q.{q}</span>
                                      {lotes.length > 0 && <span className={`text-[9px] font-bold ${isSelected ? "text-slate-300" : "text-slate-400"}`}>{lotes.length} lotes</span>}
                                    </button>
                                  );
                                })}
                              </div>
                              {bulkSelectedQuadras.length > 0 && (
                                <p className="mt-3 text-xs text-slate-500 font-medium">
                                  {bulkSelectedQuadras.length} quadra{bulkSelectedQuadras.length > 1 ? "s" : ""} selecionada{bulkSelectedQuadras.length > 1 ? "s" : ""} → todos os lotes disponíveis serão bloqueados.
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className="space-y-4">
                          <div className="p-3 bg-emerald-50 rounded-xl text-xs text-emerald-700 border border-emerald-200">
                            <p className="font-bold mb-1">ℹ️ Como funciona</p>
                            <p>Para cada quadra selecionada, informe os lotes que ficam <span className="font-bold">disponíveis</span> (separados por vírgula). Os demais lotes da quadra serão marcados como <span className="font-bold">indisponíveis</span>.</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Quadras</p>
                            <div className="space-y-3">
                              {quadraList.map(q => {
                                const isSelected = bulkSelectedQuadras.includes(q);
                                const lotes = getLotesDeQuadra(lotRegDev.lotesPorQuadra?.[q]);
                                return (
                                  <div key={q} className={`rounded-xl border-2 overflow-hidden transition-all ${isSelected ? "border-emerald-300" : "border-slate-100"}`}>
                                    <button
                                      onClick={() => setBulkSelectedQuadras(prev => isSelected ? prev.filter(x => x !== q) : [...prev, q])}
                                      className={`w-full flex items-center justify-between px-4 py-3 text-xs font-bold transition-colors ${isSelected ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`}
                                    >
                                      <span className="flex items-center gap-2">
                                        <span className={`w-4 h-4 rounded flex items-center justify-center border-2 transition-all ${isSelected ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300"}`}>
                                          {isSelected && <Check size={10} />}
                                        </span>
                                        Quadra {q}
                                      </span>
                                      {lotes.length > 0 && <span className="text-[9px] text-slate-400">{lotes.length} lotes configurados</span>}
                                    </button>
                                    {isSelected && (
                                      <div className="px-4 py-3 bg-white">
                                        <label className="label text-[10px] mb-1">Lotes disponíveis (separados por vírgula)</label>
                                        <input
                                          className="input-field text-xs h-9"
                                          placeholder="Ex: 01, 02, 05, 10"
                                          value={bulkLotesEspecificos[q] || ""}
                                          onChange={e => setBulkLotesEspecificos(prev => ({ ...prev, [q]: e.target.value }))}
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="p-5 border-t border-slate-100 flex justify-end gap-3">
                    <button onClick={() => { setBulkSelectedQuadras([]); setBulkLotesEspecificos({}); setLotRegTab("cadastrar"); }} className="btn-secondary px-6">Cancelar</button>
                    <button
                      disabled={bulkSelectedQuadras.length === 0}
                      onClick={() => {
                        if (!lotRegDev) return;
                        const quadraList = (lotRegDev.quadras || "").split(",").map(q => q.trim()).filter(Boolean);
                        const vendas = sales.filter(s => s.empreendimentoId === lotRegDev.id);
                        const newLotesInfo: Record<string, any> = { ...(lotRegDev.lotesInfo || {}) };
                        if (bulkAvailTab === "marcarIndisponiveis") {
                          bulkSelectedQuadras.forEach(q => {
                            const lotes = getLotesDeQuadra(lotRegDev.lotesPorQuadra?.[q]);
                            lotes.forEach(l => {
                              const key = `${q}-${l}`.toUpperCase();
                              const temVendaAtiva = vendas.some(s => s.quadra.toUpperCase() === q.toUpperCase() && s.numeroLote === l);
                              if (!temVendaAtiva) {
                                newLotesInfo[key] = { ...(newLotesInfo[key] || {}), rua: newLotesInfo[key]?.rua || "", status: "indisponivel" };
                              }
                            });
                          });
                        } else {
                          bulkSelectedQuadras.forEach(q => {
                            const lotes = getLotesDeQuadra(lotRegDev.lotesPorQuadra?.[q]);
                            const disponiveis = (bulkLotesEspecificos[q] || "").split(",").map(s => s.trim()).filter(Boolean);
                            lotes.forEach(l => {
                              const key = `${q}-${l}`.toUpperCase();
                              const temVendaAtiva = vendas.some(s => s.quadra.toUpperCase() === q.toUpperCase() && s.numeroLote === l);
                              if (!temVendaAtiva) {
                                newLotesInfo[key] = { ...(newLotesInfo[key] || {}), rua: newLotesInfo[key]?.rua || "", status: disponiveis.includes(l) ? "disponivel" : "indisponivel" };
                              }
                            });
                          });
                        }
                        onUpdateLotesInfo(lotRegDev.id, newLotesInfo);
                        setLotRegDev(prev => prev ? { ...prev, lotesInfo: newLotesInfo } : null);
                        setBulkSelectedQuadras([]);
                        setBulkLotesEspecificos({});
                        setLotRegTab("lotes");
                      }}
                      className={`px-8 h-11 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors ${bulkSelectedQuadras.length === 0 ? "bg-slate-100 text-slate-400 cursor-not-allowed" : bulkAvailTab === "marcarIndisponiveis" ? "bg-slate-700 hover:bg-slate-900 text-white" : "bg-emerald-500 hover:bg-emerald-600 text-white"}`}
                    >
                      {bulkAvailTab === "marcarIndisponiveis" ? <X size={15} /> : <Check size={15} />}
                      {bulkAvailTab === "marcarIndisponiveis" ? "Bloquear Lotes" : "Aplicar Disponibilidade"}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Modal: Gerenciar Disponibilidade em Massa */}
      <AnimatePresence>
        {bulkAvailDev && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-[28px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-slate-700 rounded-xl text-white">
                    <Settings size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-bold text-slate-800">Disponibilidade em Massa</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{bulkAvailDev.nome}</p>
                  </div>
                </div>
                <button onClick={() => { setBulkAvailDev(null); setBulkSelectedQuadras([]); setBulkLotesEspecificos({}); }} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-100 overflow-x-auto">
                <button
                  onClick={() => { setBulkAvailTab("marcarIndisponiveis"); setBulkSelectedQuadras([]); setBulkLotesEspecificos({}); }}
                  className={`shrink-0 flex-1 flex items-center justify-center gap-1.5 py-3 text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-colors whitespace-nowrap px-4 ${bulkAvailTab === "marcarIndisponiveis" ? "text-slate-700 border-b-2 border-slate-700" : "text-slate-400 hover:text-slate-600"}`}
                >
                  <X size={13} />
                  <span className="hidden sm:inline">Marcar Indisponíveis</span>
                  <span className="sm:hidden">Indisponíveis</span>
                </button>
                <button
                  onClick={() => { setBulkAvailTab("marcarDisponiveis"); setBulkSelectedQuadras([]); setBulkLotesEspecificos({}); }}
                  className={`shrink-0 flex-1 flex items-center justify-center gap-1.5 py-3 text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-colors whitespace-nowrap px-4 ${bulkAvailTab === "marcarDisponiveis" ? "text-emerald-600 border-b-2 border-emerald-600" : "text-slate-400 hover:text-slate-600"}`}
                >
                  <Check size={13} />
                  <span className="hidden sm:inline">Definir Disponíveis</span>
                  <span className="sm:hidden">Disponíveis</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {(() => {
                  const quadraList = (bulkAvailDev.quadras || "").split(",").map(q => q.trim()).filter(Boolean);
                  if (quadraList.length === 0) {
                    return <p className="text-slate-400 text-sm text-center py-8">Nenhuma quadra configurada neste empreendimento.</p>;
                  }

                  if (bulkAvailTab === "marcarIndisponiveis") {
                    return (
                      <div className="space-y-4">
                        <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-200">
                          <p className="font-bold text-slate-700 mb-1">⚠️ Atenção</p>
                          <p>Todos os lotes das quadras selecionadas serão marcados como <span className="font-bold text-slate-700">indisponíveis</span>. Lotes com venda ativa não serão alterados.</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Selecionar Quadras</p>
                          <div className="flex flex-wrap gap-2 mb-3">
                            <button
                              onClick={() => setBulkSelectedQuadras(quadraList.length === bulkSelectedQuadras.length ? [] : [...quadraList])}
                              className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${bulkSelectedQuadras.length === quadraList.length ? "bg-slate-700 text-white border-slate-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                            >
                              {bulkSelectedQuadras.length === quadraList.length ? "Desmarcar todas" : "Todas as quadras"}
                            </button>
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {quadraList.map(q => {
                              const isSelected = bulkSelectedQuadras.includes(q);
                              const lotes = getLotesDeQuadra(bulkAvailDev.lotesPorQuadra?.[q]);
                              return (
                                <button
                                  key={q}
                                  onClick={() => setBulkSelectedQuadras(prev => isSelected ? prev.filter(x => x !== q) : [...prev, q])}
                                  className={`flex flex-col items-center gap-0.5 px-3 py-3 rounded-xl border-2 text-xs font-bold transition-all ${isSelected ? "bg-slate-700 text-white border-slate-700 shadow-md" : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"}`}
                                >
                                  <span>Q.{q}</span>
                                  {lotes.length > 0 && <span className={`text-[9px] font-bold ${isSelected ? "text-slate-300" : "text-slate-400"}`}>{lotes.length} lotes</span>}
                                </button>
                              );
                            })}
                          </div>
                          {bulkSelectedQuadras.length > 0 && (
                            <p className="mt-3 text-xs text-slate-500 font-medium">
                              {bulkSelectedQuadras.length} quadra{bulkSelectedQuadras.length > 1 ? 's' : ''} selecionada{bulkSelectedQuadras.length > 1 ? 's' : ''} → todos os lotes disponíveis serão bloqueados.
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // Tab: Definir disponíveis por quadra (lotes específicos separados por vírgula)
                  return (
                    <div className="space-y-4">
                      <div className="p-3 bg-emerald-50 rounded-xl text-xs text-emerald-700 border border-emerald-200">
                        <p className="font-bold mb-1">ℹ️ Como funciona</p>
                        <p>Para cada quadra selecionada, informe os lotes que ficam <span className="font-bold">disponíveis</span> (separados por vírgula). Os demais lotes da quadra serão marcados como <span className="font-bold">indisponíveis</span>. Lotes com venda ativa não são alterados.</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Quadras</p>
                        <div className="space-y-3">
                          {quadraList.map(q => {
                            const isSelected = bulkSelectedQuadras.includes(q);
                            const lotes = getLotesDeQuadra(bulkAvailDev.lotesPorQuadra?.[q]);
                            return (
                              <div key={q} className={`rounded-xl border-2 overflow-hidden transition-all ${isSelected ? "border-emerald-300" : "border-slate-100"}`}>
                                <button
                                  onClick={() => setBulkSelectedQuadras(prev => isSelected ? prev.filter(x => x !== q) : [...prev, q])}
                                  className={`w-full flex items-center justify-between px-4 py-3 text-xs font-bold transition-colors ${isSelected ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`}
                                >
                                  <span className="flex items-center gap-2">
                                    <span className={`w-4 h-4 rounded flex items-center justify-center border-2 transition-all ${isSelected ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300"}`}>
                                      {isSelected && <Check size={10} />}
                                    </span>
                                    Quadra {q}
                                  </span>
                                  {lotes.length > 0 && <span className="text-[9px] text-slate-400">{lotes.length} lotes configurados</span>}
                                </button>
                                {isSelected && (
                                  <div className="px-4 py-3 bg-white space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                                      Lotes disponíveis (separados por vírgula)
                                    </label>
                                    <input
                                      type="text"
                                      className="input-field text-sm font-bold w-full"
                                      placeholder="Ex: 1, 3, 5, 10, 15"
                                      value={bulkLotesEspecificos[q] ?? ""}
                                      onChange={e => setBulkLotesEspecificos(prev => ({ ...prev, [q]: e.target.value }))}
                                    />
                                    {bulkLotesEspecificos[q]?.trim() && (
                                      <p className="text-[10px] text-emerald-600 font-bold">
                                        Disponíveis: {bulkLotesEspecificos[q].split(",").map(s => s.trim()).filter(Boolean).join(", ")}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="p-5 border-t border-slate-100 flex justify-end gap-3">
                <button onClick={() => { setBulkAvailDev(null); setBulkSelectedQuadras([]); setBulkLotesEspecificos({}); }} className="btn-secondary px-6">Cancelar</button>
                <button
                  disabled={bulkSelectedQuadras.length === 0}
                  onClick={() => {
                    if (!bulkAvailDev) return;
                    const quadraList = (bulkAvailDev.quadras || "").split(",").map(q => q.trim()).filter(Boolean);
                    const vendas = sales.filter(s => s.empreendimentoId === bulkAvailDev.id);
                    const newLotesInfo: Record<string, any> = { ...(bulkAvailDev.lotesInfo || {}) };

                    if (bulkAvailTab === "marcarIndisponiveis") {
                      // Para cada quadra selecionada, marcar todos os lotes (sem venda ativa) como indisponíveis
                      bulkSelectedQuadras.forEach(q => {
                        const lotes = getLotesDeQuadra(bulkAvailDev.lotesPorQuadra?.[q]);
                        lotes.forEach(l => {
                          const key = `${q}-${l}`.toUpperCase();
                          const temVendaAtiva = vendas.some(s => s.quadra.toUpperCase() === q.toUpperCase() && s.numeroLote === l);
                          if (!temVendaAtiva) {
                            newLotesInfo[key] = { ...(newLotesInfo[key] || {}), rua: newLotesInfo[key]?.rua || "", status: "indisponivel" };
                          }
                        });
                      });
                    } else {
                      // Para cada quadra com lotes específicos informados, marcar os informados como disponíveis e os demais como indisponíveis
                      bulkSelectedQuadras.forEach(q => {
                        const lotes = getLotesDeQuadra(bulkAvailDev.lotesPorQuadra?.[q]);
                        const disponiveis = (bulkLotesEspecificos[q] || "").split(",").map(s => s.trim()).filter(Boolean);
                        lotes.forEach(l => {
                          const key = `${q}-${l}`.toUpperCase();
                          const temVendaAtiva = vendas.some(s => s.quadra.toUpperCase() === q.toUpperCase() && s.numeroLote === l);
                          if (!temVendaAtiva) {
                            const isDisponivel = disponiveis.includes(l);
                            newLotesInfo[key] = { ...(newLotesInfo[key] || {}), rua: newLotesInfo[key]?.rua || "", status: isDisponivel ? "disponivel" : "indisponivel" };
                          }
                        });
                      });
                    }

                    onUpdateLotesInfo(bulkAvailDev.id, newLotesInfo);
                    setBulkAvailDev(null);
                    setBulkSelectedQuadras([]);
                    setBulkLotesEspecificos({});
                  }}
                  className={`px-8 h-11 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors ${bulkSelectedQuadras.length === 0 ? "bg-slate-100 text-slate-400 cursor-not-allowed" : bulkAvailTab === "marcarIndisponiveis" ? "bg-slate-700 hover:bg-slate-900 text-white" : "bg-emerald-500 hover:bg-emerald-600 text-white"}`}
                >
                  {bulkAvailTab === "marcarIndisponiveis" ? <X size={15} /> : <Check size={15} />}
                  {bulkAvailTab === "marcarIndisponiveis" ? "Bloquear Lotes" : "Aplicar Disponibilidade"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {DeleteModal}
    </div>
  );
};

const VendasSection = ({
  developments,
  sales = [],
  onSaveVenda,
  onGoToContracts,
  onGoToContractsRecibo,
  initialSaleData,
  onSaveDev,
  vendedores = [],
  clients = [],
  editingEntry,
  onUpdateVendaFull,
  onMergeClients,
}: {
  developments: Empreendimento[];
  sales?: Venda[];
  onSaveVenda: (v: Venda, c: Cliente) => Venda;
  onGoToContracts: (v: Venda) => void;
  onGoToContractsRecibo?: (v: Venda) => void;
  initialSaleData?: Partial<Venda>;
  onSaveDev: (d: Empreendimento) => void;
  vendedores?: Vendedor[];
  clients?: Cliente[];
  editingEntry?: { venda: Venda; cliente: Cliente | null } | null;
  onUpdateVendaFull?: (v: Venda, c: Cliente) => void;
  onMergeClients?: (masterId: string, duplicateIds: string[]) => void;
}) => {
  const [clientData, setClientData] = useState<Partial<Cliente>>({
    nome: "",
    nacionalidade: "Brasileira",
    genero: "M",
    rg: "",
    cpf: "",
    estadoCivil: "Solteiro(a)",
    profissao: "",
    nascimento: "",
    cep: "",
    endereco: "",
    numero: "",
    bairro: "",
    cidade: "",
    estado: "",
    telefone1: "",
    telefone2: "",
  });
  const [hasSecondBuyer, setHasSecondBuyer] = useState(false);
  const [secondBuyerData, setSecondBuyerData] = useState<Venda["comprador2"]>({
    nome: "",
    nacionalidade: "Brasileira",
    genero: "M",
    rg: "",
    cpf: "",
    estadoCivil: "Solteiro(a)",
    profissao: "",
    nascimento: "",
  });
  const [saleData, setSaleData] = useState<Partial<Venda>>({
    empreendimentoId: "",
    numeroLote: "",
    quadra: "",
    rua: "",
    valorLote: undefined,
    valorEntrada: undefined,
    quantidadeParcelas: undefined,
    dataVencimento: defaultVencimento(),
    vendedor: "",
    valorParcela: 0,
    custo: 0,
    comissao: 0,
    formaPagamento: "Boleto",
    ...initialSaleData,
  });
  const [tipoVenda, setTipoVenda] = useState<'avista' | 'parcelado'>(
    initialSaleData?.quantidadeParcelas === 0 ? 'avista' : 'parcelado'
  );
  const vendasFormRef = useRef<HTMLFormElement>(null);
  const [showNovoDev, setShowNovoDev] = useState(false);
  const [novoDevData, setNovoDevData] = useState({ nome: "", comunidade: "", quadras: "", totalLotes: 0 });
  const [cpfErr, setCpfErr] = useState<string | null>(null);
  const [rgErr, setRgErr] = useState<string | null>(null);
  const [cpf2Err, setCpf2Err] = useState<string | null>(null);
  const [rg2Err, setRg2Err] = useState<string | null>(null);
  const [showNameDropdown, setShowNameDropdown] = useState(false);
  const [showCpfDropdown, setShowCpfDropdown] = useState(false);
  const [cpfMatch, setCpfMatch] = useState<Cliente | null>(null);
  const [cpfDuplicates, setCpfDuplicates] = useState<Cliente[]>([]);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [hasDraft, setHasDraft] = useState(() => !!localStorage.getItem('venda_rascunho'));
  const [showColarFicha, setShowColarFicha] = useState(false);
  const [fichaText, setFichaText] = useState("");
  const [fichaFilled, setFichaFilled] = useState<string[]>([]);
  const [fichaSuccess, setFichaSuccess] = useState(false);

  const handleSalvarNovoDev = () => {
    if (!novoDevData.nome) { alert("Informe o nome do empreendimento."); return; }
    const novo: Empreendimento = {
      id: `dev-${Date.now()}`,
      nome: novoDevData.nome,
      endereco: "",
      cidade: "",
      estado: "",
      totalLotes: novoDevData.totalLotes || 0,
      descricao: "",
      lotesVendidos: 0,
      comunidade: novoDevData.comunidade,
      quadras: novoDevData.quadras,
    };
    onSaveDev(novo);
    setSaleData({ ...saleData, empreendimentoId: novo.id });
    setShowNovoDev(false);
    setNovoDevData({ nome: "", comunidade: "", quadras: "", totalLotes: 0 });
  };

  // Update saleData if initialSaleData changes (e.g. coming from Dashboard)
  useEffect(() => {
    if (initialSaleData) {
      setSaleData((prev) => ({ ...prev, ...initialSaleData }));
    }
  }, [initialSaleData]);

  // Pre-fill all data when editing an existing sale
  useEffect(() => {
    if (editingEntry) {
      if (editingEntry.cliente) {
        setClientData({ ...editingEntry.cliente });
      }
      setSaleData({ ...editingEntry.venda });
      setTipoVenda(editingEntry.venda.quantidadeParcelas === 0 ? 'avista' : 'parcelado');
      if (editingEntry.venda.comprador2) {
        setHasSecondBuyer(true);
        setSecondBuyerData({ ...editingEntry.venda.comprador2 });
      } else {
        setHasSecondBuyer(false);
      }
      setLastSavedVenda(null);
      setCpfMatch(null);
      setCpfDuplicates([]);
    }
  }, [editingEntry]);

  // CPF detection — match único mostra "Usar dados existentes", múltiplos mostra duplicatas
  useEffect(() => {
    const cpfRaw = (clientData.cpf || "").replace(/\D/g, "");
    if (cpfRaw.length !== 11 || !validarCPF(clientData.cpf || "")) {
      setCpfMatch(null);
      setCpfDuplicates([]);
      return;
    }
    // Exclui o cliente já carregado (edição ou após "Usar dados existentes")
    const excludeId = editingEntry?.cliente?.id || clientData.id;
    const matches = clients.filter(
      (c) => c.cpf?.replace(/\D/g, "") === cpfRaw && c.id !== excludeId
    );
    if (matches.length === 1) {
      setCpfMatch(matches[0]);
      setCpfDuplicates([]);
    } else if (matches.length > 1) {
      setCpfMatch(null);
      setCpfDuplicates(matches);
    } else {
      setCpfMatch(null);
      setCpfDuplicates([]);
    }
  }, [clientData.cpf, clientData.id, clients, editingEntry]);

  const [rawText, setRawText] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isExtractingFiles, setIsExtractingFiles] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [lastSavedVenda, setLastSavedVenda] = useState<Venda | null>(null);

  const [pasteSuccess, setPasteSuccess] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteFilledFields, setPasteFilledFields] = useState<string[]>([]);
  const [fileExtractSuccess, setFileExtractSuccess] = useState(false);
  const [fileExtractError, setFileExtractError] = useState<string | null>(null);
  const [fileFilledFields, setFileFilledFields] = useState<string[]>([]);

  const applyDataToState = (
    data: Record<string, any>,
    devList: Empreendimento[]
  ) => {
    // Match empreendimento by name (field: "empreendimento")
    const empNome = (data.empreendimento || data.empreendimentoNome || "").toLowerCase().trim();
    let empreendimentoId: string | undefined;
    if (empNome) {
      const match = devList.find(
        (d) =>
          d.nome.toLowerCase().includes(empNome) ||
          empNome.includes(d.nome.toLowerCase())
      );
      if (match) empreendimentoId = match.id;
    }

    // Detect gender from estadoCivil
    const estadoCivil = data.estadoCivil || "";
    const generoDetectado: "F" | "M" | undefined =
      ["Solteira", "Casada", "Divorciada", "Viúva"].includes(estadoCivil) ? "F" :
      ["Solteiro", "Casado", "Divorciado", "Viúvo"].includes(estadoCivil) ? "M" : undefined;

    // Build dataVencimento date from diaVencimento day number
    let dataVencimento: string | undefined;
    const diaVenc = data.diaVencimento ? String(data.diaVencimento).replace(/\D/g, "") : "";
    if (diaVenc) {
      const now = new Date();
      let year = now.getFullYear();
      let month = now.getMonth() + 1;
      const dia = parseInt(diaVenc);
      if (dia <= now.getDate()) { month += 1; if (month > 12) { month = 1; year += 1; } }
      dataVencimento = `${year}-${String(month).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    } else if (data.dataVencimento) {
      dataVencimento = data.dataVencimento;
    }

    setClientData((prev) => ({
      ...prev,
      ...(data.nome ? { nome: data.nome } : {}),
      ...(data.nacionalidade ? { nacionalidade: data.nacionalidade } : {}),
      ...(data.rg ? { rg: data.rg } : {}),
      ...(data.cpf ? { cpf: maskCPF(String(data.cpf)) } : {}),
      ...(estadoCivil ? { estadoCivil } : {}),
      ...(generoDetectado ? { genero: generoDetectado } : {}),
      ...(data.profissao ? { profissao: data.profissao } : {}),
      ...(data.nascimento ? { nascimento: data.nascimento } : {}),
      ...(data.telefone1 ? { telefone1: maskPhone(String(data.telefone1)) } : {}),
      ...(data.telefone2 ? { telefone2: maskPhone(String(data.telefone2)) } : {}),
      ...(data.endereco ? { endereco: data.endereco } : {}),
      ...(data.numero ? { numero: String(data.numero) } : {}),
      ...(data.bairro ? { bairro: data.bairro } : {}),
      ...(data.cidade ? { cidade: data.cidade } : {}),
      ...(data.estado ? { estado: data.estado } : {}),
      ...(data.cep ? { cep: maskCEP(String(data.cep)) } : {}),
    }));

    setSaleData((prev) => ({
      ...prev,
      ...(empreendimentoId ? { empreendimentoId } : {}),
      ...(data.lote || data.numeroLote ? { numeroLote: String(data.lote || data.numeroLote) } : {}),
      ...(data.quadra ? { quadra: String(data.quadra) } : {}),
      ...(data.valorTotal || data.valorLote ? { valorLote: Number(data.valorTotal || data.valorLote) } : {}),
      ...(data.entrada || data.valorEntrada ? { valorEntrada: Number(data.entrada || data.valorEntrada) } : {}),
      ...(data.valorParcela ? { valorParcela: Number(data.valorParcela) } : {}),
      ...(data.numeroParcelas || data.quantidadeParcelas ? { quantidadeParcelas: Number(data.numeroParcelas || data.quantidadeParcelas) } : {}),
      ...(dataVencimento ? { dataVencimento } : {}),
    }));
  };

  const runExtraction = async (text: string) => {
    setIsExtracting(true);
    setPasteSuccess(false);
    setPasteError(null);
    setPasteFilledFields([]);
    try {
      const data = await geminiService.smartPaste(text);
      console.log("Gemini retornou:", data);
      const fields = getFilledFieldNames(data);
      if (fields.length > 0) {
        applyDataToState(data, developments);
        setPasteFilledFields(fields);
        setPasteSuccess(true);
        setRawText("");
        setTimeout(() => { setPasteSuccess(false); setPasteFilledFields([]); }, 6000);
      } else {
        setPasteError("Não foi possível identificar dados. Verifique o texto.");
        setTimeout(() => setPasteError(null), 5000);
      }
    } catch (err) {
      console.error("Extraction error:", err);
      setPasteError((err as any)?.message || "Erro ao processar o texto. Tente novamente.");
      setTimeout(() => setPasteError(null), 5000);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleExtractIA = async () => {
    if (!rawText.trim()) return;
    await runExtraction(rawText);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData("text");
    if (!pastedText.trim()) return;
    setRawText(pastedText);
    setTimeout(() => runExtraction(pastedText), 80);
  };

  const handleCopySummary = () => {
    if (!lastSavedVenda) return;

    const brl = (v: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

    // Format phone to +55 DD XXXXX-XXXX
    const fmtPhone = (raw: string) => {
      const digits = raw.replace(/\D/g, "");
      if (digits.length === 11)
        return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 7)}-${digits.slice(7)}`;
      if (digits.length === 10)
        return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6)}`;
      return raw;
    };

    // Format nascimento YYYY-MM-DD → DD/MM/YYYY
    const fmtNasc = (d: string) => {
      if (!d) return "";
      const [y, m, day] = d.split("-");
      return `${day}/${m}/${y}`;
    };

    // Extract day from dataVencimento
    const diaVenc = lastSavedVenda.dataVencimento
      ? new Date(lastSavedVenda.dataVencimento + "T12:00:00").getDate()
      : "";

    // Build phone line
    const phones = [clientData.telefone1, clientData.telefone2]
      .filter(Boolean)
      .map((p) => fmtPhone(p as string));
    const phoneLabel = `CONTATO: ${phones.join(" / ")}`;

    const summary = `CADASTRO DO COMPRADOR
NOME: ${(clientData.nome || "").toUpperCase()}
RG: ${(clientData.rg || "").toUpperCase()}
CPF: ${clientData.cpf || ""}
ESTADO CIVIL: ${genderizeEstadoCivil(clientData.estadoCivil || "", clientData.genero || "M").toUpperCase()}
DATA DE ANIVERSÁRIO: ${fmtNasc(clientData.nascimento || "")}
ENDEREÇO: ${(clientData.endereco || "").toUpperCase()}
Nº: ${clientData.numero || ""}
BAIRRO: ${(clientData.bairro || "").toUpperCase()}
CEP: ${clientData.cep || ""}
${phoneLabel}
LOTE: ${lastSavedVenda.numeroLote}
QUADRA: ${lastSavedVenda.quadra}
EMPREENDIMENTO: ${lastSavedVenda.empreendimentoNome.toUpperCase()}
VALOR TOTAL: ${brl(lastSavedVenda.valorLote)}
ENTRADA: ${brl(lastSavedVenda.valorEntrada)}
QUANTIDADE DE PARCELAS: ${lastSavedVenda.quantidadeParcelas}x de ${brl(lastSavedVenda.valorParcela)}
DATA DE VENCIMENTO: ${diaVenc}
VENDEDOR: ${lastSavedVenda.vendedor}`;

    navigator.clipboard.writeText(summary);
    alert("Resumo copiado para a área de transferência!");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files || []);
    setAttachedFiles((prev) => {
      const combined = [...prev, ...chosen];
      return combined.slice(0, 2);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const applyExtractedData = (data: Record<string, any>, devs: typeof developments) => {
    const nomeLower = (data.empreendimentoNome || "").toLowerCase();
    let empreendimentoId: string | undefined;
    if (nomeLower) {
      const match = devs.find(
        (d) =>
          d.nome.toLowerCase().includes(nomeLower) ||
          nomeLower.includes(d.nome.toLowerCase())
      );
      if (match) empreendimentoId = match.id;
    }
    setClientData((prev) => ({
      ...prev,
      nome: data.nome || data.nomeComprador || prev.nome,
      nacionalidade: data.nacionalidade || prev.nacionalidade,
      rg: data.rg || prev.rg,
      cpf: data.cpf ? maskCPF(data.cpf) : prev.cpf,
      estadoCivil: data.estadoCivil || prev.estadoCivil,
      profissao: data.profissao || prev.profissao,
      nascimento: data.nascimento || prev.nascimento,
      telefone1: data.telefone1 ? maskPhone(data.telefone1) : prev.telefone1,
      endereco: data.endereco || prev.endereco,
      numero: data.numero || prev.numero,
      bairro: data.bairro || prev.bairro,
      cidade: data.cidade || prev.cidade,
      estado: data.estado || prev.estado,
      cep: data.cep ? maskCEP(data.cep) : prev.cep,
    }));
    setSaleData((prev) => ({
      ...prev,
      ...(empreendimentoId ? { empreendimentoId } : {}),
      numeroLote: data.numeroLote || prev.numeroLote,
      quadra: data.quadra || prev.quadra,
      valorLote: data.valorLote || prev.valorLote,
      valorEntrada: data.valorEntrada || prev.valorEntrada,
      valorParcela: data.valorParcela || prev.valorParcela,
      quantidadeParcelas: data.quantidadeParcelas || prev.quantidadeParcelas,
      dataVencimento: data.dataVencimento || prev.dataVencimento,
      vendedor: data.vendedor || prev.vendedor,
    }));
  };

  const handleExtractFromFiles = async () => {
    if (attachedFiles.length === 0) return;
    setIsExtractingFiles(true);
    setFileExtractSuccess(false);
    setFileExtractError(null);
    setFileFilledFields([]);
    try {
      const data = await geminiService.extractFromFiles(attachedFiles);
      console.log("Gemini retornou:", data);
      const fields = getFilledFieldNames(data);
      if (fields.length > 0) {
        applyExtractedData(data, developments);
        setFileFilledFields(fields);
        setFileExtractSuccess(true);
        setAttachedFiles([]);
        setTimeout(() => { setFileExtractSuccess(false); setFileFilledFields([]); }, 6000);
      } else {
        setFileExtractError("Não foi possível identificar dados nos documentos.");
        setTimeout(() => setFileExtractError(null), 5000);
      }
    } catch (err) {
      const msg = (err as any)?.message || "Erro ao ler os documentos.";
      console.error("File extraction error:", err);
      setFileExtractError(msg);
      setTimeout(() => setFileExtractError(null), 5000);
    } finally {
      setIsExtractingFiles(false);
    }
  };

  // Effect to auto-calculate default commission (e.g., 5%)
  useEffect(() => {
    if (saleData.valorLote && !saleData.comissao) {
      setSaleData((prev) => ({ ...prev, comissao: prev.valorLote! * 0.05 }));
    }
  }, [saleData.valorLote]);

  // Effect to auto-fill street if known (lotesInfo first, then ruasFaixas)
  useEffect(() => {
    if (saleData.empreendimentoId && saleData.quadra && saleData.numeroLote) {
      const dev = developments.find((d) => d.id === saleData.empreendimentoId);
      const key = `${saleData.quadra}-${saleData.numeroLote}`.toUpperCase();
      if (dev?.lotesInfo?.[key]?.rua) {
        setSaleData((prev) => ({ ...prev, rua: dev!.lotesInfo![key].rua }));
      } else {
        const ruaSugerida = dev ? getRuaSugerida(dev, saleData.quadra, saleData.numeroLote) : null;
        if (ruaSugerida) {
          setSaleData((prev) => ({ ...prev, rua: ruaSugerida }));
        }
      }
    }
  }, [
    saleData.empreendimentoId,
    saleData.quadra,
    saleData.numeroLote,
    developments,
  ]);

  const buscarCEP = async (cep: string) => {
    const cleanCEP = cep.replace(/\D/g, "");
    if (cleanCEP.length !== 8) return;
    try {
      const response = await fetch(
        `https://viacep.com.br/ws/${cleanCEP}/json/`,
      );
      const data = await response.json();
      if (!data.erro) {
        setClientData((prev) => ({
          ...prev,
          endereco: data.logradouro,
          bairro: data.bairro,
          cidade: data.localidade,
          estado: data.uf,
        }));
      }
    } catch (error) {}
  };

  const handleValueChange = (field: string, value: number) => {
    let updatedData = { ...saleData, [field]: value };

    // Total = Entry + (Count * Value)
    // Value = (Total - Entry) / Count
    // Total = (Value * Count) + Entry

    if (
      field === "valorLote" ||
      field === "valorEntrada" ||
      field === "quantidadeParcelas"
    ) {
      const vLote = field === "valorLote" ? value : saleData.valorLote || 0;
      const vEntrada =
        field === "valorEntrada" ? value : saleData.valorEntrada || 0;
      const qParcelas =
        field === "quantidadeParcelas"
          ? value
          : saleData.quantidadeParcelas || 1;

      const calcParcela = Math.max(0, (vLote - vEntrada) / (qParcelas || 1));
      updatedData.valorParcela = Number(calcParcela.toFixed(2));
    } else if (field === "valorParcela") {
      const vParcela = value;
      const vEntrada = saleData.valorEntrada || 0;
      const qParcelas = saleData.quantidadeParcelas || 1;

      const calcLote = vParcela * qParcelas + vEntrada;
      updatedData.valorLote = Number(calcLote.toFixed(2));
    }

    setSaleData(updatedData);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientData.nome || !saleData.empreendimentoId) {
      triggerShake(vendasFormRef.current);
      return;
    }
    if (clientData.cpf && cpfStatus(clientData.cpf) === "invalid") {
      setCpfErr("CPF inválido");
      return;
    }
    if (clientData.rg && rgStatus(clientData.rg) === "invalid") {
      setRgErr("RG inválido ou incompleto");
      return;
    }
    if (hasSecondBuyer && secondBuyerData?.cpf && cpfStatus(secondBuyerData.cpf) === "invalid") {
      setCpf2Err("CPF inválido");
      return;
    }
    if (hasSecondBuyer && secondBuyerData?.rg && rgStatus(secondBuyerData.rg) === "invalid") {
      setRg2Err("RG inválido ou incompleto");
      return;
    }
    const dev = developments.find((d) => d.id === saleData.empreendimentoId);

    if (editingEntry && onUpdateVendaFull) {
      const updatedCliente: Cliente = {
        ...(editingEntry.cliente || ({ id: Date.now().toString(), dataCadastro: new Date().toISOString() } as Cliente)),
        ...(clientData as Cliente),
      };
      const updatedVenda: Venda = {
        ...editingEntry.venda,
        ...(saleData as Venda),
        clienteId: updatedCliente.id,
        clienteNome: updatedCliente.nome,
        empreendimentoNome: dev?.nome || editingEntry.venda.empreendimentoNome,
        valorParcela: saleData.valorParcela || 0,
        comprador2: hasSecondBuyer ? secondBuyerData : undefined,
      };
      onUpdateVendaFull(updatedVenda, updatedCliente);
      setLastSavedVenda(updatedVenda);
      return;
    }

    const cliente: Cliente = {
      ...(clientData as Cliente),
      id: Date.now().toString(),
      dataCadastro: new Date().toISOString(),
    };
    const venda: Venda = {
      ...(saleData as Venda),
      id: (Date.now() + 1).toString(),
      numeroContrato: `CONT-${Date.now()}`,
      clienteId: cliente.id,
      clienteNome: cliente.nome,
      empreendimentoNome: dev?.nome || "",
      valorParcela: saleData.valorParcela || 0,
      dataVenda: new Date().toISOString(),
      status: "pendente",
      comprador2: hasSecondBuyer ? secondBuyerData : undefined,
    };
    const savedVenda = onSaveVenda(venda, cliente);
    setLastSavedVenda(savedVenda);
  };

  if (lastSavedVenda) {
    const wasEditing = !!editingEntry;
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card-premium py-20 text-center space-y-8"
      >
        <div className="w-24 h-24 bg-primary-main/10 text-primary-main rounded-full flex items-center justify-center mx-auto shadow-inner">
          <FileCheck size={48} />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-display font-bold text-slate-800">
            {wasEditing ? "Venda Atualizada!" : "Venda Registrada!"}
          </h2>
          <p className="text-slate-500">
            {wasEditing ? "As alterações foram salvas com sucesso." : "O cadastro foi concluído e os dados estão salvos."}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-8 flex-wrap">
          <button onClick={handleCopySummary} className="btn-ghost px-6">
            <Copy size={18} />
            <span>Copiar Resumo</span>
          </button>
          <button
            onClick={() => onGoToContracts(lastSavedVenda)}
            className="btn-primary px-6"
          >
            <FileText size={18} />
            <span>Gerar Contrato</span>
          </button>
          <button
            onClick={() => onGoToContractsRecibo?.(lastSavedVenda)}
            className="btn-ghost px-6"
          >
            <FileCheck size={18} />
            <span>Gerar Recibo</span>
          </button>
          <button
            onClick={() => setLastSavedVenda(null)}
            className="btn-ghost px-6"
          >
            <span>Novo Cadastro</span>
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-8 pb-32 lg:pb-0">
      {/* Edit mode banner */}
      {editingEntry && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-300 rounded-2xl"
        >
          <div className="p-2 bg-amber-500 rounded-xl text-white flex-shrink-0">
            <Pencil size={16} />
          </div>
          <div className="flex-1">
            <p className="text-xs font-black text-amber-800 uppercase tracking-widest">Modo Edição</p>
            <p className="text-sm font-semibold text-amber-700">
              Editando venda de <strong>{editingEntry.venda.clienteNome}</strong> — {editingEntry.venda.empreendimentoNome}, Quadra {editingEntry.venda.quadra}, Lote {editingEntry.venda.numeroLote}
            </p>
          </div>
        </motion.div>
      )}

      {/* Merge Modal */}
      <AnimatePresence>
        {showMergeModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-[28px] shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h4 className="font-display font-bold text-slate-800">Mesclar Clientes Duplicados</h4>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Escolha o registro principal</p>
                </div>
                <button onClick={() => setShowMergeModal(false)} className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
                  <X size={18} />
                </button>
              </div>
              <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
                <p className="text-sm text-slate-500 mb-4">
                  Selecione qual registro manter como principal. Os outros serão excluídos e suas vendas serão transferidas para o registro principal.
                </p>
                {cpfDuplicates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setMergeTargetId(c.id)}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${mergeTargetId === c.id ? "border-primary-main bg-primary-main/5" : "border-slate-100 hover:border-slate-200"}`}
                  >
                    <p className="font-bold text-slate-800">{c.nome}</p>
                    <div className="flex gap-4 mt-1 text-xs text-slate-500">
                      {c.cpf && <span>CPF: {c.cpf}</span>}
                      {c.telefone1 && <span>Tel: {c.telefone1}</span>}
                      {c.dataCadastro && <span>Cadastro: {new Date(c.dataCadastro).toLocaleDateString("pt-BR")}</span>}
                    </div>
                  </button>
                ))}
              </div>
              <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setShowMergeModal(false)} className="btn-secondary px-6">Cancelar</button>
                <button
                  type="button"
                  disabled={!mergeTargetId}
                  onClick={() => {
                    if (!mergeTargetId || !onMergeClients) return;
                    const duplicateIds = cpfDuplicates.filter(c => c.id !== mergeTargetId).map(c => c.id);
                    onMergeClients(mergeTargetId, duplicateIds);
                    const master = cpfDuplicates.find(c => c.id === mergeTargetId);
                    if (master) setClientData({ ...clientData, ...master });
                    setCpfDuplicates([]);
                    setShowMergeModal(false);
                  }}
                  className="btn-primary px-8 disabled:opacity-50"
                >
                  Mesclar e Manter Principal
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* IA Auto-fill Section — temporariamente desativado. Para reativar, remova o "hidden" abaixo */}
      <div className="hidden card-premium bg-gradient-to-br from-primary-main/[0.03] to-transparent border-primary-main/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-primary-main text-primary-contrast rounded-2xl shadow-lg shadow-primary-main/10">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="text-lg font-display font-bold text-slate-800">
              Auto-preenchimento
            </h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
              Cole texto ou anexe documentos
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Textarea */}
          <div className="relative">
            <textarea
              className="input-field min-h-[100px] resize-none"
              placeholder="Cole o texto do cadastro aqui e os campos serão preenchidos automaticamente..."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              onPaste={handlePaste}
            />
            {isExtracting && (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-sm rounded-2xl flex items-center justify-center gap-2 text-primary-main text-xs font-black uppercase tracking-widest">
                <RefreshCw size={16} className="animate-spin" />
                Preenchendo campos...
              </div>
            )}
          </div>

          <AnimatePresence>
            {pasteSuccess && (
              <motion.div
                key="paste-success"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex flex-col gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest">
                  <CheckCircle2 size={15} />
                  ✅ Campos preenchidos automaticamente!
                </div>
                {pasteFilledFields.length > 0 && (
                  <p className="text-[11px] text-emerald-600 ml-5">
                    {pasteFilledFields.join(", ")}
                  </p>
                )}
              </motion.div>
            )}
            {pasteError && (
              <motion.div
                key="paste-error"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-[11px] font-black uppercase tracking-widest"
              >
                <AlertCircle size={15} />
                ❌ {pasteError}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            disabled={isExtracting || !rawText.trim()}
            onClick={handleExtractIA}
            className="btn-primary w-full sm:w-auto px-8"
          >
            {isExtracting ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                <span>🤖 Analisando...</span>
              </>
            ) : (
              <>
                <Sparkles size={18} />
                <span>Preencher com IA</span>
              </>
            )}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">ou</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* File upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          <button
            type="button"
            disabled={attachedFiles.length >= 2}
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary w-full sm:w-auto px-8"
          >
            <span>📎</span>
            <span>Anexar Documentos</span>
            <span className="text-xs opacity-60">(máx. 2)</span>
          </button>

          {/* Previews */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {attachedFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="relative flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 shadow-sm"
                >
                  {file.type.startsWith("image/") ? (
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-10 h-10 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-10 h-10 flex items-center justify-center bg-red-50 rounded-lg text-red-500 text-xl">
                      📄
                    </div>
                  )}
                  <div className="max-w-[120px]">
                    <p className="text-xs font-semibold text-slate-700 truncate">{file.name}</p>
                    <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="ml-1 p-1 rounded-full hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Extract from files button — only when files are selected */}
          {attachedFiles.length > 0 && (
            <button
              type="button"
              disabled={isExtractingFiles}
              onClick={handleExtractFromFiles}
              className="btn-primary w-full sm:w-auto px-8"
            >
              {isExtractingFiles ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  <span>🤖 Lendo documentos...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>Extrair com IA</span>
                </>
              )}
            </button>
          )}

          <AnimatePresence>
            {fileExtractSuccess && (
              <motion.div
                key="file-success"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex flex-col gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest">
                  <CheckCircle2 size={15} />
                  ✅ Campos preenchidos a partir dos documentos!
                </div>
                {fileFilledFields.length > 0 && (
                  <p className="text-[11px] text-emerald-600 ml-5">
                    {fileFilledFields.join(", ")}
                  </p>
                )}
              </motion.div>
            )}
            {fileExtractError && (
              <motion.div
                key="file-error"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-[11px] font-black uppercase tracking-widest"
              >
                <AlertCircle size={15} />
                ❌ {fileExtractError}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Colar Ficha Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => { setShowColarFicha(true); setFichaText(""); setFichaFilled([]); setFichaSuccess(false); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-primary-main transition-colors shadow-lg"
        >
          <ClipboardPaste size={15} />
          Colar Ficha
        </button>
      </div>

      {/* Modal: Colar Ficha */}
      <AnimatePresence>
        {showColarFicha && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-xl rounded-[28px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-slate-900 rounded-xl text-white">
                    <ClipboardPaste size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-bold text-slate-800">Colar Ficha</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Preenchimento automático por texto</p>
                  </div>
                </div>
                <button onClick={() => setShowColarFicha(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-200">
                  <p className="font-bold text-slate-700 mb-1">Como usar</p>
                  <p>Cole o texto da ficha no formato <span className="font-mono bg-white border border-slate-200 px-1 py-0.5 rounded">CHAVE: valor</span>, um por linha. Exemplos: <span className="font-mono bg-white border border-slate-200 px-1 py-0.5 rounded">Nome: João Silva</span>, <span className="font-mono bg-white border border-slate-200 px-1 py-0.5 rounded">Parcelas: 63x de R$ 600,00</span>, <span className="font-mono bg-white border border-slate-200 px-1 py-0.5 rounded">Contato: (11) 99999-0000 / (11) 88888-0000</span></p>
                </div>
                <textarea
                  className="input-field min-h-[200px] resize-none font-mono text-xs"
                  placeholder={"Nome: João da Silva\nCPF: 123.456.789-00\nRG: 1234567\nNascimento: 01/01/1990\nEstado Civil: Casado(a)\nProfissão: Comerciante\nEndereço: Rua das Flores\nBairro: Centro\nCidade: São Paulo\nCEP: 01001-000\nContato: (11) 99999-0000 / (11) 88888-0000\nEmpreendimento: Residencial Palmeiras\nQuadra: A\nLote: 05\nValor Total: R$ 50.000,00\nEntrada: R$ 5.000,00\nParcelas: 60x de R$ 750,00"}
                  value={fichaText}
                  onChange={(e) => setFichaText(e.target.value)}
                  autoFocus
                />
                {fichaSuccess && fichaFilled.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3"
                  >
                    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest">
                      <CheckCircle2 size={15} />
                      Campos preenchidos com sucesso!
                    </div>
                    <p className="text-[11px] text-emerald-600 ml-5">{fichaFilled.join(", ")}</p>
                  </motion.div>
                )}
              </div>
              <div className="p-5 border-t border-slate-100 flex justify-end gap-3">
                <button onClick={() => setShowColarFicha(false)} className="btn-secondary px-6">Cancelar</button>
                <button
                  disabled={!fichaText.trim()}
                  onClick={() => {
                    const parsed = parseFicha(fichaText);
                    const filled: string[] = [];
                    applyDataToState(parsed, developments);
                    if (parsed.nome) filled.push("Nome");
                    if (parsed.cpf) filled.push("CPF");
                    if (parsed.rg) filled.push("RG");
                    if (parsed.nascimento) filled.push("Nascimento");
                    if (parsed.estadoCivil) filled.push("Estado Civil");
                    if (parsed.profissao) filled.push("Profissão");
                    if (parsed.endereco) filled.push("Endereço");
                    if (parsed.bairro) filled.push("Bairro");
                    if (parsed.cidade) filled.push("Cidade");
                    if (parsed.cep) filled.push("CEP");
                    if (parsed.telefone1) filled.push("Telefone");
                    if (parsed.telefone2) filled.push("Telefone 2");
                    if (parsed.empreendimento) filled.push("Empreendimento");
                    if (parsed.quadra) filled.push("Quadra");
                    if (parsed.lote) filled.push("Lote");
                    if (parsed.valorTotal) filled.push("Valor Total");
                    if (parsed.entrada) filled.push("Entrada");
                    if (parsed.numeroParcelas) filled.push("Parcelas");
                    if (parsed.valorParcela) filled.push("Valor Parcela");
                    setFichaFilled(filled);
                    setFichaSuccess(true);
                    if (filled.length > 0) {
                      setTimeout(() => setShowColarFicha(false), 1800);
                    }
                  }}
                  className={`px-8 h-11 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors ${!fichaText.trim() ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-slate-900 hover:bg-primary-main text-white"}`}
                >
                  <ClipboardPaste size={15} />
                  Preencher Campos
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <form ref={vendasFormRef} onSubmit={handleSubmit} className="space-y-8">
        <div className="card-premium">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-slate-100 text-slate-600 rounded-2xl">
              <Users size={22} className="stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-lg font-display font-bold text-slate-800">
                Dados do Proponente
              </h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">
                Identificação e Contato
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="label">Nome Completo do Comprador</label>
                <div className="relative">
                  <input
                    required
                    className="input-field"
                    value={clientData.nome}
                    onChange={(e) => {
                      setClientData({ ...clientData, nome: e.target.value });
                      setShowNameDropdown(true);
                    }}
                    onFocus={() => setShowNameDropdown(true)}
                    onBlur={() => setTimeout(() => setShowNameDropdown(false), 150)}
                    placeholder="Nome Completo"
                    autoComplete="off"
                  />
                  {showNameDropdown && clientData.nome.length >= 2 && (() => {
                    const matches = clients.filter((c) =>
                      c.nome?.toLowerCase().includes(clientData.nome.toLowerCase())
                    ).slice(0, 6);
                    if (!matches.length) return null;
                    return (
                      <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
                        {matches.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={() => {
                              setClientData({ ...clientData, ...c });
                              setShowNameDropdown(false);
                              setShowCpfDropdown(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 last:border-0"
                          >
                            <div className="w-8 h-8 rounded-full bg-primary-main/10 text-primary-main flex items-center justify-center font-black text-xs flex-shrink-0">
                              {c.nome?.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-800 truncate">{c.nome}</p>
                              {c.cpf && <p className="text-xs text-slate-400 font-mono">{c.cpf}</p>}
                            </div>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="w-full sm:w-auto">
                <label className="label">Gênero / Tratamento</label>
                <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      const newGenero = "M";
                      let newEstadoCivil = clientData.estadoCivil;
                      if (newEstadoCivil === "Solteira")
                        newEstadoCivil = "Solteiro";
                      else if (newEstadoCivil === "Casada")
                        newEstadoCivil = "Casado";
                      else if (newEstadoCivil === "Divorciada")
                        newEstadoCivil = "Divorciado";
                      else if (newEstadoCivil === "Viúva")
                        newEstadoCivil = "Viúvo";
                      setClientData({
                        ...clientData,
                        genero: newGenero,
                        estadoCivil: newEstadoCivil,
                      });
                    }}
                    className={`flex-1 sm:px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${clientData.genero === "M" ? "bg-primary-main text-white shadow-md" : "text-slate-400 hover:text-slate-600"}`}
                  >
                    Masc.
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const newGenero = "F";
                      let newEstadoCivil = clientData.estadoCivil;
                      if (newEstadoCivil === "Solteiro")
                        newEstadoCivil = "Solteira";
                      else if (newEstadoCivil === "Casado")
                        newEstadoCivil = "Casada";
                      else if (newEstadoCivil === "Divorciado")
                        newEstadoCivil = "Divorciada";
                      else if (newEstadoCivil === "Viúvo")
                        newEstadoCivil = "Viúva";
                      setClientData({
                        ...clientData,
                        genero: newGenero,
                        estadoCivil: newEstadoCivil,
                      });
                    }}
                    className={`flex-1 sm:px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${clientData.genero === "F" ? "bg-primary-main text-white shadow-md" : "text-slate-400 hover:text-slate-600"}`}
                  >
                    Fem.
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setClientData({ ...clientData, genero: "O" })
                    }
                    className={`flex-1 sm:px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${clientData.genero === "O" ? "bg-primary-main text-white shadow-md" : "text-slate-400 hover:text-slate-600"}`}
                  >
                    Outro
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <div>
              <label className="label">CPF</label>
              <div className="relative">
                <input
                  required
                  className={`input-field font-mono ${cpfErr ? "border-red-400 focus:ring-red-400" : cpfStatus(clientData.cpf) === "valid" ? "border-green-400 focus:ring-green-400" : ""}`}
                  value={clientData.cpf}
                  onChange={(e) => {
                    const masked = maskCPF(e.target.value);
                    setClientData({ ...clientData, cpf: masked });
                    const st = cpfStatus(masked);
                    setCpfErr(st === "invalid" ? "CPF inválido" : null);
                    setShowCpfDropdown(true);
                  }}
                  onFocus={() => setShowCpfDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCpfDropdown(false), 150)}
                  placeholder="000.000.000-00"
                  autoComplete="off"
                />
                {showCpfDropdown && clientData.cpf.replace(/\D/g, "").length >= 3 && (() => {
                  const query = clientData.cpf.replace(/\D/g, "");
                  const matches = clients.filter((c) =>
                    c.cpf?.replace(/\D/g, "").includes(query)
                  ).slice(0, 6);
                  if (!matches.length) return null;
                  return (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
                      {matches.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={() => {
                            setClientData({ ...clientData, ...c });
                            setShowCpfDropdown(false);
                            setShowNameDropdown(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 last:border-0"
                        >
                          <div className="w-8 h-8 rounded-full bg-primary-main/10 text-primary-main flex items-center justify-center font-black text-xs flex-shrink-0">
                            {c.nome?.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">{c.nome}</p>
                            {c.cpf && <p className="text-xs text-slate-400 font-mono">{c.cpf}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
              {cpfErr && <p className="text-red-500 text-xs mt-1 font-medium">{cpfErr}</p>}
              {cpfMatch && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs space-y-2"
                >
                  <p className="font-black text-blue-700 uppercase tracking-widest">
                    👤 Cliente já cadastrado: {cpfMatch.nome}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setClientData({ ...clientData, ...cpfMatch }); setCpfMatch(null); }}
                      className="text-[10px] font-bold uppercase tracking-widest bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Usar dados existentes
                    </button>
                    <button
                      type="button"
                      onClick={() => setCpfMatch(null)}
                      className="text-[10px] font-bold uppercase tracking-widest bg-white text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      Ignorar
                    </button>
                  </div>
                </motion.div>
              )}
              {cpfDuplicates.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs space-y-2"
                >
                  <p className="font-black text-amber-700 uppercase tracking-widest">
                    ⚠️ {cpfDuplicates.length} clientes com este CPF
                  </p>
                  <div className="space-y-1">
                    {cpfDuplicates.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-2">
                        <span className="text-amber-800 font-semibold">{c.nome}</span>
                        <button
                          type="button"
                          onClick={() => setClientData({ ...clientData, ...c })}
                          className="text-[9px] font-bold uppercase tracking-widest bg-amber-600 text-white px-2 py-1 rounded-lg hover:bg-amber-700 transition-colors"
                        >
                          Usar este
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setMergeTargetId(cpfDuplicates[0].id); setShowMergeModal(true); }}
                    className="text-[10px] font-bold uppercase tracking-widest bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 transition-colors w-full text-center"
                  >
                    Mesclar clientes duplicados
                  </button>
                </motion.div>
              )}
            </div>
            <div>
              <label className="label">RG</label>
              <input
                required
                className={`input-field font-mono ${rgErr ? "border-red-400 focus:ring-red-400" : rgStatus(clientData.rg) === "valid" ? "border-green-400 focus:ring-green-400" : ""}`}
                value={clientData.rg}
                onChange={(e) => {
                  const masked = maskRG(e.target.value);
                  setClientData({ ...clientData, rg: masked });
                  const st = rgStatus(masked);
                  setRgErr(st === "invalid" ? "RG inválido ou incompleto" : null);
                }}
                placeholder="Ex: 12.345.678-9"
              />
              {rgErr && <p className="text-red-500 text-xs mt-1 font-medium">{rgErr}</p>}
            </div>
            <div>
              <label className="label">Estado Civil</label>
              <select
                className="input-field font-semibold"
                value={clientData.estadoCivil}
                onChange={(e) =>
                  setClientData({ ...clientData, estadoCivil: e.target.value })
                }
              >
                <option>
                  {clientData.genero === "F" ? "Solteira" : "Solteiro"}
                </option>
                <option>
                  {clientData.genero === "F" ? "Casada" : "Casado"}
                </option>
                <option>
                  {clientData.genero === "F" ? "Divorciada" : "Divorciado"}
                </option>
                <option>{clientData.genero === "F" ? "Viúva" : "Viúvo"}</option>
                <option>União Estável</option>
              </select>
            </div>
            <div>
              <label className="label">Aniversário (Data Nascimento)</label>
              <input
                type="date"
                required
                className="input-field font-semibold"
                value={clientData.nascimento}
                onChange={(e) =>
                  setClientData({ ...clientData, nascimento: e.target.value })
                }
              />
            </div>
            <div>
              <label className="label">CEP</label>
              <input
                required
                className="input-field font-mono"
                value={clientData.cep}
                onChange={(e) => {
                  const value = maskCEP(e.target.value);
                  setClientData({ ...clientData, cep: value });
                  buscarCEP(value);
                }}
                placeholder="00000-000"
              />
            </div>
            <div className="md:col-span-1">
              <label className="label">Endereço</label>
              <input
                required
                className="input-field"
                value={clientData.endereco}
                onChange={(e) =>
                  setClientData({ ...clientData, endereco: e.target.value })
                }
                placeholder="Rua / Travessa"
              />
            </div>
            <div>
              <label className="label">Nº</label>
              <input
                required
                className="input-field font-bold"
                value={clientData.numero}
                onChange={(e) =>
                  setClientData({ ...clientData, numero: e.target.value })
                }
                placeholder="0"
              />
            </div>
            <div>
              <label className="label">Bairro</label>
              <input
                required
                className="input-field"
                value={clientData.bairro}
                onChange={(e) =>
                  setClientData({ ...clientData, bairro: e.target.value })
                }
                placeholder="Bairro"
              />
            </div>
            <div className="hidden">
              <label className="label">Cidade / UF (Auto)</label>
              <div className="flex gap-2">
                <input
                  className="input-field flex-1"
                  value={clientData.cidade}
                  readOnly
                />
                <input
                  className="input-field w-16 text-center font-bold"
                  value={clientData.estado}
                  readOnly
                />
              </div>
            </div>
            <div>
              <label className="label">Contato Principal</label>
              <input
                required
                className="input-field font-semibold"
                value={clientData.telefone1}
                onChange={(e) =>
                  setClientData({
                    ...clientData,
                    telefone1: maskPhone(e.target.value),
                  })
                }
                placeholder="(00) 00000-0000"
              />
            </div>
            <div>
              <label className="label">Contato Secundário</label>
              <input
                className="input-field"
                value={clientData.telefone2}
                onChange={(e) =>
                  setClientData({
                    ...clientData,
                    telefone2: maskPhone(e.target.value),
                  })
                }
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>

          {/* --- Segundo Comprador --- */}
          <div className="mt-8 pt-8 border-t border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-50 text-slate-400 rounded-xl">
                  <Users size={18} />
                </div>
                <h4 className="font-bold text-slate-700">
                  Segundo Comprador (Adicional)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setHasSecondBuyer(!hasSecondBuyer)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all font-bold text-xs uppercase tracking-widest ${hasSecondBuyer ? "bg-primary-main/10 border-primary-main text-primary-main" : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"}`}
              >
                {hasSecondBuyer ? "Remover" : "Adicionar"}
              </button>
            </div>

            {hasSecondBuyer && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-6 overflow-hidden"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2 flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <label className="label">Nome Completo</label>
                      <input
                        required
                        className="input-field"
                        value={secondBuyerData?.nome}
                        onChange={(e) =>
                          setSecondBuyerData({
                            ...secondBuyerData!,
                            nome: e.target.value,
                          })
                        }
                        placeholder="Nome Completo"
                      />
                    </div>
                    <div className="w-full sm:w-auto">
                      <label className="label">Gênero</label>
                      <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                        {(["M", "F", "O"] as const).map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => {
                              let newEC =
                                secondBuyerData?.estadoCivil || "Solteiro(a)";
                              if (g === "M") {
                                if (newEC === "Solteira") newEC = "Solteiro";
                                else if (newEC === "Casada") newEC = "Casado";
                                else if (newEC === "Divorciada")
                                  newEC = "Divorciado";
                                else if (newEC === "Viúva") newEC = "Viúvo";
                              } else if (g === "F") {
                                if (newEC === "Solteiro") newEC = "Solteira";
                                else if (newEC === "Casado") newEC = "Casada";
                                else if (newEC === "Divorciado")
                                  newEC = "Divorciada";
                                else if (newEC === "Viúvo") newEC = "Viúva";
                              }
                              setSecondBuyerData({
                                ...secondBuyerData!,
                                genero: g,
                                estadoCivil: newEC,
                              });
                            }}
                            className={`flex-1 sm:px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all ${secondBuyerData?.genero === g ? "bg-primary-main text-white" : "text-slate-400"}`}
                          >
                            {g === "M" ? "Masc." : g === "F" ? "Fem." : "Outro"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-4">
                  <div>
                    <label className="label">CPF</label>
                    <input
                      required
                      className={`input-field font-mono ${cpf2Err ? "border-red-400 focus:ring-red-400" : cpfStatus(secondBuyerData?.cpf || "") === "valid" ? "border-green-400 focus:ring-green-400" : ""}`}
                      value={secondBuyerData?.cpf}
                      onChange={(e) => {
                        const masked = maskCPF(e.target.value);
                        setSecondBuyerData({ ...secondBuyerData!, cpf: masked });
                        const st = cpfStatus(masked);
                        setCpf2Err(st === "invalid" ? "CPF inválido" : null);
                      }}
                      placeholder="000.000.000-00"
                    />
                    {cpf2Err && <p className="text-red-500 text-xs mt-1 font-medium">{cpf2Err}</p>}
                  </div>
                  <div>
                    <label className="label">RG</label>
                    <input
                      required
                      className={`input-field font-mono ${rg2Err ? "border-red-400 focus:ring-red-400" : rgStatus(secondBuyerData?.rg || "") === "valid" ? "border-green-400 focus:ring-green-400" : ""}`}
                      value={secondBuyerData?.rg}
                      onChange={(e) => {
                        const masked = maskRG(e.target.value);
                        setSecondBuyerData({ ...secondBuyerData!, rg: masked });
                        const st = rgStatus(masked);
                        setRg2Err(st === "invalid" ? "RG inválido ou incompleto" : null);
                      }}
                      placeholder="Ex: 12.345.678-9"
                    />
                    {rg2Err && <p className="text-red-500 text-xs mt-1 font-medium">{rg2Err}</p>}
                  </div>
                  <div>
                    <label className="label">Nacionalidade</label>
                    <input
                      required
                      className="input-field"
                      value={secondBuyerData?.nacionalidade}
                      onChange={(e) =>
                        setSecondBuyerData({
                          ...secondBuyerData!,
                          nacionalidade: e.target.value,
                        })
                      }
                      placeholder="Brasileira"
                    />
                  </div>
                  <div>
                    <label className="label">Estado Civil</label>
                    <select
                      className="input-field font-semibold"
                      value={secondBuyerData?.estadoCivil}
                      onChange={(e) =>
                        setSecondBuyerData({
                          ...secondBuyerData!,
                          estadoCivil: e.target.value,
                        })
                      }
                    >
                      <option>
                        {secondBuyerData?.genero === "F"
                          ? "Solteira"
                          : "Solteiro"}
                      </option>
                      <option>
                        {secondBuyerData?.genero === "F" ? "Casada" : "Casado"}
                      </option>
                      <option>
                        {secondBuyerData?.genero === "F"
                          ? "Divorciada"
                          : "Divorciado"}
                      </option>
                      <option>
                        {secondBuyerData?.genero === "F" ? "Viúva" : "Viúvo"}
                      </option>
                      <option>União Estável</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Aniversário</label>
                    <input
                      type="date"
                      required
                      className="input-field"
                      value={secondBuyerData?.nascimento}
                      onChange={(e) =>
                        setSecondBuyerData({
                          ...secondBuyerData!,
                          nascimento: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        <div className="card-premium border-primary-light/10 bg-primary-light/[0.02]">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-primary-main/10 text-primary-main rounded-2xl">
              <Package size={22} className="stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-lg font-display font-bold text-slate-800">
                Negociação e Pagamento
              </h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">
                Dados Comerciais
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="sm:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <label className="label">Empreendimento Alvo</label>
                <button
                  type="button"
                  onClick={() => setShowNovoDev(true)}
                  className="text-[11px] font-bold text-primary-main hover:underline flex items-center gap-1"
                >
                  <Plus size={13} /> Cadastrar novo
                </button>
              </div>
              <select
                required
                className="input-field font-bold text-primary-main"
                value={saleData.empreendimentoId}
                onChange={(e) =>
                  setSaleData({ ...saleData, empreendimentoId: e.target.value })
                }
              >
                <option value="">Escolha um loteamento...</option>
                {developments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome} — {d.totalLotes - d.lotesVendidos} livres
                  </option>
                ))}
              </select>

              {/* Mini modal: cadastrar empreendimento inline */}
              <AnimatePresence>
                {showNovoDev && (
                  <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-white w-full max-w-lg rounded-[28px] shadow-2xl flex flex-col overflow-hidden"
                    >
                      <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-primary-main rounded-xl text-primary-contrast">
                            <Building2 size={20} />
                          </div>
                          <h3 className="text-lg font-display font-bold text-slate-800">Novo Empreendimento</h3>
                        </div>
                        <button type="button" onClick={() => setShowNovoDev(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                          <X size={20} className="text-slate-500" />
                        </button>
                      </div>
                      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <label className="label">Nome do Empreendimento *</label>
                          <input className="input-field" placeholder="Ex: Loteamento Villa Nova" value={novoDevData.nome} onChange={(e) => setNovoDevData({ ...novoDevData, nome: e.target.value })} />
                        </div>
                        <div>
                          <label className="label">Comunidade / Região</label>
                          <input className="input-field" placeholder="Ex: Centro, Vila Nova" value={novoDevData.comunidade} onChange={(e) => setNovoDevData({ ...novoDevData, comunidade: e.target.value })} />
                        </div>
                        <div>
                          <label className="label">Total de Lotes</label>
                          <input type="number" className="input-field" placeholder="0" value={novoDevData.totalLotes || ""} onChange={(e) => setNovoDevData({ ...novoDevData, totalLotes: Number(e.target.value) })} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="label">Quadras</label>
                          <input className="input-field" placeholder="Ex: A, B, C" value={novoDevData.quadras} onChange={(e) => setNovoDevData({ ...novoDevData, quadras: e.target.value })} />
                          <p className="text-[10px] text-slate-400 mt-1">As ruas por quadra podem ser definidas no cadastro completo do empreendimento.</p>
                        </div>
                      </div>
                      <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
                        <button type="button" onClick={() => setShowNovoDev(false)} className="btn-secondary px-6">Cancelar</button>
                        <button type="button" onClick={handleSalvarNovoDev} className="btn-primary px-8">Salvar e Selecionar</button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              {saleData.empreendimentoId && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-surface-card border border-border-subtle rounded-2xl space-y-2"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Informações de Apoio
                      </p>
                      <h4 className="font-bold text-slate-800">
                        {
                          developments.find(
                            (d) => d.id === saleData.empreendimentoId,
                          )?.nome
                        }
                      </h4>
                    </div>
                    <div className="px-2 py-1 bg-primary-main/10 text-primary-main text-[10px] font-bold rounded-lg uppercase">
                      {developments.find(
                        (d) => d.id === saleData.empreendimentoId,
                      )?.comunidade || "Geral"}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <p>
                      <span className="font-bold text-slate-500">Quadras:</span>{" "}
                      {developments.find((d) => d.id === saleData.empreendimentoId)?.quadras || "Não informada"}
                    </p>
                    {(() => {
                      const dev = developments.find((d) => d.id === saleData.empreendimentoId);
                      const q = saleData.quadra?.trim();
                      const sugestao = q && dev ? getRuaSugerida(dev, q, saleData.numeroLote) : null;
                      const fallback = dev?.ruas || null;
                      return sugestao ? (
                        <p><span className="font-bold text-slate-500">Rua prevista:</span>{" "}<span className="text-primary-main font-bold">{sugestao}</span></p>
                      ) : fallback ? (
                        <p><span className="font-bold text-slate-500">Ruas:</span>{" "}{fallback}</p>
                      ) : null;
                    })()}
                  </div>
                </motion.div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:col-span-2">
              <div>
                <label className="label">Lote</label>
                <input
                  required
                  className="input-field font-mono font-bold"
                  value={saleData.numeroLote}
                  onChange={(e) =>
                    setSaleData({ ...saleData, numeroLote: e.target.value })
                  }
                  placeholder="0"
                />
              </div>
              <div>
                <label className="label">Quadra</label>
                <input
                  required
                  list="quadras-list"
                  className="input-field font-mono font-bold"
                  value={saleData.quadra}
                  onChange={(e) =>
                    setSaleData({ ...saleData, quadra: e.target.value })
                  }
                  placeholder="A"
                />
                <datalist id="quadras-list">
                  {developments
                    .find((d) => d.id === saleData.empreendimentoId)
                    ?.quadras?.split(",")
                    .map((q) => (
                      <option key={q.trim()} value={q.trim()} />
                    ))}
                </datalist>
              </div>
            </div>

            {/* Aviso: lote já vendido */}
            {(() => {
              if (!saleData.empreendimentoId || !saleData.quadra || !saleData.numeroLote) return null;
              const vendaExistente = sales.find(v =>
                v.id !== editingEntry?.venda?.id &&
                v.empreendimentoId === saleData.empreendimentoId &&
                v.quadra.toUpperCase() === saleData.quadra.toUpperCase() &&
                v.numeroLote === saleData.numeroLote &&
                v.status !== 'cancelado'
              );
              if (!vendaExistente) return null;
              return (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="sm:col-span-2 flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4"
                >
                  <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-black text-red-700 text-sm uppercase tracking-wide">
                      ⚠️ Lote já vendido!
                    </p>
                    <p className="text-xs text-red-600 mt-1">
                      Quadra <strong>{vendaExistente.quadra}</strong> · Lote <strong>{vendaExistente.numeroLote}</strong> já está registrado para <strong>{vendaExistente.clienteNome}</strong> (contrato {vendaExistente.numeroContrato}, status: <strong>{vendaExistente.status || 'pendente'}</strong>). Confira antes de prosseguir.
                    </p>
                  </div>
                </motion.div>
              );
            })()}

            <div className="space-y-6 lg:col-span-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="label font-bold text-primary-main">
                    Valor Total
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field border-primary-main/20 bg-primary-main/[0.02] font-display font-bold text-lg"
                    value={saleData.valorLote ?? ""}
                    onChange={(e) =>
                      handleValueChange(
                        "valorLote",
                        e.target.value === "" ? 0 : Number(e.target.value),
                      )
                    }
                  />
                </div>
                <div className={tipoVenda === 'avista' ? 'hidden' : ''}>
                  <label className="label">Entrada</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field font-display font-bold text-lg"
                    value={saleData.valorEntrada ?? ""}
                    onChange={(e) =>
                      handleValueChange(
                        "valorEntrada",
                        e.target.value === "" ? 0 : Number(e.target.value),
                      )
                    }
                  />
                </div>
                {/* Toggle À Vista / Parcelado */}
                <div className="sm:col-span-2">
                  <label className="label">Tipo de Pagamento</label>
                  <div className="flex rounded-xl overflow-hidden border border-slate-200 w-fit text-sm font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        setTipoVenda('avista');
                        setSaleData({ ...saleData, quantidadeParcelas: 0, valorParcela: 0, dataVencimento: "" });
                      }}
                      className={`px-6 py-2.5 transition-colors ${tipoVenda === 'avista' ? 'bg-primary-main text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                      À Vista
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTipoVenda('parcelado');
                        setSaleData({ ...saleData, quantidadeParcelas: undefined, dataVencimento: defaultVencimento() });
                      }}
                      className={`px-6 py-2.5 transition-colors ${tipoVenda === 'parcelado' ? 'bg-primary-main text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                      Parcelado
                    </button>
                  </div>
                </div>

                {/* Modo de pagamento à vista */}
                {tipoVenda === 'avista' && (
                  <div className="sm:col-span-2">
                    <label className="label">Modo de Pagamento</label>
                    <div className="flex flex-wrap gap-3">
                      {[
                        {
                          value: 'dinheiro', label: 'Dinheiro',
                          icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/><circle cx="12" cy="16" r="2"/></svg>
                        },
                        {
                          value: 'pix', label: 'PIX',
                          icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                        },
                        {
                          value: 'cheque', label: 'Cheque',
                          icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg>
                        },
                        {
                          value: 'permuta', label: 'Permuta',
                          icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l5.1 5.1"/><path d="M4 4l5 5"/></svg>
                        },
                        {
                          value: 'outro', label: 'Outro',
                          icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        },
                      ].map((modo) => (
                        <button
                          key={modo.value}
                          type="button"
                          onClick={() => setSaleData({ ...saleData, modoAvista: modo.value as any })}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                            saleData.modoAvista === modo.value
                              ? 'bg-primary-main text-white shadow-lg shadow-primary-main/30'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {modo.icon}
                          {modo.label}
                        </button>
                      ))}
                    </div>
                    
                    {/* Campo de descrição para Permuta ou Outro */}
                    {(saleData.modoAvista === 'permuta' || saleData.modoAvista === 'outro') && (
                      <div className="mt-4">
                        <label className="label">
                          {saleData.modoAvista === 'permuta' ? 'Descrição do bem (ex: Carro Gol 2015)' : 'Descreva a forma de pagamento'}
                        </label>
                        <textarea
                          className="input-field min-h-[80px] resize-none"
                          placeholder={saleData.modoAvista === 'permuta' 
                            ? 'Ex: Carro Fiat Uno 2010, avaliado em R$ 15.000,00'
                            : 'Ex: Metade em dinheiro, metade em cheque'
                          }
                          value={saleData.descricaoAvista || ''}
                          onChange={(e) => setSaleData({ ...saleData, descricaoAvista: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                )}

                {tipoVenda === 'parcelado' && (<>
                <div>
                  <label className="label">Quantidade de Parcelas</label>
                  <input
                    type="number"
                    className="input-field font-bold text-lg"
                    value={saleData.quantidadeParcelas ?? ""}
                    onChange={(e) =>
                      handleValueChange(
                        "quantidadeParcelas",
                        e.target.value === "" ? 1 : Number(e.target.value),
                      )
                    }
                  />
                </div>
                <div>
                  <label className="label font-bold text-chumbo-base opacity-70">
                    Valor da Parcela
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field border-chumbo-base/20 bg-chumbo-base/[0.02] font-display font-bold text-lg"
                    value={saleData.valorParcela || ""}
                    onChange={(e) =>
                      handleValueChange(
                        "valorParcela",
                        e.target.value === "" ? 0 : Number(e.target.value),
                      )
                    }
                  />
                </div>
                </>)}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {tipoVenda === 'parcelado' && (
                <div>
                  <label className="label">Data de Vencimento</label>
                  <div className="relative">
                    <Calendar
                      size={18}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <input
                      type="date"
                      className="input-field pl-12 font-bold"
                      value={saleData.dataVencimento}
                      onChange={(e) =>
                        setSaleData({
                          ...saleData,
                          dataVencimento: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                )}
                {vendedores.length > 0 && (
                  <div>
                    <label className="label">Vendedor</label>
                    <select
                      className="input-field font-semibold"
                      value={saleData.vendedorId || ""}
                      onChange={(e) => {
                        const v = vendedores.find(x => x.id === e.target.value);
                        setSaleData({ ...saleData, vendedorId: e.target.value, vendedor: v?.nome || "" });
                      }}
                    >
                      <option value="">Selecionar vendedor...</option>
                      {vendedores.map((v) => (
                        <option key={v.id} value={v.id}>{v.nome}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-2 flex flex-col gap-6">
              <div className="bg-surface-card/60 backdrop-blur-sm p-8 rounded-3xl border border-border-subtle flex-1 flex flex-col justify-center shadow-inner">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-4 text-center">
                  Resumo da Negociação
                </p>

                <div className="space-y-6">
                  {tipoVenda === 'avista' ? (
                    <div className="flex justify-between items-center border-b border-slate-50 pb-4">
                      <span className="text-sm font-medium text-slate-500">Pagamento</span>
                      <span className="text-xl font-display font-bold text-emerald-600 bg-emerald-50 px-4 py-1.5 rounded-xl">À Vista</span>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center border-b border-slate-50 pb-4">
                      <span className="text-sm font-medium text-slate-500">
                        Valor da Mensalidade
                      </span>
                      <p className="text-3xl font-display font-bold text-primary-main">
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(saleData.valorParcela || 0)}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    {tipoVenda !== 'avista' && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                        Saldo Financiado
                      </p>
                      <p className="font-display font-bold text-slate-700">
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(
                          (saleData.valorLote || 0) - (saleData.valorEntrada || 0),
                        )}
                      </p>
                    </div>
                    )}
                    <div className={`space-y-1 ${tipoVenda !== 'avista' ? 'text-right' : 'col-span-2'}`}>
                      <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                        Total Líquido
                      </p>
                      <p className="font-display font-bold text-slate-700">
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(saleData.valorLote || 0)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button type="button" className="btn-ghost w-full" onClick={() => {
                  const key = 'venda_rascunho';
                  localStorage.setItem(key, JSON.stringify({ clientData, saleData }));
                  setHasDraft(true);
                  alert('Rascunho salvo!');
                }}>
                  <FileText size={18} />
                  <span>Salvar Rascunho</span>
                </button>
                {hasDraft && (
                  <button type="button" className="btn-ghost w-full border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => {
                    const key = 'venda_rascunho';
                    const saved = localStorage.getItem(key);
                    if (!saved) return;
                    const { clientData: cd, saleData: sd } = JSON.parse(saved);
                    if (cd) setClientData((prev) => ({ ...prev, ...cd }));
                    if (sd) setSaleData((prev) => ({ ...prev, ...sd }));
                  }}>
                    <FileText size={18} />
                    <span>Restaurar</span>
                  </button>
                )}
                <button
                  type="submit"
                  className={`btn-primary w-full shadow-lg shadow-primary-main/20 ${hasDraft ? '' : 'sm:col-span-2'}`}
                >
                  <ShoppingCart size={18} />
                  <span>{editingEntry ? 'Salvar Alterações' : 'Finalizar Venda'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

const ContratosSection = ({
  sales,
  clients,
  developments,
  initialVenda,
  onUpdateStatus,
  onSaveVenda,
  onDeleteVenda,
  onUpdateVenda,
  vendedores = [],
  proprietarios = [],
  onEditVenda,
  onUpdateProprietario,
  onClearInitialVenda,
  userProfile,
}: {
  sales: Venda[];
  clients: Cliente[];
  developments: Empreendimento[];
  initialVenda?: Venda | null;
  onUpdateStatus: (id: string, s: "pendente" | "pago" | "cancelado") => void;
  onSaveVenda: (v: Venda, c: Cliente) => void;
  onDeleteVenda: (id: string) => void;
  onUpdateVenda: (v: Venda) => void;
  vendedores?: Vendedor[];
  proprietarios?: Proprietario[];
  initialMode?: 'recibo';
  onUpdateProprietario?: (p: Proprietario) => void;
  onEditVenda?: (v: Venda) => void;
  onClearInitialVenda?: () => void;
  userProfile?: { nome?: string; creci?: string; telefone?: string };
}) => {
  const [selectedVenda, setSelectedVenda] = useState<Venda | null>(
    initialVenda || null,
  );
  const [showReciboModal, setShowReciboModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [corretorFilter, setCorretorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [empFilter, setEmpFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sortBy, setSortBy] = useState<"data_desc" | "data_asc" | "valor_desc" | "valor_asc" | "nome_asc" | "emp_asc" | "status_asc" | "corretor_asc">("data_desc");
  const [showRanking, setShowRanking] = useState(false);
  const [viewMode, setViewMode] = useState<"contract" | "receipt">("contract");
  const [showNovoContrato, setShowNovoContrato] = useState(false);
  const [clienteMode, setClienteMode] = useState<"existente" | "novo">("existente");
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState("");
  const [editingVenda, setEditingVenda] = useState<Venda | null>(null);
  const [editVendaForm, setEditVendaForm] = useState<Partial<Venda>>({});
  const [novoCliente, setNovoCliente] = useState<Partial<Cliente>>({
    genero: "M", nacionalidade: "brasileiro", estadoCivil: "solteiro",
  });
  const { request: requestDelete, Modal: DeleteModal } = useDeleteConfirm();
  const emptyContrato = {
    empreendimentoId: "", quadra: "", numeroLote: "", rua: "",
    valorLote: 0, valorEntrada: 0, quantidadeParcelas: 1, valorParcela: 0,
    dataVencimento: defaultVencimento(), formaPagamento: "Dinheiro", vendedor: "", vendedorId: "",
    dataVenda: new Date().toISOString().split("T")[0],
  };
  const [contratoData, setContratoData] = useState(emptyContrato);
  const [tipoContrato, setTipoContrato] = useState<'avista' | 'parcelado'>('parcelado');
  const [ruaWarning, setRuaWarning] = useState<string | null>(null);
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [gerarStep, setGerarStep] = useState(0);
  const [showDuplicarModal, setShowDuplicarModal] = useState(false);
  const [pendingEditVenda, setPendingEditVenda] = useState<Venda | null>(null);

  useEffect(() => {
    if (!contratoData.empreendimentoId || !contratoData.quadra || !contratoData.numeroLote) {
      setRuaWarning(null);
      return;
    }
    const dev = developments.find((d) => d.id === contratoData.empreendimentoId);
    const key = `${contratoData.quadra}-${contratoData.numeroLote}`.toUpperCase();
    const lotInfo = dev?.lotesInfo?.[key];
    if (lotInfo?.rua) {
      const ruaSistema = lotInfo.rua;
      if (!contratoData.rua) {
        setContratoData((prev) => ({ ...prev, rua: ruaSistema }));
        setRuaWarning(null);
      } else if (contratoData.rua.trim().toLowerCase() !== ruaSistema.trim().toLowerCase()) {
        setRuaWarning(`A rua do sistema para este lote é "${ruaSistema}". Verifique se está correta.`);
      } else {
        setRuaWarning(null);
      }
    } else {
      setRuaWarning(null);
    }
  }, [contratoData.empreendimentoId, contratoData.quadra, contratoData.numeroLote, contratoData.rua, developments]);

  const emptyGerarVendedor = {
    nome: "", nacionalidade: "brasileiro", estadoCivil: "Solteiro(a)",
    rg: "", cpf: "", endereco: "", numero: "", bairro: "", cidade: "", estado: "", cep: "",
  };
  const [showGerarModal, setShowGerarModal] = useState(false);
  const [gerarProprietarioId, setGerarProprietarioId] = useState("");
  const [gerarVendedor, setGerarVendedor] = useState(emptyGerarVendedor);
  const [gerarExtra, setGerarExtra] = useState({
    rua: "", comunidade: "", formaPagamento: "Dinheiro",
    medidaFrente: "", medidaLateralDir: "", medidaLateralEsq: "", medidaFundos: "", areaTotal: "",
  });
  const [gerarEmp, setGerarEmp] = useState({ nome: "", comunidade: "", cidade: "", estado: "" });
  const [fetchingCep, setFetchingCep] = useState(false);

  const fetchCepGerar = async (cep: string) => {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setFetchingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setGerarVendedor((prev) => ({
          ...prev,
          endereco: data.logradouro || prev.endereco,
          bairro: data.bairro || prev.bairro,
          cidade: data.localidade || prev.cidade,
          estado: data.uf || prev.estado,
        }));
      }
    } catch { /* ignore */ } finally {
      setFetchingCep(false);
    }
  };

  const handleOpenGerarContrato = () => {
    if (!selectedVenda) return;
    const dev = developments.find((d) => d.id === selectedVenda.empreendimentoId);
    setGerarProprietarioId("");
    setGerarVendedor(emptyGerarVendedor);
    setGerarEmp({
      nome: dev?.nome || "",
      comunidade: dev?.comunidade || "",
      cidade: dev?.cidade || "",
      estado: dev?.estado || "",
    });
    setGerarExtra({
      rua: selectedVenda.rua || "",
      comunidade: dev?.comunidade || "",
      formaPagamento: selectedVenda.formaPagamento || "Dinheiro",
      medidaFrente: selectedVenda.medidaFrente || "",
      medidaLateralDir: selectedVenda.medidaLateralDir || "",
      medidaLateralEsq: selectedVenda.medidaLateralEsq || "",
      medidaFundos: selectedVenda.medidaFundos || "",
      areaTotal: selectedVenda.areaTotal || "",
    });
    setGerarStep(0);
    setShowGerarModal(true);
  };

  const handleSelectProprietario = (propId: string) => {
    setGerarProprietarioId(propId);
    const prop = proprietarios.find((p) => p.id === propId);
    if (prop) {
      setGerarVendedor({
        nome: prop.nome,
        nacionalidade: prop.nacionalidade || "brasileiro",
        estadoCivil: prop.estadoCivil || "Solteiro(a)",
        rg: prop.rg || "",
        cpf: prop.cpf || "",
        endereco: prop.endereco || "",
        numero: prop.numero || "",
        bairro: prop.bairro || "",
        cidade: prop.cidade || "",
        estado: prop.estado || "",
        cep: prop.cep || "",
      });
    } else {
      setGerarVendedor(emptyGerarVendedor);
    }
  };

  const handleDownloadDocx = async () => {
    if (!selectedVenda) return;
    if (!gerarVendedor.nome.trim()) { alert("Informe o nome do vendedor."); return; }
    const cliente = clients.find((c) => c.id === selectedVenda.clienteId);
    const desenvolvimento = developments.find((d) => d.id === selectedVenda.empreendimentoId);
    if (!cliente) { alert("Cliente não encontrado para este contrato."); return; }
    if (!desenvolvimento) { alert("Empreendimento não encontrado."); return; }

    setShowGerarModal(false);
    setDownloadingDocx(true);
    
    // Determina qual endpoint usar baseado no tipo de contrato
    const endpoint = tipoContrato === 'avista' 
      ? "/api/contrato/avista-padrao" 
      : "/api/contrato/parcelado-padrao";
    
    try {
      const res = await authFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({
          vendedor: gerarVendedor,
          cliente,
          empreendimento: { nome: gerarEmp.nome || desenvolvimento.nome, comunidade: gerarEmp.comunidade || gerarExtra.comunidade, cidade: gerarEmp.cidade || desenvolvimento.cidade, estado: gerarEmp.estado || desenvolvimento.estado },
          venda: {
            numeroLote: selectedVenda.numeroLote,
            quadra: selectedVenda.quadra,
            rua: gerarExtra.rua,
            valorLote: selectedVenda.valorLote,
            valorEntrada: selectedVenda.valorEntrada,
            quantidadeParcelas: selectedVenda.quantidadeParcelas,
            valorParcela: selectedVenda.valorParcela,
            dataVencimento: selectedVenda.dataVencimento,
            dataVenda: selectedVenda.dataVenda,
            formaPagamento: gerarExtra.formaPagamento,
            medidaFrente: gerarExtra.medidaFrente,
            medidaLateralDir: gerarExtra.medidaLateralDir,
            medidaLateralEsq: gerarExtra.medidaLateralEsq,
            medidaFundos: gerarExtra.medidaFundos,
            areaTotal: gerarExtra.areaTotal,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert("Erro: " + (err.error || "Falha ao gerar contrato."));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const nomeCliente = cliente.nome.replace(/\s+/g, "_");
      const nomeEmp = desenvolvimento.nome.replace(/\s+/g, "_").toUpperCase();
      a.href = url;
      a.download = `contrato_-_${nomeCliente}_-_${nomeEmp}_-_Lote_${selectedVenda.numeroLote}_-_Quadra__${selectedVenda.quadra}_.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onUpdateVenda({ ...selectedVenda, contratoGerado: true });
    } catch (e: any) {
      alert("Erro ao gerar contrato: " + e.message);
    } finally {
      setDownloadingDocx(false);
    }
  };

  const handleSalvarContrato = () => {
    let cliente: Cliente;
    if (clienteMode === "existente") {
      const found = clients.find((c) => c.id === clienteSelecionadoId);
      if (!found) { alert("Selecione um cliente existente."); return; }
      cliente = found;
    } else {
      if (!novoCliente.nome || !novoCliente.cpf) { alert("Preencha ao menos Nome e CPF do cliente."); return; }
      cliente = {
        id: `cli-${Date.now()}`,
        nome: novoCliente.nome || "",
        nacionalidade: novoCliente.nacionalidade || "brasileiro",
        genero: (novoCliente.genero as "M" | "F" | "O") || "M",
        rg: novoCliente.rg || "",
        cpf: novoCliente.cpf || "",
        estadoCivil: novoCliente.estadoCivil || "solteiro",
        profissao: novoCliente.profissao || "",
        nascimento: novoCliente.nascimento || "",
        cep: novoCliente.cep || "",
        endereco: novoCliente.endereco || "",
        numero: novoCliente.numero || "",
        bairro: novoCliente.bairro || "",
        cidade: novoCliente.cidade || "",
        estado: novoCliente.estado || "",
        telefone1: novoCliente.telefone1 || "",
        dataCadastro: new Date().toISOString(),
      };
    }
    const dev = developments.find((d) => d.id === contratoData.empreendimentoId);
    const venda: Venda = {
      id: `venda-${Date.now()}`,
      numeroContrato: `CONT-${Date.now()}`,
      clienteId: cliente.id,
      clienteNome: cliente.nome,
      empreendimentoId: contratoData.empreendimentoId,
      empreendimentoNome: dev?.nome || "",
      numeroLote: contratoData.numeroLote,
      quadra: contratoData.quadra,
      rua: contratoData.rua,
      valorLote: contratoData.valorLote,
      valorEntrada: contratoData.valorEntrada,
      quantidadeParcelas: contratoData.quantidadeParcelas,
      valorParcela: contratoData.valorParcela,
      dataVencimento: contratoData.dataVencimento,
      vendedor: contratoData.vendedor,
      vendedorId: contratoData.vendedorId,
      dataVenda: contratoData.dataVenda,
      custo: 0,
      comissao: 0,
      formaPagamento: contratoData.formaPagamento,
      status: "pendente",
    };
    onSaveVenda(venda, cliente);
    setShowNovoContrato(false);
    setContratoData(emptyContrato);
    setNovoCliente({ genero: "M", nacionalidade: "brasileiro", estadoCivil: "solteiro" });
    setClienteSelecionadoId("");
    setSelectedVenda(venda);
    setViewMode("contract");
  };

  useEffect(() => {
    if (initialVenda) {
      setSelectedVenda(initialVenda);
      setViewMode("contract");
      onClearInitialVenda?.();
    }
  }, [initialVenda]);

  // Sincroniza tipoContrato sempre que selectedVenda mudar
  useEffect(() => {
    if (selectedVenda) {
      setTipoContrato(selectedVenda.quantidadeParcelas === 0 ? 'avista' : 'parcelado');
    }
  }, [selectedVenda]);

  const reciboRef = useRef<HTMLDivElement>(null);
  const [reciboDownloading, setReciboDownloading] = useState<'img' | 'pdf' | null>(null);

  const handlePrint = () => {
    if (!reciboRef.current) {
      alert('Recibo não encontrado. Aguarde um momento e tente novamente.');
      return;
    }
    // Cria overlay temporário na própria página para impressão
    const overlay = document.createElement('div');
    overlay.id = 'print-recibo-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:white;padding:1rem;overflow:auto;';
    overlay.innerHTML = `<div style="max-width:21cm;margin:0 auto;">${reciboRef.current.outerHTML}</div>`;
    document.body.appendChild(overlay);
    window.print();
    document.body.removeChild(overlay);
  };

  const buildReciboPopupHTML = () => {
    if (!selectedVenda) throw new Error('Venda não encontrada.');
    const clienteNome = selectedVenda.clienteNome || '___________________________';
    const clienteCpf = client?.cpf || '___.___.___-__';
    const empreendimento = selectedVenda.empreendimentoNome || '';
    const quadra = selectedVenda.quadra || '';
    const lote = selectedVenda.numeroLote || '';
    const rua = selectedVenda.rua || '';
    const vendedor = selectedVenda.vendedor || '___________________________';
    const valor = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedVenda.valorEntrada || 0);
    const dataFormatada = new Date(selectedVenda.dataVenda).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Recibo</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { margin: 0; padding: 0; background: #ffffff; font-family: Arial, Helvetica, sans-serif; }
    #recibo-root { padding: 32px; background: #ffffff; max-width: 21cm; margin: 0 auto; }
    .recibo-card { background: #ffffff; padding: 64px; border: 1px solid #e2e8f0; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 4px solid #0f172a; padding-bottom: 32px; margin-bottom: 48px; }
    .titulo { font-size: 36px; font-weight: 900; font-style: italic; letter-spacing: -1px; color: #0f172a; margin: 0; }
    .subtitulo { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px; margin: 4px 0 0 0; }
    .valor-label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; text-align: right; }
    .valor-box { background: #0f172a; color: #ffffff; font-size: 28px; font-weight: 700; padding: 8px 20px; border-radius: 12px; }
    .corpo { font-size: 18px; line-height: 2; margin-bottom: 32px; text-align: justify; color: #1e293b; }
    .destaque { font-weight: 700; text-transform: uppercase; text-decoration: underline; text-underline-offset: 4px; }
    .negrito { font-weight: 700; }
    .italico { font-weight: 700; font-style: italic; }
    .imovel-box { background: #f8fafc; border: 2px dashed #e2e8f0; border-radius: 24px; padding: 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
    .imovel-col-full { grid-column: 1 / -1; }
    .label-sm { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
    .valor-item { font-weight: 700; color: #1e293b; font-size: 16px; }
    .obs { font-size: 13px; font-style: italic; color: #64748b; margin-bottom: 32px; }
    .rodape { margin-top: 80px; padding-top: 40px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-end; }
    .data-texto { font-size: 14px; font-weight: 700; color: #1e293b; }
    .assinatura { width: 240px; text-align: center; }
    .linha-assinatura { height: 1px; background: #0f172a; margin-bottom: 8px; }
    .assinatura-label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
    .assinatura-nome { font-weight: 700; color: #0f172a; font-size: 14px; }
  </style>
</head>
<body>
  <div id="recibo-root">
    <div class="recibo-card">
      <div class="header">
        <div>
          <p class="titulo">RECIBO</p>
          <p class="subtitulo">Instrumento de Quitação de Valores</p>
        </div>
        <div>
          <p class="valor-label">Valor do Recibo</p>
          <p class="valor-box">${valor}</p>
        </div>
      </div>
      <p class="corpo">
        Recebemos de <span class="destaque">${clienteNome}</span>, inscrito(a) no CPF nº <span class="negrito">${clienteCpf}</span>, a importância supra de <span class="italico">(${valor})</span>, referente ao <span class="negrito">SINAL E PRINCÍPIO DE PAGAMENTO (ENTRADA)</span> para aquisição do imóvel:
      </p>
      <div class="imovel-box">
        <div>
          <p class="label-sm">Empreendimento</p>
          <p class="valor-item">${empreendimento}</p>
        </div>
        <div>
          <p class="label-sm">Localização</p>
          <p class="valor-item">Q:${quadra} / L:${lote}</p>
        </div>
        ${rua ? `<div class="imovel-col-full"><p class="label-sm">Logradouro</p><p class="valor-item">${rua}</p></div>` : ''}
      </div>
      <p class="obs">Pelo que damos plena, geral e irrevogável quitação do referido valor, para que nada mais se reclame.</p>
      <div class="rodape">
        <div>
          <p class="data-texto">Santarém/PA, ${dataFormatada}</p>
        </div>
        <div class="assinatura">
          <div class="linha-assinatura"></div>
          <p class="assinatura-label">Assinatura do Vendedor</p>
          <p class="assinatura-nome">${vendedor}</p>
        </div>
        ${userProfile?.nome ? `<div class="assinatura">
          <div class="linha-assinatura"></div>
          <p class="assinatura-label">Corretor Responsável</p>
          <p class="assinatura-nome">${userProfile.nome}</p>
          ${userProfile.creci ? `<p class="assinatura-label">CRECI: ${userProfile.creci}</p>` : ''}
        </div>` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;
  };

  const openReciboPopup = (): Promise<Window> => {
    return new Promise((resolve, reject) => {
      if (!selectedVenda) { reject(new Error('Venda não encontrada.')); return; }
      const popup = window.open('', '_blank', 'width=900,height=1200,left=-10000,top=-10000,toolbar=no,scrollbars=no,menubar=no,status=no');
      if (!popup) { reject(new Error('Popup bloqueado. Permita popups neste site.')); return; }
      popup.document.open();
      popup.document.write(buildReciboPopupHTML());
      popup.document.close();
      const onLoad = () => {
        clearTimeout(timer);
        setTimeout(() => resolve(popup), 800);
      };
      const timer = setTimeout(() => resolve(popup), 2500);
      if (popup.document.readyState === 'complete') {
        onLoad();
      } else {
        popup.addEventListener('load', onLoad, { once: true });
      }
    });
  };

  const captureReciboCanvas = async (): Promise<HTMLCanvasElement> => {
    if (!reciboRef.current) throw new Error('Elemento de recibo não encontrado. Certifique-se de que o recibo está visível na tela.');
    const captureEl = reciboRef.current;
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(captureEl, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      allowTaint: false,
      width: captureEl.scrollWidth,
      height: captureEl.scrollHeight,
      windowWidth: captureEl.scrollWidth,
      windowHeight: captureEl.scrollHeight,
      onclone: (_clonedDoc: Document, clonedEl: HTMLElement) => {
        // html2canvas não suporta oklch (Tailwind v4) — neutralizar antes da captura
        const style = clonedEl.ownerDocument.createElement('style');
        style.textContent = [
          '* { color: revert-layer !important; background-color: revert-layer !important; border-color: revert-layer !important; }',
          '[class*="bg-"] { background-color: white !important; }',
          '[class*="text-"] { color: black !important; }',
          '[class*="border-"] { border-color: #d1d5db !important; }',
        ].join('\n');
        clonedEl.ownerDocument.head.appendChild(style);
      },
    });
    return canvas;
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const handleDownloadImage = async () => {
    if (!selectedVenda) {
      alert('Nenhuma venda selecionada.');
      return;
    }
    setReciboDownloading('img');
    try {
      const canvas = await captureReciboCanvas();
      const nome = selectedVenda?.clienteNome?.replace(/\s+/g, '-') || 'recibo';
      await new Promise<void>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error('Falha ao gerar blob da imagem.')); return; }
          triggerDownload(blob, `recibo-${nome}.png`);
          resolve();
        }, 'image/png');
      });
    } catch (e: unknown) {
      console.error('Erro ao gerar imagem:', e);
      alert('Erro ao gerar imagem: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setReciboDownloading(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (!selectedVenda) {
      alert('Nenhuma venda selecionada.');
      return;
    }
    setReciboDownloading('pdf');
    try {
      const canvas = await captureReciboCanvas();
      const jspdfModule = await import('jspdf');
      // Compatível com jsPDF v2, v3 e v4
      const JsPDFClass = jspdfModule.jsPDF ?? (jspdfModule as any).default?.jsPDF ?? (jspdfModule as any).default;
      const imgData = canvas.toDataURL('image/png');
      const pdf = new JsPDFClass({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
      const nome = selectedVenda?.clienteNome?.replace(/\s+/g, '-') || 'recibo';
      const blob = pdf.output('blob');
      triggerDownload(blob, `recibo-${nome}.pdf`);
    } catch (e: unknown) {
      console.error('Erro ao gerar PDF:', e);
      alert('Erro ao gerar PDF: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setReciboDownloading(null);
    }
  };

  const client = selectedVenda
    ? clients.find((c) => c.id === selectedVenda.clienteId)
    : null;
  const development = selectedVenda
    ? developments.find((d) => d.id === selectedVenda.empreendimentoId)
    : null;

  const filteredSales = (() => {
    const normalizeStatus = (s?: string) => {
      if (!s || s === "pendente" || s === "rascunho") return "rascunho";
      if (s === "pago" || s === "ativo") return "ativo";
      return s;
    };
    let list = sales.filter((venda) => {
      const query = searchTerm.toLowerCase();
      const matchesSearch = !query || (
        venda.clienteNome.toLowerCase().includes(query) ||
        venda.empreendimentoNome.toLowerCase().includes(query) ||
        venda.numeroLote.toLowerCase().includes(query) ||
        venda.quadra.toLowerCase().includes(query) ||
        venda.numeroContrato.toLowerCase().includes(query) ||
        venda.rua?.toLowerCase().includes(query) ||
        venda.vendedor?.toLowerCase().includes(query)
      );
      const matchesCorretor = !corretorFilter || venda.vendedor === corretorFilter;
      const matchesStatus = !statusFilter || normalizeStatus(venda.status) === statusFilter;
      const matchesEmp = !empFilter || venda.empreendimentoId === empFilter;
      const matchesDate = !dateFilter || (venda.dataVenda || "").startsWith(dateFilter);
      return matchesSearch && matchesCorretor && matchesStatus && matchesEmp && matchesDate;
    });
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case "data_asc": return (a.dataVenda || "").localeCompare(b.dataVenda || "");
        case "valor_desc": return (b.valorLote || 0) - (a.valorLote || 0);
        case "valor_asc": return (a.valorLote || 0) - (b.valorLote || 0);
        case "nome_asc": return a.clienteNome.localeCompare(b.clienteNome, "pt-BR");
        case "emp_asc": return (a.empreendimentoNome || "").localeCompare(b.empreendimentoNome || "", "pt-BR");
        case "status_asc": return normalizeStatus(a.status).localeCompare(normalizeStatus(b.status), "pt-BR");
        case "corretor_asc": return (a.vendedor || "").localeCompare(b.vendedor || "", "pt-BR");
        default: return (b.dataVenda || "").localeCompare(a.dataVenda || "");
      }
    });
    return list;
  })();

  // Ranking de corretores
  const rankingCorretores = (() => {
    const map: Record<string, { nome: string; vendas: number; total: number }> = {};
    for (const v of sales) {
      const nome = v.vendedor?.trim() || "Sem corretor";
      if (!map[nome]) map[nome] = { nome, vendas: 0, total: 0 };
      map[nome].vendas += 1;
      map[nome].total += v.valorLote || 0;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  })();
  const totalGeralVendas = rankingCorretores.reduce((s, r) => s + r.total, 0);
  const corretoresUnicos = [...new Set(sales.map(v => v.vendedor?.trim()).filter(Boolean))] as string[];

  const getStatusInfo = (status?: string) => {
    switch (status) {
      case "pago":
      case "ativo":
        return {
          label: "Ativo",
          color: "text-success-main bg-success-main/10",
          icon: CheckCircle2,
        };
      case "cancelado":
        return {
          label: "Cancelado",
          color: "text-red-500 bg-red-50",
          icon: AlertCircle,
        };
      case "rascunho":
      case "pendente":
        return {
          label: "Rascunho",
          color: "text-amber-500 bg-amber-50",
          icon: Clock,
        };
      default:
        return {
          label: "Ativo",
          color: "text-success-main bg-success-main/10",
          icon: CheckCircle2,
        };
    }
  };

  const handleOpenGerarContratoForVenda = (venda: Venda) => {
    const dev = developments.find((d) => d.id === venda.empreendimentoId);
    setSelectedVenda(venda);
    setGerarProprietarioId("");
    setGerarVendedor(emptyGerarVendedor);
    setGerarEmp({
      nome: dev?.nome || "",
      comunidade: dev?.comunidade || "",
      cidade: dev?.cidade || "",
      estado: dev?.estado || "",
    });
    setGerarExtra({
      rua: venda.rua || "",
      comunidade: dev?.comunidade || "",
      formaPagamento: venda.formaPagamento || "Dinheiro",
      medidaFrente: venda.medidaFrente || "",
      medidaLateralDir: venda.medidaLateralDir || "",
      medidaLateralEsq: venda.medidaLateralEsq || "",
      medidaFundos: venda.medidaFundos || "",
      areaTotal: venda.areaTotal || "",
    });
    setTipoContrato(venda.quantidadeParcelas === 0 ? "avista" : "parcelado");
    setGerarStep(0);
    setShowGerarModal(true);
  };

  const activeFilterCount = [statusFilter, empFilter, dateFilter, corretorFilter].filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-2">
        <div className="space-y-1">
          <h3 className="text-xl font-display font-bold text-slate-800 flex items-center gap-3">
            <FileText className="text-primary-main" />
            Contratos Gerados
          </h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {filteredSales.length} de {sales.length} exibidos
          </p>
        </div>

        <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
          <button
            onClick={() => setShowRanking(true)}
            className="btn-secondary flex items-center gap-2"
            title="Ranking de corretores"
          >
            <Trophy size={18} />
            <span className="hidden sm:inline">Ranking</span>
          </button>
          <button
            onClick={() => setShowNovoContrato(true)}
            className="btn-primary flex items-center gap-2 flex-1 sm:flex-none justify-center"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Novo Contrato</span>
            <span className="sm:hidden">Novo</span>
          </button>
        </div>
      </div>

      {/* Filter & Sort bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Pesquisar por cliente, empreendimento, lote, corretor..."
            className="w-full h-10 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary-main/20 focus:border-primary-main transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap gap-2">
          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`h-9 px-3 rounded-xl text-xs font-bold border transition-all ${statusFilter ? "bg-primary-main text-white border-primary-main" : "bg-slate-50 text-slate-600 border-slate-200"}`}
          >
            <option value="">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="rascunho">Rascunho</option>
            <option value="cancelado">Cancelado</option>
          </select>

          {/* Empreendimento */}
          {developments.length > 0 && (
            <select
              value={empFilter}
              onChange={(e) => setEmpFilter(e.target.value)}
              className={`h-9 px-3 rounded-xl text-xs font-bold border transition-all ${empFilter ? "bg-primary-main text-white border-primary-main" : "bg-slate-50 text-slate-600 border-slate-200"}`}
            >
              <option value="">Todos os empreendimentos</option>
              {developments.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          )}

          {/* Mês/Ano */}
          <input
            type="month"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className={`h-9 px-3 rounded-xl text-xs font-bold border transition-all ${dateFilter ? "bg-primary-main text-white border-primary-main [color-scheme:dark]" : "bg-slate-50 text-slate-600 border-slate-200"}`}
          />

          {/* Corretor */}
          {corretoresUnicos.length > 0 && (
            <select
              value={corretorFilter}
              onChange={(e) => setCorretorFilter(e.target.value)}
              className={`h-9 px-3 rounded-xl text-xs font-bold border transition-all ${corretorFilter ? "bg-primary-main text-white border-primary-main" : "bg-slate-50 text-slate-600 border-slate-200"}`}
            >
              <option value="">Todos os corretores</option>
              {corretoresUnicos.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          {/* Ordenação */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-9 px-3 rounded-xl text-xs font-bold border bg-slate-50 text-slate-600 border-slate-200 transition-all ml-auto"
          >
            <option value="data_desc">📅 Data ↓ (recente)</option>
            <option value="data_asc">📅 Data ↑ (antigo)</option>
            <option value="valor_desc">💰 Valor ↓ (maior)</option>
            <option value="valor_asc">💰 Valor ↑ (menor)</option>
            <option value="nome_asc">🔤 Cliente A–Z</option>
            <option value="emp_asc">🏘️ Empreendimento A–Z</option>
            <option value="status_asc">🔖 Status A–Z</option>
            <option value="corretor_asc">👤 Corretor A–Z</option>
          </select>

          {/* Limpar filtros */}
          {activeFilterCount > 0 && (
            <button
              onClick={() => { setStatusFilter(""); setEmpFilter(""); setDateFilter(""); setCorretorFilter(""); setSearchTerm(""); }}
              className="h-9 px-3 rounded-xl text-xs font-bold border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-all flex items-center gap-1"
            >
              <X size={12} />
              Limpar ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      {/* Modal: Ranking de Corretores */}
      <AnimatePresence>
        {showRanking && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-[28px] shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="px-7 pt-7 pb-5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500 rounded-xl text-white">
                    <Trophy size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-bold text-slate-800">Ranking de Corretores</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{sales.length} venda{sales.length !== 1 ? 's' : ''} no total</p>
                  </div>
                </div>
                <button onClick={() => setShowRanking(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <X size={20} className="text-slate-400" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
                {rankingCorretores.length === 0 ? (
                  <p className="text-center text-slate-400 py-10 font-medium">Nenhuma venda registrada.</p>
                ) : rankingCorretores.map((corretor, idx) => {
                  const pct = totalGeralVendas > 0 ? (corretor.total / totalGeralVendas) * 100 : 0;
                  const medals = ["🥇", "🥈", "🥉"];
                  const medal = medals[idx] || `${idx + 1}º`;
                  const barColors = [
                    "bg-amber-400",
                    "bg-slate-400",
                    "bg-orange-400",
                  ];
                  const barColor = barColors[idx] || "bg-primary-main/60";
                  return (
                    <div key={corretor.nome} className="bg-slate-50 rounded-2xl p-4 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xl shrink-0">{medal}</span>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 truncate">{corretor.nome}</p>
                            <p className="text-xs text-slate-500">{corretor.vendas} venda{corretor.vendas !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-display font-bold text-slate-800 text-sm">
                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(corretor.total)}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400">{pct.toFixed(1)}% do total</p>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer totais */}
              {rankingCorretores.length > 0 && (
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total geral</p>
                  <p className="font-display font-bold text-slate-800">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(totalGeralVendas)}
                  </p>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Novo Contrato */}
      <AnimatePresence>
        {showNovoContrato && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-3xl max-h-[90vh] rounded-[28px] shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary-main rounded-xl text-primary-contrast">
                    <FileText size={20} />
                  </div>
                  <h3 className="text-lg font-display font-bold text-slate-800">Novo Contrato</h3>
                </div>
                <button onClick={() => setShowNovoContrato(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>

              <div className="overflow-y-auto p-6 space-y-6">
                {/* Cliente */}
                <div className="space-y-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Cliente</p>
                  <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl w-fit">
                    {(["existente", "novo"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setClienteMode(m)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${clienteMode === m ? "bg-white shadow text-primary-main" : "text-slate-500"}`}
                      >
                        {m === "existente" ? "Cliente Existente" : "Novo Cliente"}
                      </button>
                    ))}
                  </div>

                  {clienteMode === "existente" ? (
                    <select
                      className="input-field"
                      value={clienteSelecionadoId}
                      onChange={(e) => setClienteSelecionadoId(e.target.value)}
                    >
                      <option value="">Selecione um cliente...</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.nome} — {c.cpf}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[
                        { label: "Nome Completo *", field: "nome", placeholder: "Nome do cliente" },
                        { label: "CPF *", field: "cpf", placeholder: "000.000.000-00" },
                        { label: "RG", field: "rg", placeholder: "RG" },
                        { label: "Nascimento", field: "nascimento", placeholder: "DD/MM/AAAA" },
                        { label: "Profissão", field: "profissao", placeholder: "Profissão" },
                        { label: "Telefone", field: "telefone1", placeholder: "(00) 00000-0000" },
                        { label: "Endereço", field: "endereco", placeholder: "Rua / Av." },
                        { label: "Número", field: "numero", placeholder: "Nº" },
                        { label: "Bairro", field: "bairro", placeholder: "Bairro" },
                        { label: "Cidade", field: "cidade", placeholder: "Cidade" },
                        { label: "Estado", field: "estado", placeholder: "UF" },
                        { label: "CEP", field: "cep", placeholder: "00000-000" },
                      ].map(({ label, field, placeholder }) => (
                        <div key={field}>
                          <label className="label">{label}</label>
                          <input
                            className="input-field"
                            placeholder={placeholder}
                            value={(novoCliente as any)[field] || ""}
                            onChange={(e) => setNovoCliente({ ...novoCliente, [field]: e.target.value })}
                          />
                        </div>
                      ))}
                      <div>
                        <label className="label">Estado Civil</label>
                        <select className="input-field" value={novoCliente.estadoCivil || "solteiro"} onChange={(e) => setNovoCliente({ ...novoCliente, estadoCivil: e.target.value })}>
                          {["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "União Estável"].map((o) => <option key={o} value={o.toLowerCase()}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Gênero</label>
                        <select className="input-field" value={novoCliente.genero || "M"} onChange={(e) => setNovoCliente({ ...novoCliente, genero: e.target.value as "M" | "F" | "O" })}>
                          <option value="M">Masculino</option>
                          <option value="F">Feminino</option>
                          <option value="O">Outro</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Imóvel */}
                <div className="space-y-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Imóvel</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="label">Empreendimento</label>
                      <select className="input-field" value={contratoData.empreendimentoId} onChange={(e) => setContratoData({ ...contratoData, empreendimentoId: e.target.value, quadra: "", numeroLote: "", rua: "" })}>
                        <option value="">Selecione...</option>
                        {developments.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Quadra</label>
                      <input className="input-field" placeholder="Ex: A" value={contratoData.quadra} onChange={(e) => setContratoData({ ...contratoData, quadra: e.target.value, rua: "" })} />
                    </div>
                    <div>
                      <label className="label">Lote</label>
                      <input className="input-field" placeholder="Ex: 01" value={contratoData.numeroLote} onChange={(e) => setContratoData({ ...contratoData, numeroLote: e.target.value, rua: "" })} />
                    </div>

                    {/* Aviso: lote já vendido */}
                    {(() => {
                      if (!contratoData.empreendimentoId || !contratoData.quadra || !contratoData.numeroLote) return null;
                      const vendaExistente = sales.find(v =>
                        v.empreendimentoId === contratoData.empreendimentoId &&
                        v.quadra.toUpperCase() === contratoData.quadra.toUpperCase() &&
                        v.numeroLote === contratoData.numeroLote &&
                        v.status !== 'cancelado'
                      );
                      if (!vendaExistente) return null;
                      return (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="sm:col-span-2 flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4"
                        >
                          <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-black text-red-700 text-sm uppercase tracking-wide">⚠️ Lote já vendido!</p>
                            <p className="text-xs text-red-600 mt-1">
                              Quadra <strong>{vendaExistente.quadra}</strong> · Lote <strong>{vendaExistente.numeroLote}</strong> já está registrado para <strong>{vendaExistente.clienteNome}</strong> (contrato {vendaExistente.numeroContrato}, status: <strong>{vendaExistente.status || 'pendente'}</strong>). Confira antes de prosseguir.
                            </p>
                          </div>
                        </motion.div>
                      );
                    })()}

                    <div>
                      {(() => {
                        const dev = developments.find((d) => d.id === contratoData.empreendimentoId);
                        const key = `${contratoData.quadra}-${contratoData.numeroLote}`.toUpperCase();
                        const lotInfo = dev?.lotesInfo?.[key];
                        const ruaSistema = lotInfo?.rua;
                        const isConfirmed = ruaSistema && contratoData.rua && contratoData.rua.trim().toLowerCase() === ruaSistema.trim().toLowerCase();
                        const isNew = !ruaSistema && contratoData.rua && contratoData.rua.trim() !== "";
                        return (
                          <>
                            <label className="label flex items-center gap-2">
                              Rua
                              {isConfirmed && (
                                <span className="text-[9px] font-bold uppercase tracking-widest text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✓ Confirmada pelo sistema</span>
                              )}
                              {isNew && (
                                <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Nova — será salva no sistema</span>
                              )}
                            </label>
                            <input
                              className={`input-field ${ruaWarning ? "border-amber-400" : ""}`}
                              placeholder="Nome da rua"
                              value={contratoData.rua}
                              onChange={(e) => setContratoData({ ...contratoData, rua: e.target.value })}
                            />
                            {ruaWarning && (
                              <p className="mt-1 text-[11px] text-amber-600 font-semibold flex items-center gap-1">
                                <AlertCircle size={13} /> {ruaWarning}
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Pagamento */}
                <div className="space-y-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pagamento</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Toggle À Vista / Parcelado */}
                    <div className="sm:col-span-2">
                      <label className="label">Tipo de Pagamento</label>
                      <div className="flex rounded-xl overflow-hidden border border-slate-200 w-fit text-sm font-bold">
                        <button type="button"
                          onClick={() => { setTipoContrato('avista'); setContratoData({ ...contratoData, quantidadeParcelas: 0, valorParcela: 0, dataVencimento: "" }); }}
                          className={`px-6 py-2.5 transition-colors ${tipoContrato === 'avista' ? 'bg-primary-main text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                          À Vista
                        </button>
                        <button type="button"
                          onClick={() => { setTipoContrato('parcelado'); setContratoData({ ...contratoData, quantidadeParcelas: 1, dataVencimento: defaultVencimento() }); }}
                          className={`px-6 py-2.5 transition-colors ${tipoContrato === 'parcelado' ? 'bg-primary-main text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                          Parcelado
                        </button>
                      </div>
                    </div>

                    {[
                      { label: "Valor do Lote (R$)", field: "valorLote", type: "number" },
                      { label: "Entrada (R$)", field: "valorEntrada", type: "number" },
                      ...(tipoContrato === 'parcelado' ? [
                        { label: "Nº de Parcelas", field: "quantidadeParcelas", type: "number" },
                        { label: "Valor da Parcela (R$)", field: "valorParcela", type: "number" },
                      ] : []),
                    ].map(({ label, field, type }) => (
                      <div key={field}>
                        <label className="label">{label}</label>
                        <input type={type} className="input-field" value={(contratoData as any)[field]} onChange={(e) => setContratoData({ ...contratoData, [field]: type === "number" ? Number(e.target.value) : e.target.value })} />
                      </div>
                    ))}
                    <div>
                      <label className="label">Forma de Pagamento</label>
                      <select className="input-field" value={contratoData.formaPagamento} onChange={(e) => setContratoData({ ...contratoData, formaPagamento: e.target.value })}>
                        {["Dinheiro", "Pix", "Boleto", "Cheque", "Financiamento Próprio", "Cartão"].map((o) => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                    {tipoContrato === 'parcelado' && (
                    <div>
                      <label className="label">Data de Vencimento das Parcelas</label>
                      <input className="input-field" placeholder="Ex: todo dia 10" value={contratoData.dataVencimento} onChange={(e) => setContratoData({ ...contratoData, dataVencimento: e.target.value })} />
                    </div>
                    )}
                    <div>
                      <label className="label">Data do Contrato</label>
                      <input type="date" className="input-field" value={contratoData.dataVenda} onChange={(e) => setContratoData({ ...contratoData, dataVenda: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Vendedor</label>
                      {vendedores.length > 0 ? (
                        <select
                          className="input-field font-semibold"
                          value={contratoData.vendedorId || ""}
                          onChange={(e) => {
                            const v = vendedores.find(x => x.id === e.target.value);
                            setContratoData({ ...contratoData, vendedorId: e.target.value, vendedor: v?.nome || "" });
                          }}
                        >
                          <option value="">Selecionar vendedor...</option>
                          {vendedores.map((v) => (
                            <option key={v.id} value={v.id}>{v.nome}</option>
                          ))}
                        </select>
                      ) : (
                        <input className="input-field" placeholder="Nome do vendedor" value={contratoData.vendedor} onChange={(e) => setContratoData({ ...contratoData, vendedor: e.target.value })} />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
                <button onClick={() => setShowNovoContrato(false)} className="btn-secondary px-6">Cancelar</button>
                <button onClick={handleSalvarContrato} className="btn-primary px-8">Gerar Contrato</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Editar Contrato */}
      <AnimatePresence>
        {editingVenda && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl max-h-[90vh] rounded-[28px] shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500 rounded-xl text-white">
                    <Pencil size={20} />
                  </div>
                  <div>
                    <h4 className="font-display font-bold text-slate-800">Editar Contrato</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{editingVenda.numeroContrato} — {editingVenda.clienteNome}</p>
                  </div>
                </div>
                <button onClick={() => setEditingVenda(null)} className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Empreendimento</label>
                    <select
                      className="input-field"
                      value={editVendaForm.empreendimentoId || ""}
                      onChange={(e) => {
                        const dev = developments.find(d => d.id === e.target.value);
                        setEditVendaForm({ ...editVendaForm, empreendimentoId: e.target.value, empreendimentoNome: dev?.nome || editVendaForm.empreendimentoNome });
                      }}
                    >
                      <option value="">Selecionar...</option>
                      {developments.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Vendedor</label>
                    {vendedores.length > 0 ? (
                      <select
                        className="input-field"
                        value={editVendaForm.vendedorId || ""}
                        onChange={(e) => {
                          const v = vendedores.find(x => x.id === e.target.value);
                          setEditVendaForm({ ...editVendaForm, vendedorId: e.target.value, vendedor: v?.nome || "" });
                        }}
                      >
                        <option value="">Selecionar...</option>
                        {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                      </select>
                    ) : (
                      <input className="input-field" value={editVendaForm.vendedor || ""} onChange={(e) => setEditVendaForm({ ...editVendaForm, vendedor: e.target.value })} />
                    )}
                  </div>
                  <div>
                    <label className="label">Quadra</label>
                    <input className="input-field" value={editVendaForm.quadra || ""} onChange={(e) => setEditVendaForm({ ...editVendaForm, quadra: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Nº Lote</label>
                    <input className="input-field" value={editVendaForm.numeroLote || ""} onChange={(e) => setEditVendaForm({ ...editVendaForm, numeroLote: e.target.value })} />
                  </div>
                  <div>
                    {(() => {
                      const dev = developments.find((d) => d.id === (editVendaForm.empreendimentoId || editingVenda?.empreendimentoId));
                      const key = `${editVendaForm.quadra || editingVenda?.quadra}-${editVendaForm.numeroLote || editingVenda?.numeroLote}`.toUpperCase();
                      const lotInfo = dev?.lotesInfo?.[key];
                      const ruaSistema = lotInfo?.rua;
                      const currentRua = editVendaForm.rua || "";
                      const isDivergent = ruaSistema && currentRua.trim() !== "" && currentRua.trim().toLowerCase() !== ruaSistema.trim().toLowerCase();
                      const isConfirmed = ruaSistema && currentRua.trim().toLowerCase() === ruaSistema.trim().toLowerCase();
                      const isNew = !ruaSistema && currentRua.trim() !== "";
                      return (
                        <>
                          <label className="label flex items-center gap-2">
                            Rua
                            {isConfirmed && (
                              <span className="text-[9px] font-bold uppercase tracking-widest text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✓ Confirmada</span>
                            )}
                            {isNew && (
                              <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Nova — será salva</span>
                            )}
                          </label>
                          <input
                            className={`input-field ${isDivergent ? "border-amber-400" : ""}`}
                            value={currentRua}
                            onChange={(e) => setEditVendaForm({ ...editVendaForm, rua: e.target.value })}
                          />
                          {isDivergent && (
                            <p className="mt-1 text-[11px] text-amber-600 font-semibold flex items-center gap-1">
                              <AlertCircle size={13} /> A rua do sistema para este lote é "{ruaSistema}". Verifique se está correta.
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div>
                    <label className="label">Valor do Lote (R$)</label>
                    <input type="number" className="input-field" value={editVendaForm.valorLote ?? ""} onChange={(e) => setEditVendaForm({ ...editVendaForm, valorLote: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <label className="label">Valor de Entrada (R$)</label>
                    <input type="number" className="input-field" value={editVendaForm.valorEntrada ?? ""} onChange={(e) => setEditVendaForm({ ...editVendaForm, valorEntrada: parseFloat(e.target.value) || 0 })} />
                  </div>
                  {/* Toggle À Vista / Parcelado */}
                  <div className="col-span-2">
                    <label className="label">Tipo de Pagamento</label>
                    <div className="flex rounded-xl overflow-hidden border border-slate-200 w-fit text-sm font-bold">
                      <button type="button"
                        onClick={() => setEditVendaForm({ ...editVendaForm, quantidadeParcelas: 0, valorParcela: 0, dataVencimento: "" })}
                        className={`px-5 py-2 transition-colors ${(editVendaForm.quantidadeParcelas === 0) ? 'bg-primary-main text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                        À Vista
                      </button>
                      <button type="button"
                        onClick={() => setEditVendaForm({ ...editVendaForm, quantidadeParcelas: editVendaForm.quantidadeParcelas || 1, dataVencimento: editVendaForm.dataVencimento || defaultVencimento() })}
                        className={`px-5 py-2 transition-colors ${(editVendaForm.quantidadeParcelas !== 0) ? 'bg-primary-main text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                        Parcelado
                      </button>
                    </div>
                  </div>
                  {editVendaForm.quantidadeParcelas !== 0 && (<>
                  <div>
                    <label className="label">Qtd. Parcelas</label>
                    <input type="number" min={1} className="input-field" value={editVendaForm.quantidadeParcelas ?? ""} onChange={(e) => setEditVendaForm({ ...editVendaForm, quantidadeParcelas: parseInt(e.target.value) || 1 })} />
                  </div>
                  <div>
                    <label className="label">Valor da Parcela (R$)</label>
                    <input type="number" className="input-field" value={editVendaForm.valorParcela ?? ""} onChange={(e) => setEditVendaForm({ ...editVendaForm, valorParcela: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <label className="label">Vencimento</label>
                    <input className="input-field" placeholder="Ex: todo dia 10" value={editVendaForm.dataVencimento || ""} onChange={(e) => setEditVendaForm({ ...editVendaForm, dataVencimento: e.target.value })} />
                  </div>
                  </>)}
                  <div>
                    <label className="label">Data do Contrato</label>
                    <input type="date" className="input-field" value={editVendaForm.dataVenda || ""} onChange={(e) => setEditVendaForm({ ...editVendaForm, dataVenda: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Forma de Pagamento</label>
                    <select className="input-field" value={editVendaForm.formaPagamento || "Dinheiro"} onChange={(e) => setEditVendaForm({ ...editVendaForm, formaPagamento: e.target.value })}>
                      <option>Dinheiro</option>
                      <option>Boleto</option>
                      <option>PIX</option>
                      <option>Transferência</option>
                      <option>Cheque</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
                <button onClick={() => setEditingVenda(null)} className="btn-secondary px-6">Cancelar</button>
                <button
                  onClick={() => {
                    setPendingEditVenda({ ...editingVenda, ...editVendaForm } as Venda);
                    setShowDuplicarModal(true);
                  }}
                  className="btn-primary px-8"
                >
                  Salvar Alterações
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {(() => {
        const semContrato = filteredSales.filter((v) => !v.contratoGerado);
        const comContrato = filteredSales.filter((v) => v.contratoGerado);

        const renderMobileCard = (venda: Venda) => {
          const s = getStatusInfo(venda.status);
          const Icon = s.icon;
          return (
            <div key={venda.id} className="bg-slate-50 rounded-2xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 truncate">{venda.clienteNome}</p>
                  <p className="text-xs text-slate-500 truncate">{venda.empreendimentoNome} · Q{venda.quadra} L{venda.numeroLote}</p>
                </div>
                <div className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest inline-flex items-center gap-1.5 ${s.color}`}>
                  <Icon size={11} />
                  {s.label}
                </div>
              </div>
              <p className="font-display font-bold text-primary-main text-lg">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(venda.valorLote)}
              </p>
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => handleOpenGerarContratoForVenda(venda)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl shadow-sm border transition-all ${venda.contratoGerado ? "bg-white text-primary-main border-border-subtle hover:bg-primary-main hover:text-white" : "bg-primary-main/10 text-primary-main border-primary-main/20 hover:bg-primary-main hover:text-white"}`}
                >
                  <FileDown size={20} />
                  <span className="text-[9px] font-bold uppercase">{venda.contratoGerado ? "Contrato" : "Gerar"}</span>
                </button>
                <button
                  onClick={() => { setSelectedVenda(venda); setShowReciboModal(true); }}
                  className="flex flex-col items-center gap-1 p-3 bg-white text-chumbo-base rounded-xl shadow-sm border border-border-subtle hover:bg-chumbo-base hover:text-white transition-all"
                >
                  <FileCheck size={20} />
                  <span className="text-[9px] font-bold uppercase">Recibo</span>
                </button>
                <button
                  onClick={() => { if (onEditVenda) { onEditVenda(venda); } else { setEditingVenda(venda); setEditVendaForm({ ...venda }); } }}
                  className="flex flex-col items-center gap-1 p-3 bg-white text-amber-500 rounded-xl shadow-sm border border-border-subtle hover:bg-amber-500 hover:text-white transition-all"
                >
                  <Pencil size={20} />
                  <span className="text-[9px] font-bold uppercase">Editar</span>
                </button>
                <button
                  onClick={() => requestDelete(`Excluir venda de ${venda.clienteNome}? Esta ação não pode ser desfeita.`, () => onDeleteVenda(venda.id))}
                  className="flex flex-col items-center gap-1 p-3 bg-white text-red-400 rounded-xl shadow-sm border border-border-subtle hover:bg-red-500 hover:text-white transition-all"
                >
                  <Trash2 size={20} />
                  <span className="text-[9px] font-bold uppercase">Excluir</span>
                </button>
              </div>
            </div>
          );
        };

        const renderDesktopRow = (venda: Venda) => {
          const s = getStatusInfo(venda.status);
          const Icon = s.icon;
          return (
            <tr key={venda.id} className="group">
              <td className="py-4 px-4 bg-slate-50 group-hover:bg-primary-main/5 rounded-l-2xl transition-colors">
                <div className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest inline-flex items-center gap-1.5 ${s.color}`}>
                  <Icon size={12} />
                  {s.label}
                </div>
              </td>
              <td className="py-4 px-4 bg-slate-50 group-hover:bg-primary-main/5 transition-colors font-semibold text-slate-700">
                {venda.clienteNome}
              </td>
              <td className="py-4 px-4 bg-slate-50 group-hover:bg-primary-main/5 transition-colors text-slate-500">
                {venda.empreendimentoNome} · Q{venda.quadra} L{venda.numeroLote}
              </td>
              <td className="py-4 px-4 bg-slate-50 group-hover:bg-primary-main/5 transition-colors text-right font-display font-bold text-primary-main">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(venda.valorLote)}
              </td>
              <td className="py-4 px-4 bg-slate-50 group-hover:bg-primary-main/5 rounded-r-2xl transition-colors text-center">
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => handleOpenGerarContratoForVenda(venda)}
                    className={`p-2.5 rounded-xl shadow-sm border transition-all flex items-center gap-1.5 text-xs font-bold ${venda.contratoGerado ? "bg-surface-card text-primary-main border-border-subtle hover:bg-primary-main hover:text-primary-contrast" : "bg-primary-main/10 text-primary-main border-primary-main/20 hover:bg-primary-main hover:text-white"}`}
                    title={venda.contratoGerado ? "Baixar contrato novamente" : "Gerar contrato"}
                  >
                    <FileDown size={15} />
                    {venda.contratoGerado ? "Contrato" : "Gerar Contrato"}
                  </button>
                  <button
                    onClick={() => { setSelectedVenda(venda); setShowReciboModal(true); }}
                    className="p-2.5 bg-surface-card text-chumbo-base rounded-xl shadow-sm border border-border-subtle hover:bg-chumbo-base hover:text-primary-contrast transition-all"
                    title="Recibo"
                  >
                    <FileCheck size={18} />
                  </button>
                  <button
                    onClick={() => { if (onEditVenda) { onEditVenda(venda); } else { setEditingVenda(venda); setEditVendaForm({ ...venda }); } }}
                    className="p-2.5 bg-surface-card text-amber-500 rounded-xl shadow-sm border border-border-subtle hover:bg-amber-500 hover:text-white transition-all"
                    title="Editar venda"
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    onClick={() => requestDelete(`Excluir venda de ${venda.clienteNome}? Esta ação não pode ser desfeita.`, () => onDeleteVenda(venda.id))}
                    className="p-2.5 bg-surface-card text-red-400 rounded-xl shadow-sm border border-border-subtle hover:bg-red-500 hover:text-white transition-all"
                    title="Excluir"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </td>
            </tr>
          );
        };

        const GroupTable = ({ rows }: { rows: Venda[] }) => (
          <div className="hidden sm:block overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
            <table className="w-full text-left border-separate border-spacing-y-2">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <th className="pb-3 px-4">Status</th>
                  <th className="pb-3 px-4">Titular</th>
                  <th className="pb-3 px-4">Loteamento</th>
                  <th className="pb-3 px-4 text-right">Montante</th>
                  <th className="pb-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {rows.map((v) => renderDesktopRow(v))}
              </tbody>
            </table>
          </div>
        );

        return (
          <div className="space-y-6">
            {filteredSales.length === 0 && (
              <div className="card-premium py-16 text-center text-slate-300 italic font-medium">
                {searchTerm ? `Nenhum resultado para "${searchTerm}"` : "Nenhuma venda cadastrada."}
              </div>
            )}

            {semContrato.length > 0 && (
              <div className="card-premium space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <span className="text-base">🟡</span>
                  <span className="text-xs font-black uppercase tracking-widest text-amber-600">Sem Contrato</span>
                  <span className="ml-auto text-xs font-bold text-slate-400">{semContrato.length} registro{semContrato.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="sm:hidden space-y-3">{semContrato.map((v) => renderMobileCard(v))}</div>
                <GroupTable rows={semContrato} />
              </div>
            )}

            {comContrato.length > 0 && (
              <div className="card-premium space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <span className="text-base">🟢</span>
                  <span className="text-xs font-black uppercase tracking-widest text-success-main">Com Contrato</span>
                  <span className="ml-auto text-xs font-bold text-slate-400">{comContrato.length} registro{comContrato.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="sm:hidden space-y-3">{comContrato.map((v) => renderMobileCard(v))}</div>
                <GroupTable rows={comContrato} />
              </div>
            )}
          </div>
        );
      })()}

      <AnimatePresence>
        {selectedVenda && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 lg:p-8 bg-slate-900/40 backdrop-blur-md no-print">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="bg-surface-card w-full max-w-3xl h-full lg:h-auto lg:max-h-[85vh] rounded-none lg:rounded-[32px] shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="p-4 sm:p-6 border-b border-border-subtle bg-surface-card">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2.5 bg-primary-main rounded-xl text-primary-contrast shrink-0">
                      <FileText size={20} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-display font-bold text-slate-800">Prévia do Contrato</h4>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
                          {selectedVenda.numeroContrato}
                        </p>
                        <span className="text-slate-300">•</span>
                        <div className="flex gap-1">
                          {(["pendente", "pago", "cancelado"] as const).map((status) => (
                            <button
                              key={status}
                              onClick={() => onUpdateStatus(selectedVenda.id, status)}
                              className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded transition-colors ${selectedVenda.status === status ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedVenda(null)}
                    className="h-10 w-10 shrink-0 flex items-center justify-center text-slate-400 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    <X size={22} />
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => { setEditingVenda(selectedVenda); setEditVendaForm({ ...selectedVenda }); }}
                    className="btn-secondary h-11 px-4 text-sm font-semibold flex items-center justify-center gap-2"
                  >
                    <Pencil size={17} />
                    Editar
                  </button>
                  <button
                    onClick={handleOpenGerarContrato}
                    disabled={downloadingDocx}
                    className="btn-primary flex-1 h-11 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <ChevronRight size={18} />
                    Avançar
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 lg:p-8 bg-slate-50/50 space-y-4">
                {/* Client Section */}
                <div className="bg-white rounded-2xl p-5 space-y-3 shadow-sm border border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Comprador</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Nome</p>
                      <p className="font-bold text-slate-800">{selectedVenda.clienteNome}</p>
                    </div>
                    {client?.cpf && (
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">CPF</p>
                        <p className="font-mono font-semibold text-slate-700">{client.cpf}</p>
                      </div>
                    )}
                    {client?.rg && (
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">RG</p>
                        <p className="font-mono font-semibold text-slate-700">{client.rg}</p>
                      </div>
                    )}
                    {client?.estadoCivil && (
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Estado Civil</p>
                        <p className="font-semibold text-slate-700">{client.estadoCivil}</p>
                      </div>
                    )}
                    {client?.telefone1 && (
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Telefone</p>
                        <p className="font-semibold text-slate-700">{client.telefone1}</p>
                      </div>
                    )}
                    {selectedVenda.comprador2?.nome && (
                      <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                        <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">2º Comprador</p>
                        <p className="font-bold text-slate-800">{selectedVenda.comprador2.nome}</p>
                        {selectedVenda.comprador2.cpf && <p className="font-mono text-sm text-slate-600">{selectedVenda.comprador2.cpf}</p>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Property Section */}
                <div className="bg-white rounded-2xl p-5 space-y-3 shadow-sm border border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Imóvel</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Empreendimento</p>
                      <p className="font-bold text-slate-800">{selectedVenda.empreendimentoNome}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Quadra</p>
                      <p className="font-bold text-slate-800">{selectedVenda.quadra}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Lote</p>
                      <p className="font-bold text-slate-800">{selectedVenda.numeroLote}</p>
                    </div>
                    {selectedVenda.rua && (
                      <div className="col-span-2 sm:col-span-3">
                        <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Logradouro</p>
                        <p className="font-semibold text-slate-700">{selectedVenda.rua}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Financial Section */}
                <div className="bg-white rounded-2xl p-5 space-y-3 shadow-sm border border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Financeiro</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Valor Total</p>
                      <p className="font-bold text-primary-main text-lg">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(selectedVenda.valorLote)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Entrada</p>
                      <p className="font-bold text-slate-800">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(selectedVenda.valorEntrada)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Saldo</p>
                      <p className="font-bold text-slate-800">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(selectedVenda.valorLote - selectedVenda.valorEntrada)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Parcelas</p>
                      <p className="font-bold text-slate-800">{selectedVenda.quantidadeParcelas}x de {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(selectedVenda.valorParcela)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Vencimento</p>
                      <p className="font-semibold text-slate-700">{selectedVenda.dataVencimento ? new Date(selectedVenda.dataVencimento + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Forma de Pagamento</p>
                      <p className="font-semibold text-slate-700">{selectedVenda.formaPagamento || "—"}</p>
                    </div>
                  </div>
                </div>

                {/* Seller and date */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                    <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Vendedor</p>
                    <p className="font-bold text-slate-800">{selectedVenda.vendedor || "—"}</p>
                  </div>
                  <div className="flex-1 bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                    <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Data da Venda</p>
                    <p className="font-bold text-slate-800">{new Date(selectedVenda.dataVenda).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Gerar Recibo */}
      <AnimatePresence>
        {showReciboModal && selectedVenda && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-0 lg:p-8 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="bg-white w-full max-w-3xl h-full lg:h-auto lg:max-h-[90vh] rounded-none lg:rounded-[32px] shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="p-4 sm:p-6 border-b border-slate-100">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 bg-slate-900 rounded-xl text-white shrink-0">
                      <FileCheck size={20} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-display font-bold text-slate-800">Gerar Recibo</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{selectedVenda.clienteNome} — {selectedVenda.empreendimentoNome}</p>
                    </div>
                  </div>
                  <button onClick={() => setShowReciboModal(false)} className="h-10 w-10 shrink-0 flex items-center justify-center text-slate-400 hover:bg-slate-100 rounded-xl transition-colors">
                    <X size={22} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleDownloadImage}
                    disabled={reciboDownloading !== null}
                    className="btn-secondary flex-1 h-11 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {reciboDownloading === 'img' ? (
                      <><span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />Gerando...</>
                    ) : (
                      <><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>Imagem</>
                    )}
                  </button>
                  <button
                    onClick={handleDownloadPdf}
                    disabled={reciboDownloading !== null}
                    className="btn-secondary flex-1 h-11 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {reciboDownloading === 'pdf' ? (
                      <><span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />Gerando...</>
                    ) : (
                      <><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>PDF</>
                    )}
                  </button>
                  <button
                    onClick={handlePrint}
                    disabled={reciboDownloading !== null}
                    className="btn-primary flex-1 h-11 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    <Printer size={17} />
                    Imprimir
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100/50">
                <div ref={reciboRef} className="bg-white shadow-2xl p-8 sm:p-16 mx-auto w-full max-w-[21cm] min-h-[15cm] text-black font-sans border border-slate-200">
                  <div className="flex justify-between items-start border-b-4 border-slate-900 pb-8 mb-12">
                    <div>
                      <h1 className="text-4xl font-black italic tracking-tighter text-slate-900">RECIBO</h1>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Instrumento de Quitação de Valores</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Valor do Recibo</p>
                      <p className="text-3xl font-bold bg-slate-900 text-white px-4 py-1 rounded-xl">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(selectedVenda.valorEntrada)}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-8 text-lg leading-loose">
                    <p className="text-justify">
                      Recebemos de{" "}
                      <span className="font-bold uppercase underline underline-offset-4">{selectedVenda.clienteNome}</span>
                      , inscrito(a) no CPF nº{" "}
                      <span className="font-bold">{client?.cpf || "___.___.___-__"}</span>
                      , a importância supra de{" "}
                      <span className="font-bold italic">
                        ({new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(selectedVenda.valorEntrada)})
                      </span>
                      , referente ao{" "}
                      <span className="font-bold">SINAL E PRINCÍPIO DE PAGAMENTO (ENTRADA)</span>{" "}
                      para aquisição do imóvel:
                    </p>
                    <div className="bg-slate-50 p-8 rounded-[32px] border-2 border-dashed border-slate-200 grid grid-cols-2 gap-6">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Empreendimento</p>
                        <p className="font-bold text-slate-800">{selectedVenda.empreendimentoNome}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Localização</p>
                        <p className="font-bold text-slate-800">Q:{selectedVenda.quadra} / L:{selectedVenda.numeroLote}</p>
                      </div>
                      {selectedVenda.rua && (
                        <div className="col-span-2">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Logradouro</p>
                          <p className="font-bold text-slate-800">{selectedVenda.rua}</p>
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-medium italic text-slate-500">
                      Pelo que damos plena, geral e irrevogável quitação do referido valor, para que nada mais se reclame.
                    </p>
                  </div>
                  <div className="mt-20 pt-10 border-t border-slate-100 flex flex-wrap justify-between items-end gap-6">
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        Santarém/PA,{" "}
                        {new Date(selectedVenda.dataVenda).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                      </p>
                    </div>
                    <div className="w-56 text-center">
                      <div className="h-px bg-slate-900 mb-2" />
                      <p className="text-[10px] font-bold uppercase text-slate-400">Assinatura do Vendedor</p>
                      <p className="font-bold text-slate-900">{selectedVenda.vendedor || "___________________________"}</p>
                    </div>
                    {userProfile?.nome && (
                      <div className="w-56 text-center">
                        <div className="h-px bg-slate-900 mb-2" />
                        <p className="text-[10px] font-bold uppercase text-slate-400">Corretor Responsável</p>
                        <p className="font-bold text-slate-900">{userProfile.nome}</p>
                        {userProfile.creci && (
                          <p className="text-[10px] font-bold text-slate-400 mt-0.5">CRECI: {userProfile.creci}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Gerar Contrato — Wizard Steps */}
      <AnimatePresence>
        {showGerarModal && selectedVenda && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-xl max-h-[90vh] rounded-[28px] shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Header com steps */}
              <div className="p-6 border-b border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary-main rounded-xl text-primary-contrast">
                      <FileDown size={20} />
                    </div>
                    <div>
                      <h4 className="font-display font-bold text-slate-800">Gerar Contrato</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {gerarStep === 0 ? "Dados do Terreno" : gerarStep === 1 ? "Dados do Vendedor" : "Preview do Contrato"}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setShowGerarModal(false)} className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                    <X size={20} />
                  </button>
                </div>
                {/* Steps indicator */}
                <div className="flex items-center gap-2">
                  {["Terreno", "Vendedor", "Preview"].map((label, i) => (
                    <div key={i} className="flex items-center gap-2 flex-1">
                      <div className={`flex items-center gap-1.5 ${i <= gerarStep ? "text-primary-main" : "text-slate-300"}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${i < gerarStep ? "bg-primary-main text-white" : i === gerarStep ? "bg-primary-main/20 text-primary-main border-2 border-primary-main" : "bg-slate-100 text-slate-400"}`}>
                          {i < gerarStep ? "✓" : i + 1}
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-widest hidden sm:block ${i <= gerarStep ? "text-primary-main" : "text-slate-300"}`}>{label}</span>
                      </div>
                      {i < 2 && <div className={`flex-1 h-0.5 rounded-full ${i < gerarStep ? "bg-primary-main" : "bg-slate-100"}`} />}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">

                {/* STEP 0: Terreno */}
                {gerarStep === 0 && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2">
                        <label className="label">Rua do Lote</label>
                        <input className="input-field" value={gerarExtra.rua} onChange={(e) => setGerarExtra({ ...gerarExtra, rua: e.target.value })} placeholder="Nome da rua" />
                      </div>
                      <div>
                        <label className="label">Forma de Pagamento</label>
                        <select className="input-field" value={gerarExtra.formaPagamento} onChange={(e) => setGerarExtra({ ...gerarExtra, formaPagamento: e.target.value })}>
                          {["Dinheiro", "Pix", "Boleto", "Cheque", "Financiamento Próprio", "Cartão"].map((o) => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Frente (m)</label>
                        <input className="input-field" value={gerarExtra.medidaFrente} onChange={(e) => setGerarExtra({ ...gerarExtra, medidaFrente: e.target.value })} placeholder="Ex: 12" />
                      </div>
                      <div>
                        <label className="label">Lateral Direita (m)</label>
                        <input className="input-field" value={gerarExtra.medidaLateralDir} onChange={(e) => setGerarExtra({ ...gerarExtra, medidaLateralDir: e.target.value })} placeholder="Ex: 30" />
                      </div>
                      <div>
                        <label className="label">Lateral Esquerda (m)</label>
                        <input className="input-field" value={gerarExtra.medidaLateralEsq} onChange={(e) => setGerarExtra({ ...gerarExtra, medidaLateralEsq: e.target.value })} placeholder="Ex: 30" />
                      </div>
                      <div>
                        <label className="label">Fundos (m)</label>
                        <input className="input-field" value={gerarExtra.medidaFundos} onChange={(e) => setGerarExtra({ ...gerarExtra, medidaFundos: e.target.value })} placeholder="Ex: 12" />
                      </div>
                      <div>
                        <label className="label">Área Total (m²)</label>
                        <input className="input-field" value={gerarExtra.areaTotal} onChange={(e) => setGerarExtra({ ...gerarExtra, areaTotal: e.target.value })} placeholder="Ex: 360" />
                      </div>
                    </div>
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Empreendimento</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                          <label className="label">Nome do Empreendimento</label>
                          <input className="input-field" value={gerarEmp.nome} onChange={(e) => setGerarEmp({ ...gerarEmp, nome: e.target.value })} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="label">Comunidade / Região</label>
                          <input className="input-field" value={gerarEmp.comunidade} onChange={(e) => setGerarEmp({ ...gerarEmp, comunidade: e.target.value })} />
                        </div>
                        <div>
                          <label className="label">Cidade</label>
                          <input className="input-field" value={gerarEmp.cidade} onChange={(e) => setGerarEmp({ ...gerarEmp, cidade: e.target.value })} />
                        </div>
                        <div>
                          <label className="label">Estado (UF)</label>
                          <input className="input-field" maxLength={2} value={gerarEmp.estado} onChange={(e) => setGerarEmp({ ...gerarEmp, estado: e.target.value.toUpperCase() })} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 1: Vendedor */}
                {gerarStep === 1 && (
                  <div className="space-y-4">
                    <div>
                      <label className="label">Proprietário do Lote (Vendedor no Contrato)</label>
                      {proprietarios.length > 0 ? (
                        <select className="input-field font-semibold" value={gerarProprietarioId} onChange={(e) => handleSelectProprietario(e.target.value)}>
                          <option value="">Selecionar proprietário...</option>
                          {proprietarios.map((p) => (
                            <option key={p.id} value={p.id}>{p.nome} — CPF {p.cpf}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-xs text-amber-600 font-bold bg-amber-50 px-3 py-2 rounded-xl">Nenhum proprietário cadastrado. Cadastre na aba "Proprietários" primeiro.</p>
                      )}
                    </div>
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Dados do Vendedor</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                          <label className="label">Nome Completo *</label>
                          <input className="input-field" placeholder="Nome do vendedor" value={gerarVendedor.nome} onChange={(e) => setGerarVendedor({ ...gerarVendedor, nome: e.target.value })} />
                        </div>
                        <div>
                          <label className="label">Nacionalidade</label>
                          <input className="input-field" value={gerarVendedor.nacionalidade} onChange={(e) => setGerarVendedor({ ...gerarVendedor, nacionalidade: e.target.value })} />
                        </div>
                        <div>
                          <label className="label">Estado Civil</label>
                          <select className="input-field" value={gerarVendedor.estadoCivil} onChange={(e) => setGerarVendedor({ ...gerarVendedor, estadoCivil: e.target.value })}>
                            {["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "União Estável"].map((o) => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="label">RG</label>
                          <input className="input-field" placeholder="0000000" value={gerarVendedor.rg} onChange={(e) => setGerarVendedor({ ...gerarVendedor, rg: maskRG(e.target.value) })} />
                        </div>
                        <div>
                          <label className="label">CPF</label>
                          <input className="input-field" placeholder="000.000.000-00" value={gerarVendedor.cpf} onChange={(e) => setGerarVendedor({ ...gerarVendedor, cpf: maskCPF(e.target.value) })} />
                        </div>
                        <div>
                          <label className="label">CEP {fetchingCep && <span className="text-[9px] text-primary-main font-bold ml-1">buscando...</span>}</label>
                          <input className="input-field" placeholder="00000-000" value={gerarVendedor.cep} onChange={(e) => { const val = maskCEP(e.target.value); setGerarVendedor({ ...gerarVendedor, cep: val }); if (val.replace(/\D/g, "").length === 8) fetchCepGerar(val); }} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="label">Endereço</label>
                          <input className="input-field" value={gerarVendedor.endereco} onChange={(e) => setGerarVendedor({ ...gerarVendedor, endereco: e.target.value })} />
                        </div>
                        <div>
                          <label className="label">Número</label>
                          <input className="input-field" value={gerarVendedor.numero} onChange={(e) => setGerarVendedor({ ...gerarVendedor, numero: e.target.value })} />
                        </div>
                        <div>
                          <label className="label">Bairro</label>
                          <input className="input-field" value={gerarVendedor.bairro} onChange={(e) => setGerarVendedor({ ...gerarVendedor, bairro: e.target.value })} />
                        </div>
                        <div>
                          <label className="label">Cidade</label>
                          <input className="input-field" value={gerarVendedor.cidade} onChange={(e) => setGerarVendedor({ ...gerarVendedor, cidade: e.target.value })} />
                        </div>
                        <div>
                          <label className="label">Estado (UF)</label>
                          <input className="input-field" maxLength={2} value={gerarVendedor.estado} onChange={(e) => setGerarVendedor({ ...gerarVendedor, estado: e.target.value.toUpperCase() })} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: Preview */}
                {gerarStep === 2 && selectedVenda && (() => {
                  const cliente = clients.find((c) => c.id === selectedVenda.clienteId);
                  const dev = developments.find((d) => d.id === selectedVenda.empreendimentoId);
                  const fmtCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
                  return (
                    <div className="space-y-4">
                      <div className="bg-slate-50 rounded-2xl p-5 space-y-3 border border-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Comprador</p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div><span className="text-slate-500 text-xs">Nome</span><p className="font-bold text-slate-800">{cliente?.nome || "—"}</p></div>
                          <div><span className="text-slate-500 text-xs">CPF</span><p className="font-mono text-slate-700">{cliente?.cpf || "—"}</p></div>
                          <div><span className="text-slate-500 text-xs">Estado Civil</span><p className="text-slate-700">{cliente?.estadoCivil || "—"}</p></div>
                          <div><span className="text-slate-500 text-xs">Profissão</span><p className="text-slate-700">{cliente?.profissao || "—"}</p></div>
                        </div>
                      </div>
                      <div className="bg-slate-50 rounded-2xl p-5 space-y-3 border border-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Terreno</p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div><span className="text-slate-500 text-xs">Empreendimento</span><p className="font-bold text-slate-800">{gerarEmp.nome || dev?.nome}</p></div>
                          <div><span className="text-slate-500 text-xs">Lote / Quadra</span><p className="font-bold text-slate-800">Lote {selectedVenda.numeroLote} — Quadra {selectedVenda.quadra}</p></div>
                          <div><span className="text-slate-500 text-xs">Rua</span><p className="text-slate-700">{gerarExtra.rua || "—"}</p></div>
                          <div><span className="text-slate-500 text-xs">Área Total</span><p className="text-slate-700">{gerarExtra.areaTotal ? `${gerarExtra.areaTotal} m²` : "—"}</p></div>
                        </div>
                      </div>
                      <div className="bg-slate-50 rounded-2xl p-5 space-y-3 border border-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pagamento</p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div><span className="text-slate-500 text-xs">Valor do Lote</span><p className="font-bold text-primary-main">{fmtCurrency(selectedVenda.valorLote)}</p></div>
                          <div><span className="text-slate-500 text-xs">Entrada</span><p className="font-bold text-slate-800">{fmtCurrency(selectedVenda.valorEntrada)}</p></div>
                          {selectedVenda.quantidadeParcelas > 0 && <>
                            <div><span className="text-slate-500 text-xs">Parcelas</span><p className="text-slate-700">{selectedVenda.quantidadeParcelas}x de {fmtCurrency(selectedVenda.valorParcela)}</p></div>
                            <div><span className="text-slate-500 text-xs">Vencimento</span><p className="text-slate-700">{selectedVenda.dataVencimento}</p></div>
                          </>}
                          <div><span className="text-slate-500 text-xs">Forma de Pagamento</span><p className="text-slate-700">{gerarExtra.formaPagamento}</p></div>
                        </div>
                      </div>
                      <div className="bg-slate-50 rounded-2xl p-5 space-y-3 border border-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vendedor</p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div><span className="text-slate-500 text-xs">Nome</span><p className="font-bold text-slate-800">{gerarVendedor.nome || "—"}</p></div>
                          <div><span className="text-slate-500 text-xs">CPF</span><p className="font-mono text-slate-700">{gerarVendedor.cpf || "—"}</p></div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Footer com botões de navegação */}
              <div className="p-4 sm:p-6 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => gerarStep === 0 ? setShowGerarModal(false) : setGerarStep(gerarStep - 1)}
                  className="btn-secondary h-11 sm:px-6 w-full sm:w-auto flex items-center justify-center gap-2"
                >
                  <ChevronLeft size={17} /> {gerarStep === 0 ? "Cancelar" : "Voltar"}
                </button>

                {gerarStep < 2 ? (
                  <button
                    onClick={() => setGerarStep(gerarStep + 1)}
                    className="btn-primary h-11 flex-1 flex items-center justify-center gap-2 font-semibold"
                  >
                    Avançar <ChevronRight size={17} />
                  </button>
                ) : (
                  <div className="flex gap-2 flex-1">
                    <button
                      onClick={() => window.print()}
                      className="btn-ghost h-11 flex-1 flex items-center justify-center gap-2 text-sm font-semibold"
                    >
                      <Printer size={17} /> Salvar PDF
                    </button>
                    <button
                      onClick={handleDownloadDocx}
                      disabled={downloadingDocx}
                      className="btn-primary h-11 flex-1 flex items-center justify-center gap-2 text-sm font-semibold disabled:opacity-50"
                    >
                      {downloadingDocx ? "Gerando..." : <><FileDown size={17} /> Baixar .docx</>}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {DeleteModal}

      {DeleteModal}

      {/* Modal: Duplicar ou Substituir contrato editado */}
      <AnimatePresence>
        {showDuplicarModal && pendingEditVenda && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-sm rounded-[28px] shadow-2xl p-8 flex flex-col gap-6"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-100 rounded-xl">
                  <FileText size={20} className="text-amber-600" />
                </div>
                <div>
                  <h4 className="font-display font-bold text-slate-800">Salvar contrato editado</h4>
                  <p className="text-xs text-slate-500 mt-0.5">O que deseja fazer com as alterações?</p>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    onUpdateVenda(pendingEditVenda);
                    setEditingVenda(null);
                    setShowDuplicarModal(false);
                    setPendingEditVenda(null);
                  }}
                  className="btn-primary h-12 font-semibold flex items-center justify-center gap-2"
                >
                  <Save size={17} /> Substituir contrato original
                </button>
                <button
                  onClick={() => {
                    const novoId = `venda-${Date.now()}`;
                    const novoContrato = `CONT-${Date.now()}`;
                    onUpdateVenda({ ...pendingEditVenda, id: novoId, numeroContrato: novoContrato });
                    setEditingVenda(null);
                    setShowDuplicarModal(false);
                    setPendingEditVenda(null);
                  }}
                  className="btn-secondary h-12 font-semibold flex items-center justify-center gap-2"
                >
                  <Copy size={17} /> Duplicar como novo contrato
                </button>
                <button
                  onClick={() => { setShowDuplicarModal(false); setPendingEditVenda(null); }}
                  className="text-sm text-slate-400 hover:text-slate-600 font-semibold py-2 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ClientesSection = ({
  clients,
  sales,
  onUpdateCliente,
}: {
  clients: Cliente[];
  sales: Venda[];
  onUpdateCliente: (c: Cliente) => void;
}) => {
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [editForm, setEditForm] = useState<Partial<Cliente>>({});
  const [fieldErrors, setFieldErrors] = useState<{ cpf?: string; rg?: string }>({});

  const openEdit = (c: Cliente) => {
    setEditingCliente(c);
    setEditForm({ ...c });
    setFieldErrors({});
  };

  const handleBlurCPF = () => {
    const cpf = editForm.cpf || "";
    if (cpf && cpfStatus(cpf) === "invalid")
      setFieldErrors((e) => ({ ...e, cpf: "CPF inválido" }));
    else
      setFieldErrors((e) => ({ ...e, cpf: undefined }));
  };

  const handleBlurRG = () => {
    const rg = editForm.rg || "";
    if (rg && rgStatus(rg) === "invalid")
      setFieldErrors((e) => ({ ...e, rg: "RG inválido ou incompleto" }));
    else
      setFieldErrors((e) => ({ ...e, rg: undefined }));
  };

  const saveEdit = () => {
    if (!editingCliente) return;
    if (fieldErrors.cpf || fieldErrors.rg) return;
    const updated: Cliente = { ...editingCliente, ...editForm } as Cliente;
    onUpdateCliente(updated);
    setEditingCliente(null);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center px-2">
        <h3 className="text-xl font-display font-bold text-slate-800 flex items-center gap-3">
          <Users className="text-primary-main" />
          Base de Clientes
        </h3>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          {clients.length} cadastrados
        </p>
      </div>

      <div className="card-premium !p-2 sm:!p-6">
        <div className="overflow-x-auto -mx-2 sm:mx-0">
          <table className="w-full text-left border-separate border-spacing-y-1 sm:border-spacing-y-2">
            <thead>
              <tr className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <th className="pb-2 px-2 sm:px-4">Titular</th>
                <th className="pb-2 px-2 sm:px-4 hidden sm:table-cell">Identificação</th>
                <th className="pb-2 px-2 sm:px-4 hidden md:table-cell">Aniversário</th>
                <th className="pb-2 px-2 sm:px-4">Contato</th>
                <th className="pb-2 px-2 sm:px-4 text-right">Saldo</th>
                <th className="pb-2 px-2 sm:px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {clients.map((cliente) => {
                const totalInvestido = sales
                  .filter((v) => v.clienteId === cliente.id)
                  .reduce((acc, v) => acc + v.valorLote, 0);
                const nascFormatted = cliente.nascimento
                  ? (() => { try { return new Date(cliente.nascimento + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return cliente.nascimento; } })()
                  : "—";
                return (
                  <tr key={cliente.id} className="group">
                    <td className="py-2.5 px-2 sm:px-4 bg-slate-50 group-hover:bg-primary-main/5 rounded-l-xl sm:rounded-l-2xl transition-colors">
                      <div className="font-bold text-slate-800 text-xs sm:text-sm truncate max-w-[80px] sm:max-w-none">
                        {cliente.nome}
                      </div>
                      <div className="text-[7px] sm:text-[10px] text-slate-400 font-bold uppercase tracking-tighter sm:tracking-normal">
                        {cliente.estadoCivil}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 sm:px-4 bg-slate-50 group-hover:bg-primary-main/5 transition-colors font-mono text-xs text-slate-500 hidden sm:table-cell">
                      {cliente.cpf}
                    </td>
                    <td className="py-2.5 px-2 sm:px-4 bg-slate-50 group-hover:bg-primary-main/5 transition-colors text-xs text-slate-500 hidden md:table-cell">
                      {nascFormatted}
                    </td>
                    <td className="py-2.5 px-2 sm:px-4 bg-slate-50 group-hover:bg-primary-main/5 transition-colors">
                      <div className="text-[10px] sm:text-xs font-bold text-slate-600">
                        {cliente.telefone1}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 sm:px-4 bg-slate-50 group-hover:bg-primary-main/5 transition-colors text-right font-display font-bold text-primary-main text-xs sm:text-sm">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(totalInvestido)}
                    </td>
                    <td className="py-2.5 px-2 sm:px-4 bg-slate-50 group-hover:bg-primary-main/5 rounded-r-xl sm:rounded-r-2xl transition-colors text-center">
                      <button
                        onClick={() => openEdit(cliente)}
                        className="text-[10px] font-bold text-primary-main hover:underline px-2 py-1 rounded-lg hover:bg-primary-main/10 transition-colors"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-300 italic font-medium">
                    Nenhum cliente na base.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de edição */}
      {editingCliente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-display font-bold text-slate-800 text-lg">Editar Cliente</h3>
              <button onClick={() => setEditingCliente(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: "Nome Completo", field: "nome" },
                  { label: "Profissão", field: "profissao" },
                  { label: "Nacionalidade", field: "nacionalidade" },
                  { label: "Telefone 1", field: "telefone1" },
                  { label: "Telefone 2", field: "telefone2" },
                  { label: "Endereço", field: "endereco" },
                  { label: "Número", field: "numero" },
                  { label: "Bairro", field: "bairro" },
                  { label: "Cidade", field: "cidade" },
                  { label: "Estado", field: "estado" },
                  { label: "CEP", field: "cep" },
                ].map(({ label, field }) => (
                  <div key={field}>
                    <label className="label">{label}</label>
                    <input
                      className="input-field"
                      value={(editForm as any)[field] || ""}
                      onChange={(e) => setEditForm({ ...editForm, [field]: e.target.value })}
                    />
                  </div>
                ))}
                <div>
                  <label className="label">CPF</label>
                  <input
                    className={`input-field font-mono ${fieldErrors.cpf ? "border-red-400 focus:ring-red-400" : cpfStatus(editForm.cpf || "") === "valid" ? "border-green-400 focus:ring-green-400" : ""}`}
                    value={editForm.cpf || ""}
                    onChange={(e) => {
                      const masked = maskCPF(e.target.value);
                      setEditForm({ ...editForm, cpf: masked });
                      const st = cpfStatus(masked);
                      setFieldErrors((err) => ({ ...err, cpf: st === "invalid" ? "CPF inválido" : undefined }));
                    }}
                    onBlur={handleBlurCPF}
                    placeholder="000.000.000-00"
                  />
                  {fieldErrors.cpf && <p className="text-red-500 text-xs mt-1 font-medium">{fieldErrors.cpf}</p>}
                </div>
                <div>
                  <label className="label">RG</label>
                  <input
                    className={`input-field font-mono ${fieldErrors.rg ? "border-red-400 focus:ring-red-400" : rgStatus(editForm.rg || "") === "valid" ? "border-green-400 focus:ring-green-400" : ""}`}
                    value={editForm.rg || ""}
                    onChange={(e) => {
                      const masked = maskRG(e.target.value);
                      setEditForm({ ...editForm, rg: masked });
                      const st = rgStatus(masked);
                      setFieldErrors((err) => ({ ...err, rg: st === "invalid" ? "RG inválido ou incompleto" : undefined }));
                    }}
                    onBlur={handleBlurRG}
                    placeholder="Ex: 12.345.678-9"
                  />
                  {fieldErrors.rg && <p className="text-red-500 text-xs mt-1 font-medium">{fieldErrors.rg}</p>}
                </div>
                <div>
                  <label className="label">Aniversário (Data Nascimento)</label>
                  <input
                    type="date"
                    className="input-field"
                    value={(editForm as any).nascimento || ""}
                    onChange={(e) => setEditForm({ ...editForm, nascimento: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Estado Civil</label>
                  <select className="input-field" value={editForm.estadoCivil || "solteiro"} onChange={(e) => setEditForm({ ...editForm, estadoCivil: e.target.value })}>
                    {["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "União Estável"].map((o) => (
                      <option key={o} value={o.toLowerCase()}>{o}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Gênero</label>
                  <select className="input-field" value={editForm.genero || "M"} onChange={(e) => setEditForm({ ...editForm, genero: e.target.value as "M" | "F" | "O" })}>
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                    <option value="O">Outro</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => setEditingCliente(null)} className="btn-secondary px-6">Cancelar</button>
              <button onClick={saveEdit} className="btn-primary px-6">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AniversariosSection = ({ clients, sales = [] }: { clients: Cliente[]; sales?: Venda[] }) => {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentDay = today.getDate();
  const [selectedClient, setSelectedClient] = useState<Cliente | null>(null);
  const [copied, setCopied] = useState(false);

  const MONTHS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const MONTHS_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

  const byMonth: Cliente[][] = Array.from({ length: 12 }, (_, mi) =>
    clients
      .filter((c) => {
        if (!c.nascimento) return false;
        return new Date(c.nascimento).getMonth() === mi;
      })
      .sort((a, b) => new Date(a.nascimento).getDate() - new Date(b.nascimento).getDate())
  );

  const totalWithBirthday = clients.filter((c) => c.nascimento).length;

  const isTodayBirthday = (c: Cliente) => {
    if (!c.nascimento) return false;
    const d = new Date(c.nascimento);
    return d.getMonth() === currentMonth && d.getDate() === currentDay;
  };

  const getAge = (c: Cliente) => {
    if (!c.nascimento) return null;
    const d = new Date(c.nascimento);
    return today.getFullYear() - d.getFullYear();
  };

  const waMsg = (c: Cliente, isBday: boolean) =>
    `https://wa.me/55${(c.telefone1 || "").replace(/\D/g, "")}?text=${encodeURIComponent(
      isBday
        ? `Olá ${c.nome}, FELIZ ANIVERSÁRIO! 🎉 Que este dia seja especial. Muita saúde, paz e realizações!`
        : `Olá ${c.nome}, tudo bem? Aqui é da equipe de vendas. Passando para desejar um Feliz Aniversário! 🎂`
    )}`;

  const clientSales = selectedClient
    ? sales.filter((s) => s.clienteId === selectedClient.id)
    : [];

  const copyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone.replace(/\D/g, ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Client Detail Modal */}
      <AnimatePresence>
        {selectedClient && (
          <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-slate-900/50 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="bg-white w-full sm:max-w-lg rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className={`p-6 ${isTodayBirthday(selectedClient) ? "bg-gradient-to-br from-amber-400 to-orange-500" : "bg-gradient-to-br from-slate-800 to-slate-900"} text-white`}>
                <div className="flex justify-between items-start mb-4">
                  <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-3xl font-black">
                    {selectedClient.nome?.charAt(0).toUpperCase()}
                  </div>
                  <button
                    onClick={() => setSelectedClient(null)}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
                <h3 className="text-xl font-display font-bold leading-tight">
                  {isTodayBirthday(selectedClient) ? "🎂 " : ""}{selectedClient.nome}
                </h3>
                <div className="flex gap-3 mt-2 text-sm font-medium opacity-80 flex-wrap">
                  {selectedClient.nascimento && (
                    <span>{getAge(selectedClient)} anos · {new Date(selectedClient.nascimento).toLocaleDateString("pt-BR")}</span>
                  )}
                  {selectedClient.genero && (
                    <span>{selectedClient.genero === "M" ? "Masculino" : "Feminino"}</span>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Contact */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contato</p>
                  {selectedClient.telefone1 && (
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl gap-3">
                      <div>
                        <p className="text-xs text-slate-400 font-medium">Telefone / WhatsApp</p>
                        <p className="font-bold text-slate-800">{selectedClient.telefone1}</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => copyPhone(selectedClient.telefone1)}
                          className="p-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-600 transition-colors text-xs font-bold"
                          title="Copiar número"
                        >
                          {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                        </button>
                        <a
                          href={waMsg(selectedClient, isTodayBirthday(selectedClient))}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white transition-colors"
                          title="Abrir WhatsApp"
                        >
                          <MessageCircle size={16} />
                        </a>
                      </div>
                    </div>
                  )}
                  {selectedClient.telefone2 && (
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl gap-3">
                      <div>
                        <p className="text-xs text-slate-400 font-medium">Telefone 2</p>
                        <p className="font-bold text-slate-800">{selectedClient.telefone2}</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => copyPhone(selectedClient.telefone2 || "")}
                          className="p-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-600 transition-colors"
                        >
                          <Copy size={16} />
                        </button>
                        <a
                          href={`https://wa.me/55${(selectedClient.telefone2 || "").replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white transition-colors"
                        >
                          <MessageCircle size={16} />
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                {/* Personal info */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dados Pessoais</p>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedClient.cpf && (
                      <div className="p-3 bg-slate-50 rounded-2xl">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">CPF</p>
                        <p className="font-bold text-slate-800 text-sm">{selectedClient.cpf}</p>
                      </div>
                    )}
                    {selectedClient.rg && (
                      <div className="p-3 bg-slate-50 rounded-2xl">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">RG</p>
                        <p className="font-bold text-slate-800 text-sm">{selectedClient.rg}</p>
                      </div>
                    )}
                    {selectedClient.profissao && (
                      <div className="p-3 bg-slate-50 rounded-2xl col-span-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Profissão</p>
                        <p className="font-bold text-slate-800 text-sm">{selectedClient.profissao}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Purchases */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Compras ({clientSales.length})
                  </p>
                  {clientSales.length === 0 ? (
                    <p className="text-sm text-slate-400 italic p-3">Nenhuma compra registrada.</p>
                  ) : (
                    clientSales.map((s) => (
                      <div key={s.id} className="p-3 bg-slate-50 rounded-2xl flex justify-between items-start gap-3">
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{s.empreendimentoNome}</p>
                          <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                            Quadra {s.quadra} / Lote {s.numeroLote} · {new Date(s.dataVenda).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-display font-bold text-primary-main text-sm">
                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(s.valorLote)}
                          </p>
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${s.status === "pago" ? "bg-green-100 text-green-700" : s.status === "cancelado" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                            {s.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center gap-4 px-1">
        <div className="p-3 bg-chumbo-base/10 text-chumbo-base rounded-2xl">
          <Cake size={24} className="stroke-[2.5]" />
        </div>
        <div>
          <h3 className="text-xl font-display font-bold text-slate-800 tracking-tight">Calendário de Aniversariantes</h3>
          <p className="text-xs text-slate-400 font-medium mt-0.5">{totalWithBirthday} clientes com data de nascimento cadastrada</p>
        </div>
      </div>

      {/* Year grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MONTHS.map((monthName, mi) => {
          const isCurrentMonth = mi === currentMonth;
          const people = byMonth[mi];
          return (
            <div
              key={mi}
              className={`rounded-[24px] border overflow-hidden transition-all ${
                isCurrentMonth
                  ? "border-chumbo-base/40 shadow-lg shadow-chumbo-base/10"
                  : "border-slate-100 shadow-sm"
              }`}
            >
              {/* Month header */}
              <div className={`px-5 py-3.5 flex items-center justify-between ${
                isCurrentMonth
                  ? "bg-chumbo-base text-white"
                  : "bg-slate-50 text-slate-600"
              }`}>
                <div className="flex items-center gap-2">
                  {isCurrentMonth && <Cake size={15} className="opacity-80" />}
                  <span className={`font-bold text-sm tracking-wide ${isCurrentMonth ? "text-white" : "text-slate-700"}`}>
                    {monthName}
                  </span>
                  {isCurrentMonth && (
                    <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full uppercase tracking-widest">
                      Atual
                    </span>
                  )}
                </div>
                <span className={`text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center ${
                  isCurrentMonth
                    ? "bg-white/20 text-white"
                    : people.length > 0
                    ? "bg-chumbo-base/10 text-chumbo-base"
                    : "text-slate-300"
                }`}>
                  {people.length}
                </span>
              </div>

              {/* People list */}
              <div className="bg-white divide-y divide-slate-50">
                {people.length === 0 ? (
                  <p className="px-5 py-5 text-center text-[11px] text-slate-300 italic">
                    Sem aniversariantes
                  </p>
                ) : (
                  people.map((c) => {
                    const d = new Date(c.nascimento);
                    const isToday = isTodayBirthday(c);
                    return (
                      <div
                        key={c.id}
                        className={`flex items-center gap-3 px-4 py-3 group cursor-pointer ${
                          isToday ? "bg-amber-50 hover:bg-amber-100" : "hover:bg-slate-50"
                        }`}
                        onClick={() => setSelectedClient(c)}
                      >
                        <div className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center text-center leading-none flex-shrink-0 ${
                          isToday
                            ? "bg-amber-400 text-white shadow-md shadow-amber-200"
                            : "bg-slate-100 text-slate-500"
                        }`}>
                          <span className="text-[8px] font-bold uppercase opacity-70">{MONTHS_SHORT[mi]}</span>
                          <span className="text-sm font-bold leading-tight">{d.getDate()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold truncate leading-tight ${isToday ? "text-amber-700" : "text-slate-700"}`}>
                            {isToday && "🎂 "}{c.nome}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                            {getAge(c)} anos · {c.telefone1}
                          </p>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => copyPhone(c.telefone1 || "")}
                            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors opacity-0 group-hover:opacity-100"
                            title="Copiar número"
                          >
                            <Copy size={13} />
                          </button>
                          <a
                            href={waMsg(c, isToday)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`p-2 rounded-xl transition-all ${
                              isToday
                                ? "bg-success-main text-white shadow-md shadow-success-main/30"
                                : "text-slate-300 hover:bg-success-main hover:text-white opacity-0 group-hover:opacity-100"
                            }`}
                            title="Enviar parabéns via WhatsApp"
                          >
                            <MessageCircle size={13} />
                          </a>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ConfigSection = ({
  config,
  onSave,
  developments,
  clients,
  sales,
  onImport,
}: {
  config: AppConfig;
  onSave: (c: AppConfig) => void;
  developments: Empreendimento[];
  clients: Cliente[];
  sales: Venda[];
  onImport: (data: { empreendimentos: Empreendimento[]; clientes: Cliente[]; vendas: Venda[]; config: AppConfig }, mode: "replace" | "merge") => void;
}) => {
  const [formData, setFormData] = useState({ ...config, vendedores: config.vendedores || [] });
  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState('');
  const [showVendedorForm, setShowVendedorForm] = useState(false);
  const [editingVendedor, setEditingVendedor] = useState<Vendedor | null>(null);
  const { request: requestDelete, Modal: DeleteModal } = useDeleteConfirm();

  // Export/Import state
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<{ empreendimentos: Empreendimento[]; clientes: Cliente[]; vendas: Venda[]; config: AppConfig; exportedAt?: string; app?: string } | null>(null);
  const [importError, setImportError] = useState('');
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('merge');
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState('');

  const handleExport = () => {
    const payload = {
      version: "1.0",
      app: "Rumo ao Milhão",
      exportedAt: new Date().toISOString(),
      empreendimentos: developments,
      clientes: clients,
      vendas: sales,
      config,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    a.href = url;
    a.download = `rumo-ao-milhao-backup-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export / Import only config (theme + vendedores + proprietarios)
  const configImportRef = useRef<HTMLInputElement>(null);
  const [configImportError, setConfigImportError] = useState('');
  const [configImportSuccess, setConfigImportSuccess] = useState('');

  const handleExportConfig = () => {
    const payload = {
      version: "1.0",
      type: "config-only",
      app: "Rumo ao Milhão",
      exportedAt: new Date().toISOString(),
      config,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    a.href = url;
    a.download = `rumo-configuracoes-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfigImportError('');
    setConfigImportSuccess('');
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        const cfg: AppConfig = data.type === 'config-only' ? data.config : data.config;
        if (!cfg || typeof cfg !== 'object') {
          setConfigImportError('Arquivo inválido: configurações não encontradas.');
          return;
        }
        const merged: AppConfig = { ...config, ...cfg, vendedores: cfg.vendedores ?? config.vendedores };
        onSave(merged);
        setFormData({ ...formData, ...merged, vendedores: merged.vendedores || [] });
        setConfigImportSuccess('Configurações importadas com sucesso!');
      } catch {
        setConfigImportError('Arquivo corrompido ou formato inválido.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError('');
    setImportSuccess('');
    setImportPreview(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      setImportError('Selecione um arquivo .json válido.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.empreendimentos || !data.clientes || !data.vendas) {
          setImportError('Arquivo inválido: não é um backup do Rumo ao Milhão.');
          return;
        }
        setImportPreview(data);
      } catch {
        setImportError('Arquivo corrompido ou formato inválido.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!importPreview) return;
    setImporting(true);
    try {
      await onImport({
        empreendimentos: importPreview.empreendimentos,
        clientes: importPreview.clientes,
        vendas: importPreview.vendas,
        config: importPreview.config || config,
      }, importMode);
      setImportSuccess(`Importação concluída com sucesso! ${importMode === 'replace' ? 'Todos os dados foram substituídos.' : 'Dados mesclados com os existentes.'}`);
      setImportPreview(null);
    } catch (err: any) {
      setImportError('Erro ao importar: ' + (err?.message || 'Tente novamente.'));
    } finally {
      setImporting(false);
    }
  };
  const emptyVendedor: Omit<Vendedor, "id"> = {
    nome: "", nacionalidade: "Brasileiro", estadoCivil: "solteiro",
    rg: "", cpf: "", endereco: "", numero: "", bairro: "", cidade: "", estado: "", cep: "",
  };
  const [vendedorForm, setVendedorForm] = useState<Omit<Vendedor, "id">>(emptyVendedor);
  const vendedorFormRef = useRef<HTMLDivElement>(null);

  const handleSaveVendedor = () => {
    if (!vendedorForm.nome.trim()) { triggerShake(vendedorFormRef.current); return; }
    let updated: Vendedor[];
    if (editingVendedor) {
      updated = (formData.vendedores || []).map((v) =>
        v.id === editingVendedor.id ? { ...vendedorForm, id: editingVendedor.id } : v
      );
    } else {
      updated = [...(formData.vendedores || []), { ...vendedorForm, id: `vend-${Date.now()}` }];
    }
    const newFormData = { ...formData, vendedores: updated };
    setFormData(newFormData);
    onSave(newFormData);
    setShowVendedorForm(false);
    setEditingVendedor(null);
    setVendedorForm(emptyVendedor);
  };

  const handleDeleteVendedor = (id: string) => {
    requestDelete("Remover este vendedor?", () => {
      const updated = (formData.vendedores || []).filter((v) => v.id !== id);
      const newFormData = { ...formData, vendedores: updated };
      setFormData(newFormData);
      onSave(newFormData);
    });
  };

  const handleMigrate = async () => {
    setMigrating(true);
    setMigrateMsg('');
    try {
      const result = await dbService.migrateFromLocalStorage();
      setMigrateMsg(result.msg);
    } catch (e: any) {
      setMigrateMsg('Erro durante a migração: ' + (e?.message || 'Tente novamente.'));
    } finally {
      setMigrating(false);
    }
  };

  const themes: { id: AppTheme; label: string; color: string }[] = [
    { id: "standard", label: "Padrão (Verde)", color: "bg-[#2d5016]" },
    { id: "blue-gradient", label: "Degrade Azul", color: "bg-blue-600" },
    { id: "dark", label: "Dark Mode", color: "bg-slate-900" },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-center gap-3 px-2">
        <div className="p-3 bg-slate-900 text-white rounded-2xl">
          <Settings size={24} />
        </div>
        <h3 className="text-xl font-display font-bold text-slate-800 tracking-tight">
          Configurações Gerais
        </h3>
      </div>

      <div className="card-premium space-y-8">
        <div>
          <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <LayoutDashboard size={18} className="text-primary-main" />
            Personalização de Tema
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {themes.map((theme) => (
              <button
                key={theme.id}
                onClick={() => setFormData({ ...formData, theme: theme.id })}
                className={`p-4 rounded-2xl border-2 transition-all text-left flex flex-col gap-3 ${
                  formData.theme === theme.id
                    ? "border-primary-main bg-primary-main/5"
                    : "border-slate-100 bg-slate-50"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl ${theme.color} shadow-sm`}
                />
                <span
                  className={`font-bold text-xs uppercase tracking-widest ${formData.theme === theme.id ? "text-primary-main" : "text-slate-400"}`}
                >
                  {theme.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <button
            onClick={() => {
              onSave(formData);
              alert("Configurações salvas com sucesso!");
            }}
            className="btn-primary px-12"
          >
            Salvar Alterações
          </button>
        </div>
      </div>

      {/* Vendedores */}
      <div className="card-premium space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-slate-800 flex items-center gap-2">
            <UserCheck size={18} className="text-primary-main" />
            Vendedores (Contratos)
          </h4>
          <button
            className="btn-primary h-9 px-4 text-sm"
            onClick={() => {
              setEditingVendedor(null);
              setVendedorForm(emptyVendedor);
              setShowVendedorForm(true);
            }}
          >
            <Plus size={15} /> Adicionar
          </button>
        </div>

        {(formData.vendedores || []).length === 0 && !showVendedorForm && (
          <p className="text-slate-400 text-sm text-center py-4">
            Nenhum vendedor cadastrado. Adicione o(s) vendedor(es) que assinarão os contratos.
          </p>
        )}

        {(formData.vendedores || []).map((v) => (
          <div key={v.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-slate-50 border border-border-subtle">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-800 text-sm truncate">{v.nome}</p>
              <p className="text-xs text-slate-400">{v.estadoCivil} · CPF {v.cpf} · {v.cidade}/{v.estado}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-slate-200 text-slate-500 transition-colors"
                onClick={() => {
                  setEditingVendedor(v);
                  setVendedorForm({ nome: v.nome, nacionalidade: v.nacionalidade, estadoCivil: v.estadoCivil, rg: v.rg, cpf: v.cpf, endereco: v.endereco, numero: v.numero, bairro: v.bairro, cidade: v.cidade, estado: v.estado, cep: v.cep });
                  setShowVendedorForm(true);
                }}
              >
                <Pencil size={14} />
              </button>
              <button
                className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-red-50 text-red-400 transition-colors"
                onClick={() => handleDeleteVendedor(v.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}

        {showVendedorForm && (
          <div ref={vendedorFormRef} className="border border-border-subtle rounded-2xl p-6 space-y-4 bg-slate-50/50">
            <h5 className="font-bold text-slate-700 text-sm">{editingVendedor ? "Editar Vendedor" : "Novo Vendedor"}</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Nome Completo</label>
                <input className="input-field" placeholder="Nome Completo" value={vendedorForm.nome} onChange={(e) => setVendedorForm({ ...vendedorForm, nome: e.target.value })} />
              </div>
              <div>
                <label className="label">Nacionalidade</label>
                <input className="input-field" value={vendedorForm.nacionalidade} onChange={(e) => setVendedorForm({ ...vendedorForm, nacionalidade: e.target.value })} />
              </div>
              <div>
                <label className="label">Estado Civil</label>
                <select className="input-field" value={vendedorForm.estadoCivil} onChange={(e) => setVendedorForm({ ...vendedorForm, estadoCivil: e.target.value })}>
                  <option value="solteiro">Solteiro(a)</option>
                  <option value="casado">Casado(a)</option>
                  <option value="divorciado">Divorciado(a)</option>
                  <option value="viuvo">Viúvo(a)</option>
                  <option value="uniao_estavel">União Estável</option>
                </select>
              </div>
              <div>
                <label className="label">RG</label>
                <input className="input-field" value={vendedorForm.rg} onChange={(e) => setVendedorForm({ ...vendedorForm, rg: e.target.value })} />
              </div>
              <div>
                <label className="label">CPF</label>
                <input className="input-field" placeholder="000.000.000-00" value={vendedorForm.cpf} onChange={(e) => setVendedorForm({ ...vendedorForm, cpf: maskCPF(e.target.value) })} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Endereço (Tipo + Nome)</label>
                <input className="input-field" placeholder="Ex: Travessa Maranhão" value={vendedorForm.endereco} onChange={(e) => setVendedorForm({ ...vendedorForm, endereco: e.target.value })} />
              </div>
              <div>
                <label className="label">Número</label>
                <input className="input-field" placeholder="Ex: 353" value={vendedorForm.numero} onChange={(e) => setVendedorForm({ ...vendedorForm, numero: e.target.value })} />
              </div>
              <div>
                <label className="label">Bairro</label>
                <input className="input-field" placeholder="Ex: Aeroporto Velho" value={vendedorForm.bairro} onChange={(e) => setVendedorForm({ ...vendedorForm, bairro: e.target.value })} />
              </div>
              <div>
                <label className="label">Cidade</label>
                <input className="input-field" value={vendedorForm.cidade} onChange={(e) => setVendedorForm({ ...vendedorForm, cidade: e.target.value })} />
              </div>
              <div>
                <label className="label">Estado (UF)</label>
                <input className="input-field" maxLength={2} value={vendedorForm.estado} onChange={(e) => setVendedorForm({ ...vendedorForm, estado: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <label className="label">CEP</label>
                <input className="input-field" placeholder="00000-000" value={vendedorForm.cep} onChange={(e) => setVendedorForm({ ...vendedorForm, cep: maskCEP(e.target.value) })} />
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button className="btn-ghost h-10 px-5" onClick={() => { setShowVendedorForm(false); setEditingVendedor(null); setVendedorForm(emptyVendedor); }}>Cancelar</button>
              <button className="btn-primary h-10 px-8" onClick={handleSaveVendedor}>Salvar Vendedor</button>
            </div>
          </div>
        )}

        {(formData.vendedores || []).length > 0 && (
          <div className="pt-2 flex justify-end">
            <button
              onClick={() => {
                onSave(formData);
                alert("Vendedores salvos com sucesso!");
              }}
              className="btn-primary px-10"
            >
              Salvar Alterações
            </button>
          </div>
        )}
      </div>

      {/* Migração de dados */}
      <div className="card-premium space-y-4">
        <h4 className="font-bold text-slate-800 flex items-center gap-2">
          <Download size={18} className="text-primary-main" />
          Migração de Dados
        </h4>
        <p className="text-sm text-slate-500">
          Se você tinha dados salvos anteriormente no navegador (localStorage), clique abaixo para migrá-los para o banco de dados de forma permanente.
        </p>
        {migrateMsg && (
          <div className={`p-4 rounded-2xl text-sm font-semibold ${migrateMsg.includes('Erro') || migrateMsg.includes('Nenhum') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
            {migrateMsg}
          </div>
        )}
        <button
          onClick={handleMigrate}
          disabled={migrating}
          className="btn-ghost px-8 disabled:opacity-40"
        >
          {migrating ? (
            <><RefreshCw size={16} className="animate-spin" /> Migrando...</>
          ) : (
            <><Download size={16} /> Migrar dados do navegador para o banco de dados</>
          )}
        </button>
      </div>
      {/* Exportar / Importar Dados */}
      <div className="card-premium space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-slate-900 text-white rounded-xl">
            <Database size={18} />
          </div>
          <div>
            <h4 className="font-bold text-slate-800">Exportar e Importar Dados</h4>
            <p className="text-xs text-slate-400 mt-0.5">Faça backup completo ou restaure seus dados de um arquivo anterior</p>
          </div>
        </div>

        {/* Export */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-green-50 border border-green-100">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-green-100 rounded-xl mt-0.5">
              <Download size={16} className="text-green-700" />
            </div>
            <div>
              <p className="font-semibold text-green-900 text-sm">Exportar Backup</p>
              <p className="text-xs text-green-700 mt-0.5">
                {developments.length} empreendimento{developments.length !== 1 ? 's' : ''} · {clients.length} cliente{clients.length !== 1 ? 's' : ''} · {sales.length} venda{sales.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-700 hover:bg-green-800 text-white rounded-xl text-sm font-semibold transition-colors whitespace-nowrap"
          >
            <Download size={15} /> Baixar .json
          </button>
        </div>

        {/* Import */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-blue-50 border border-blue-100">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-xl mt-0.5">
                <Upload size={16} className="text-blue-700" />
              </div>
              <div>
                <p className="font-semibold text-blue-900 text-sm">Importar Backup</p>
                <p className="text-xs text-blue-700 mt-0.5">Selecione um arquivo .json exportado anteriormente</p>
              </div>
            </div>
            <button
              onClick={() => importInputRef.current?.click()}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-semibold transition-colors whitespace-nowrap"
            >
              <Upload size={15} /> Selecionar arquivo
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {importError && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100">
              <AlertTriangle size={16} className="text-red-500 shrink-0" />
              <p className="text-sm text-red-700 font-medium">{importError}</p>
            </div>
          )}

          {importSuccess && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-green-50 border border-green-100">
              <ShieldCheck size={16} className="text-green-600 shrink-0" />
              <p className="text-sm text-green-700 font-semibold">{importSuccess}</p>
            </div>
          )}

          {importPreview && (
            <div className="border border-border-subtle rounded-2xl p-5 space-y-5 bg-slate-50/60">
              <div>
                <p className="font-bold text-slate-800 text-sm mb-1">Prévia do arquivo</p>
                {importPreview.exportedAt && (
                  <p className="text-xs text-slate-400">
                    Exportado em: {new Date(importPreview.exportedAt).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-white rounded-xl border border-border-subtle text-center">
                  <p className="text-lg font-bold text-slate-800">{importPreview.empreendimentos.length}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Empreendimentos</p>
                </div>
                <div className="p-3 bg-white rounded-xl border border-border-subtle text-center">
                  <p className="text-lg font-bold text-slate-800">{importPreview.clientes.length}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Clientes</p>
                </div>
                <div className="p-3 bg-white rounded-xl border border-border-subtle text-center">
                  <p className="text-lg font-bold text-slate-800">{importPreview.vendas.length}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Vendas</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Modo de importação</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => setImportMode('merge')}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${importMode === 'merge' ? 'border-primary-main bg-primary-main/5' : 'border-slate-200 bg-white'}`}
                  >
                    <p className={`font-bold text-sm ${importMode === 'merge' ? 'text-primary-main' : 'text-slate-700'}`}>Mesclar</p>
                    <p className="text-xs text-slate-400 mt-1">Adiciona os registros do backup. Itens com o mesmo ID serão atualizados.</p>
                  </button>
                  <button
                    onClick={() => setImportMode('replace')}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${importMode === 'replace' ? 'border-red-500 bg-red-50' : 'border-slate-200 bg-white'}`}
                  >
                    <p className={`font-bold text-sm ${importMode === 'replace' ? 'text-red-600' : 'text-slate-700'}`}>Substituir tudo</p>
                    <p className="text-xs text-slate-400 mt-1">Apaga todos os dados atuais e substitui pelo conteúdo do backup.</p>
                  </button>
                </div>
                {importMode === 'replace' && (
                  <div className="flex items-center gap-2 mt-3 p-3 rounded-xl bg-red-50 border border-red-100">
                    <AlertTriangle size={14} className="text-red-500 shrink-0" />
                    <p className="text-xs text-red-600 font-medium">Atenção: esta ação não pode ser desfeita. Todos os dados atuais serão perdidos.</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-end pt-1">
                <button
                  className="btn-ghost px-6 h-10"
                  onClick={() => { setImportPreview(null); setImportError(''); }}
                >
                  Cancelar
                </button>
                <button
                  className={`flex items-center gap-2 px-8 h-10 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50 ${importMode === 'replace' ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-main hover:bg-primary-dark'}`}
                  onClick={handleConfirmImport}
                  disabled={importing}
                >
                  {importing ? (
                    <><RefreshCw size={14} className="animate-spin" /> Importando...</>
                  ) : (
                    <><Check size={14} /> Confirmar importação</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Exportar / Importar apenas Configurações */}
      <div className="card-premium space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary-main text-white rounded-xl">
            <Settings size={18} />
          </div>
          <div>
            <h4 className="font-bold text-slate-800">Exportar / Importar Configurações</h4>
            <p className="text-xs text-slate-400 mt-0.5">Salve ou restaure apenas tema, vendedores e proprietários — sem mover seus dados</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-primary-main/5 border border-primary-main/20">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary-main/10 rounded-xl mt-0.5">
              <Download size={16} className="text-primary-main" />
            </div>
            <div>
              <p className="font-semibold text-slate-800 text-sm">Exportar Configurações</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Tema · {(formData.vendedores || []).length} vendedor(es) · {(config.proprietarios || []).length} proprietário(s)
              </p>
            </div>
          </div>
          <button
            onClick={handleExportConfig}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-main hover:opacity-90 text-white rounded-xl text-sm font-semibold transition-all whitespace-nowrap"
          >
            <Download size={15} /> Baixar .json
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-slate-200 rounded-xl mt-0.5">
              <Upload size={16} className="text-slate-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-700 text-sm">Importar Configurações</p>
              <p className="text-xs text-slate-400 mt-0.5">Selecione um arquivo .json exportado por este app</p>
            </div>
          </div>
          <button
            onClick={() => configImportRef.current?.click()}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition-all whitespace-nowrap"
          >
            <Upload size={15} /> Selecionar arquivo
          </button>
          <input ref={configImportRef} type="file" accept=".json" className="hidden" onChange={handleImportConfig} />
        </div>

        {configImportError && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100">
            <AlertTriangle size={16} className="text-red-500 shrink-0" />
            <p className="text-sm text-red-700 font-medium">{configImportError}</p>
          </div>
        )}
        {configImportSuccess && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-green-50 border border-green-100">
            <ShieldCheck size={16} className="text-green-600 shrink-0" />
            <p className="text-sm text-green-700 font-semibold">{configImportSuccess}</p>
          </div>
        )}
      </div>

      {DeleteModal}
    </div>
  );
};

const CalculatorSection = () => {
  const [data, setData] = useState({
    valor: undefined as number | undefined,
    entrada: undefined as number | undefined,
    parcelas: undefined as number | undefined,
    comissaoPercent: 5,
    parcelaValue: undefined as number | undefined,
  });

  const handleCalcChange = (field: string, value: number) => {
    let updated = { ...data, [field]: value };
    if (field === "valor" || field === "entrada" || field === "parcelas") {
      const v = field === "valor" ? value : data.valor || 0;
      const e = field === "entrada" ? value : data.entrada || 0;
      const p = field === "parcelas" ? value : data.parcelas || 1;
      updated.parcelaValue = Number(((v - e) / (p || 1)).toFixed(2));
    } else if (field === "parcelaValue") {
      const pv = value;
      const e = data.entrada || 0;
      const p = data.parcelas || 1;
      updated.valor = Number((pv * p + e).toFixed(2));
    }
    setData(updated);
  };

  const comissao = (data.valor || 0) * (data.comissaoPercent / 100);

  return (
    <div className="max-w-5xl mx-auto pb-32 lg:pb-0">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8 items-start">
        <div className="lg:col-span-7 space-y-6">
          <div className="card-premium bg-surface-card/50 backdrop-blur-sm">
            <h3 className="text-xl font-display font-bold text-slate-800 mb-8 flex items-center gap-3">
              <div className="p-2 bg-primary-main/10 text-primary-main rounded-xl">
                <Calculator size={20} className="stroke-[2.5]" />
              </div>
              Simulador Inteligente
            </h3>

            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="sm:col-span-2">
                  <label className="label font-bold text-primary-main">
                    Valor Total do Lote (R$)
                  </label>
                  <input
                    type="number"
                    className="input-field border-primary-main/20 bg-primary-main/[0.02] text-2xl font-display font-bold text-primary-dark"
                    value={data.valor ?? ""}
                    onChange={(e) =>
                      handleCalcChange(
                        "valor",
                        e.target.value === "" ? 0 : Number(e.target.value),
                      )
                    }
                  />
                </div>
                <div>
                  <label className="label">Entrada (R$)</label>
                  <input
                    type="number"
                    className="input-field font-bold text-lg"
                    value={data.entrada ?? ""}
                    onChange={(e) =>
                      handleCalcChange(
                        "entrada",
                        e.target.value === "" ? 0 : Number(e.target.value),
                      )
                    }
                  />
                </div>
                <div>
                  <label className="label">Qtd. Parcelas</label>
                  <input
                    type="number"
                    className="input-field font-bold text-lg"
                    value={data.parcelas ?? ""}
                    onChange={(e) =>
                      handleCalcChange(
                        "parcelas",
                        e.target.value === "" ? 1 : Number(e.target.value),
                      )
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label font-bold text-chumbo-base opacity-70">
                    Valor Desejado da Parcela (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field border-chumbo-base/20 bg-chumbo-base/[0.02] text-2xl font-display font-bold text-slate-800"
                    value={data.parcelaValue ?? ""}
                    onChange={(e) =>
                      handleCalcChange(
                        "parcelaValue",
                        e.target.value === "" ? 0 : Number(e.target.value),
                      )
                    }
                  />
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-2 ml-1 italic opacity-60">
                    Alterar o valor da parcela recalcula o valor total
                    automaticamente
                  </p>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100">
                <label className="label">Percentual de Comissão (%)</label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1"
                    max="15"
                    step="0.5"
                    className="flex-1 accent-primary-main"
                    value={data.comissaoPercent}
                    onChange={(e) =>
                      setData({
                        ...data,
                        comissaoPercent: Number(e.target.value),
                      })
                    }
                  />
                  <span className="w-16 text-center font-display font-bold text-primary-main bg-primary-main/10 py-2 rounded-xl">
                    {data.comissaoPercent}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-12 xl:col-span-5">
          <div className="bg-slate-900 text-white rounded-3xl sm:rounded-[40px] p-6 sm:p-10 shadow-[0_30px_100px_-20px_rgba(15,23,42,0.3)] relative overflow-hidden group border border-white/5">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-light/10 rounded-full -mr-24 -mt-24 blur-3xl group-hover:bg-primary-light/20 transition-all duration-1000" />

            <h3 className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-primary-light opacity-60 mb-6 sm:mb-10">
              Resumo da Proposta
            </h3>

            <div className="space-y-6 sm:space-y-8 relative">
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest opacity-60">
                  Total do Lote
                </p>
                <p className="text-4xl font-display font-bold tracking-tight">
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(data.valor || 0)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:gap-8">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest opacity-60">
                    Entrada
                  </p>
                  <p className="text-xl font-display font-bold text-primary-light">
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(data.entrada || 0)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest opacity-60">
                    Saldo
                  </p>
                  <p className="text-xl font-display font-bold text-white/90">
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format((data.valor || 0) - (data.entrada || 0))}
                  </p>
                </div>
              </div>

              <div className="pt-6 sm:pt-10 border-t border-white/10">
                <p className="text-[10px] font-extrabold uppercase text-primary-light/60 tracking-widest mb-3">
                  Mensalidade Recomendada
                </p>
                <div className="flex items-baseline gap-3">
                  <p className="text-3xl sm:text-6xl font-display font-bold text-white tracking-tighter drop-shadow-2xl">
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(data.parcelaValue || 0)}
                  </p>
                  <span className="text-sm font-medium text-white/30">
                    / mês
                  </span>
                </div>
              </div>

              <div className="mt-6 sm:mt-12 p-5 sm:p-8 bg-white/5 rounded-2xl sm:rounded-[32px] border border-white/10 backdrop-blur-md shadow-inner">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-primary-light uppercase tracking-widest leading-none mb-1">
                      Estimativa de Ganhos
                    </p>
                    <p className="text-xs font-medium text-white/40 italic">
                      Comissão fixa de {data.comissaoPercent}%
                    </p>
                  </div>
                  <p className="text-3xl font-display font-bold text-white">
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(comissao)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => window.print()}
            className="w-full mt-6 btn-ghost !border-slate-200 !text-slate-400 hover:!text-slate-600 group"
          >
            <Printer
              size={18}
              className="group-hover:scale-110 transition-transform"
            />
            <span>Gerar Espelho da Proposta</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Proprietarios Section ---

const ProprietariosSection = ({
  config,
  onSave,
}: {
  config: AppConfig;
  onSave: (c: AppConfig) => void;
}) => {
  const proprietarios = config.proprietarios || [];
  const emptyProp: Omit<Proprietario, "id"> = {
    nome: "", nacionalidade: "Brasileiro", estadoCivil: "solteiro",
    rg: "", cpf: "", endereco: "", numero: "", bairro: "", cidade: "Santarém", estado: "PA", cep: "",
  };
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Proprietario, "id">>(emptyProp);
  const [cpfErr, setCpfErr] = useState<string | null>(null);
  const [fetchingCep, setFetchingCep] = useState(false);
  const propFormRef = useRef<HTMLDivElement>(null);
  const { request: requestDelete, Modal: DeleteModal } = useDeleteConfirm();

  const buscarCEPProp = async (cep: string) => {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setFetchingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm((prev) => ({
          ...prev,
          endereco: data.logradouro || prev.endereco,
          bairro: data.bairro || prev.bairro,
          cidade: data.localidade || prev.cidade,
          estado: data.uf || prev.estado,
        }));
      }
    } catch {}
    setFetchingCep(false);
  };

  const handleSave = () => {
    if (!form.nome.trim()) { triggerShake(propFormRef.current); return; }
    const st = cpfStatus(form.cpf);
    if (st === "invalid") { setCpfErr("CPF inválido"); triggerShake(propFormRef.current); return; }
    setCpfErr(null);
    let updated: Proprietario[];
    if (editingId) {
      updated = proprietarios.map((p) => p.id === editingId ? { ...form, id: editingId } : p);
    } else {
      updated = [...proprietarios, { ...form, id: `prop-${Date.now()}` }];
    }
    onSave({ ...config, proprietarios: updated });
    setShowForm(false);
    setEditingId(null);
    setForm(emptyProp);
  };

  const handleEdit = (p: Proprietario) => {
    setEditingId(p.id);
    setForm({ nome: p.nome, nacionalidade: p.nacionalidade, estadoCivil: p.estadoCivil, rg: p.rg, cpf: p.cpf, endereco: p.endereco, numero: p.numero, bairro: p.bairro, cidade: p.cidade, estado: p.estado, cep: p.cep });
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    requestDelete("Remover este proprietário?", () => {
      onSave({ ...config, proprietarios: proprietarios.filter((p) => p.id !== id) });
    });
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary-main rounded-2xl text-primary-contrast shadow-lg shadow-primary-main/20">
            <UserCheck size={24} />
          </div>
          <div>
            <h3 className="text-xl font-display font-bold text-slate-800">Proprietários</h3>
            <p className="text-sm text-slate-400 font-medium">Donos dos empreendimentos — aparecem como VENDEDOR nos contratos</p>
          </div>
        </div>
        <button
          className="btn-primary flex-none"
          onClick={() => { setEditingId(null); setForm(emptyProp); setCpfErr(null); setShowForm(true); }}
        >
          <Plus size={18} /> Novo Proprietário
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div ref={propFormRef} className="card-premium space-y-6 bg-slate-50/50">
              <h4 className="font-bold text-slate-800 text-base">{editingId ? "Editar Proprietário" : "Novo Proprietário"}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">Nome Completo *</label>
                  <input className="input-field" placeholder="Nome Completo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                </div>
                <div>
                  <label className="label">Nacionalidade</label>
                  <input className="input-field" value={form.nacionalidade} onChange={(e) => setForm({ ...form, nacionalidade: e.target.value })} />
                </div>
                <div>
                  <label className="label">Estado Civil</label>
                  <select className="input-field" value={form.estadoCivil} onChange={(e) => setForm({ ...form, estadoCivil: e.target.value })}>
                    <option value="solteiro">Solteiro(a)</option>
                    <option value="casado">Casado(a)</option>
                    <option value="divorciado">Divorciado(a)</option>
                    <option value="viuvo">Viúvo(a)</option>
                    <option value="uniao_estavel">União Estável</option>
                  </select>
                </div>
                <div>
                  <label className="label">RG</label>
                  <input className="input-field" placeholder="Ex: 3215776" value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} />
                </div>
                <div>
                  <label className="label">CPF *</label>
                  <input
                    className={`input-field ${cpfErr ? "border-red-400 focus:ring-red-300" : ""}`}
                    placeholder="000.000.000-00"
                    value={form.cpf}
                    onChange={(e) => {
                      const masked = maskCPF(e.target.value);
                      setForm({ ...form, cpf: masked });
                      const st = cpfStatus(masked);
                      setCpfErr(st === "invalid" ? "CPF inválido" : null);
                    }}
                  />
                  {cpfErr && <p className="text-red-500 text-xs mt-1 font-medium">{cpfErr}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Endereço (Tipo + Nome)</label>
                  <input className="input-field" placeholder="Ex: Travessa Maranhão" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
                </div>
                <div>
                  <label className="label">Número</label>
                  <input className="input-field" placeholder="Ex: 353" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
                </div>
                <div>
                  <label className="label">Bairro</label>
                  <input className="input-field" placeholder="Ex: Aeroporto Velho" value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
                </div>
                <div>
                  <label className="label">Cidade</label>
                  <input className="input-field" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
                </div>
                <div>
                  <label className="label">Estado (UF)</label>
                  <input className="input-field" maxLength={2} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })} />
                </div>
                <div>
                  <label className="label">
                    CEP {fetchingCep && <span className="text-[9px] text-primary-main font-bold ml-1">buscando...</span>}
                  </label>
                  <input
                    className="input-field"
                    placeholder="00000-000"
                    value={form.cep}
                    onChange={(e) => {
                      const val = maskCEP(e.target.value);
                      setForm({ ...form, cep: val });
                      if (val.replace(/\D/g, "").length === 8) buscarCEPProp(val);
                    }}
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button className="btn-ghost h-10 px-6" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyProp); setCpfErr(null); }}>Cancelar</button>
                <button className="btn-primary h-10 px-10" onClick={handleSave}>Salvar Proprietário</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {proprietarios.length === 0 && !showForm && (
        <div className="py-20 text-center flex flex-col items-center gap-4 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
          <div className="p-4 bg-surface-card rounded-full text-slate-300 shadow-sm">
            <UserCheck size={48} strokeWidth={1} />
          </div>
          <div>
            <p className="text-slate-600 font-bold">Nenhum proprietário cadastrado</p>
            <p className="text-slate-400 text-sm mt-1">Proprietários são os donos dos terrenos e aparecem como VENDEDOR nos contratos.</p>
          </div>
          <button onClick={() => setShowForm(true)} className="btn-ghost text-sm font-bold px-8 mt-2">
            Cadastrar Primeiro Proprietário
          </button>
        </div>
      )}

      <div className="space-y-4">
        {proprietarios.map((p) => (
          <motion.div
            key={p.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-premium flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          >
            <div className="flex items-center gap-4 flex-1">
              <div className="p-3 bg-primary-main/10 text-primary-main rounded-2xl flex-none">
                <UserCheck size={22} />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-800 text-base">{p.nome}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {p.estadoCivil} · CPF {p.cpf} · RG {p.rg}
                </p>
                <p className="text-xs text-slate-400">
                  {p.endereco}, nº {p.numero} · {p.bairro} · {p.cidade}/{p.estado} · CEP {p.cep}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-none">
              <button
                className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"
                onClick={() => handleEdit(p)}
              >
                <Pencil size={16} />
              </button>
              <button
                className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-red-50 text-red-400 transition-colors"
                onClick={() => handleDelete(p.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
      {DeleteModal}
    </div>
  );
};

// --- Usuários Section (admin only) ---

const UsuariosSection = ({ isAdmin, userId, userEmail }: { isAdmin?: boolean; userId?: string; userEmail?: string }) => {
  const SECTION_LABELS: Record<string, string> = {
    dashboard: "Dashboard",
    vendas: "Nova Venda",
    empreendimentos: "Empreendimentos",
    proprietarios: "Proprietários",
    contratos: "Contratos",
    clientes: "Clientes",
    aniversarios: "Aniversários",
    calculadora: "Calculadora",
    config: "Configurações",
    usuarios: "Usuários",
  };

  const ALL_SECTIONS_LIST = ["dashboard","vendas","empreendimentos","proprietarios","contratos","clientes","aniversarios","calculadora","config"];

  const [users, setUsers] = useState<{ id: string; email: string; isAdmin: boolean; createdAt: string; permissions: Record<string, boolean>; profile: { nome?: string; creci?: string; telefone?: string } }[]>([]);

  // Profile state
  const [profile, setProfile] = useState<{ nome: string; creci: string; telefone: string }>({ nome: "", creci: "", telefone: "" });
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await authFetch("/api/auth/profile");
        if (res.ok) {
          const data = await res.json();
          setProfile({ nome: data.nome || "", creci: data.creci || "", telefone: data.telefone || "" });
        }
      } catch {}
      setProfileLoading(false);
    };
    loadProfile();
  }, []);

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const res = await authFetch("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ nome: profile.nome, creci: profile.creci, telefone: profile.telefone }),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      setProfileMsg({ type: "ok", text: "Perfil salvo com sucesso!" });
    } catch {
      setProfileMsg({ type: "err", text: "Erro ao salvar perfil. Tente novamente." });
    } finally {
      setProfileSaving(false);
    }
  };
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newNome, setNewNome] = useState("");
  const [newCreci, setNewCreci] = useState("");
  const [newTelefone, setNewTelefone] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingPermUser, setEditingPermUser] = useState<string | null>(null);
  const [pendingPerms, setPendingPerms] = useState<Record<string, boolean>>({});
  const [savingPerms, setSavingPerms] = useState(false);
  const [editingProfileUser, setEditingProfileUser] = useState<string | null>(null);
  const [editProfileData, setEditProfileData] = useState<{ nome: string; creci: string; telefone: string }>({ nome: "", creci: "", telefone: "" });
  const [savingUserProfile, setSavingUserProfile] = useState(false);
  const { request: requestDelete, Modal: DeleteModal } = useDeleteConfirm();

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar usuário.");
      // Salvar permissões padrão para o novo usuário
      const defaultPerms: Record<string, boolean> = {
        dashboard: true, vendas: true, empreendimentos: false, proprietarios: false,
        contratos: true, clientes: true, aniversarios: true, calculadora: true, config: false, usuarios: false,
      };
      await fetch(`/api/admin/users/${data.id}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: defaultPerms }),
      });
      // Salvar perfil (nome, CRECI, telefone) se informado
      if (newNome.trim() || newCreci.trim() || newTelefone.trim()) {
        await authFetch(`/api/admin/users/${data.id}/profile`, {
          method: "PATCH",
          body: JSON.stringify({ nome: newNome, creci: newCreci, telefone: newTelefone }),
        });
      }
      setSuccess(`Usuário ${newEmail} criado com sucesso!`);
      setNewEmail("");
      setNewPassword("");
      setNewNome("");
      setNewCreci("");
      setNewTelefone("");
      await loadUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleOpenEditProfile = (u: typeof users[0]) => {
    setEditProfileData({ nome: u.profile?.nome || "", creci: u.profile?.creci || "", telefone: u.profile?.telefone || "" });
    setEditingProfileUser(editingProfileUser === u.id ? null : u.id);
    setEditingPermUser(null);
  };

  const handleSaveUserProfile = async () => {
    if (!editingProfileUser) return;
    setSavingUserProfile(true);
    try {
      const res = await authFetch(`/api/admin/users/${editingProfileUser}/profile`, {
        method: "PATCH",
        body: JSON.stringify(editProfileData),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      await loadUsers();
      setEditingProfileUser(null);
    } catch (err: any) {
      alert(err.message || "Erro ao salvar perfil.");
    } finally {
      setSavingUserProfile(false);
    }
  };

  const handleDelete = async (id: string, email: string) => {
    requestDelete(`Excluir o usuário ${email}? Esta ação não pode ser desfeita.`, async () => {
      try {
        const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        await loadUsers();
      } catch (err: any) {
        alert(err.message);
      }
    });
  };

  const handleOpenPerms = (u: typeof users[0]) => {
    const defaults: Record<string, boolean> = {
      dashboard: true, vendas: true, empreendimentos: false, proprietarios: false,
      contratos: true, clientes: true, aniversarios: true, calculadora: true, config: false,
    };
    // Se o usuário já tem permissões salvas, usa elas; senão usa os defaults
    const saved = u.permissions && Object.keys(u.permissions).length > 0 ? u.permissions : defaults;
    setPendingPerms(saved);
    setEditingPermUser(u.id);
  };

  const handleSavePerms = async () => {
    if (!editingPermUser) return;
    setSavingPerms(true);
    try {
      const res = await fetch(`/api/admin/users/${editingPermUser}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: pendingPerms }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadUsers();
      setEditingPermUser(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingPerms(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">

      {/* Meu Perfil — visible to all users */}
      <div className="card-premium space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-slate-900 text-white rounded-xl">
            <User size={18} />
          </div>
          <div>
            <h4 className="font-bold text-slate-800">Meu Perfil</h4>
            <p className="text-xs text-slate-400 mt-0.5">{userEmail}</p>
          </div>
        </div>

        {profileLoading ? (
          <p className="text-slate-400 text-sm">Carregando...</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Nome Completo (aparece nos recibos)</label>
                <input
                  className="input-field"
                  placeholder="Ex: Rafael Tavares Matos"
                  value={profile.nome}
                  onChange={(e) => setProfile({ ...profile, nome: e.target.value })}
                />
              </div>
              <div>
                <label className="label">CRECI</label>
                <input
                  className="input-field"
                  placeholder="Ex: 13919"
                  value={profile.creci}
                  onChange={(e) => setProfile({ ...profile, creci: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Telefone / WhatsApp</label>
                <input
                  className="input-field"
                  placeholder="Ex: 93992332012"
                  value={profile.telefone}
                  onChange={(e) => setProfile({ ...profile, telefone: maskPhone(e.target.value) })}
                />
              </div>
            </div>

            {profileMsg && (
              <div className={`flex items-center gap-2 p-3 rounded-xl text-sm font-semibold ${profileMsg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                {profileMsg.type === "ok" ? <ShieldCheck size={15} /> : <AlertTriangle size={15} />}
                {profileMsg.text}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleSaveProfile}
                disabled={profileSaving}
                className="btn-primary px-10 disabled:opacity-50"
              >
                {profileSaving ? <><RefreshCw size={14} className="animate-spin" /> Salvando...</> : <><Check size={14} /> Salvar Perfil</>}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Admin-only section */}
      {isAdmin && (
      <>
      {/* Create user card */}
      <div className="bg-surface-card rounded-3xl p-5 sm:p-8 shadow-sm border border-border-subtle">
        <h2 className="text-lg font-bold text-primary-main mb-6 uppercase tracking-widest text-[11px]">
          Criar Novo Usuário
        </h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">E-mail</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="corretor@email.com"
                className="w-full h-12 px-4 rounded-xl border border-border-subtle bg-surface-bg text-sm font-medium focus:ring-2 focus:ring-primary-main/30 focus:border-primary-main outline-none transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Senha (mín. 6 caracteres)</label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-12 px-4 rounded-xl border border-border-subtle bg-surface-bg text-sm font-medium focus:ring-2 focus:ring-primary-main/30 focus:border-primary-main outline-none transition-all"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Nome Completo</label>
              <input
                type="text"
                value={newNome}
                onChange={(e) => setNewNome(e.target.value)}
                placeholder="Ex: João da Silva"
                className="w-full h-12 px-4 rounded-xl border border-border-subtle bg-surface-bg text-sm font-medium focus:ring-2 focus:ring-primary-main/30 focus:border-primary-main outline-none transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">CRECI <span className="normal-case text-slate-300">(opcional)</span></label>
              <input
                type="text"
                value={newCreci}
                onChange={(e) => setNewCreci(e.target.value)}
                placeholder="Ex: 13919"
                className="w-full h-12 px-4 rounded-xl border border-border-subtle bg-surface-bg text-sm font-medium focus:ring-2 focus:ring-primary-main/30 focus:border-primary-main outline-none transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Telefone / WhatsApp <span className="normal-case text-slate-300">(opcional)</span></label>
              <input
                type="text"
                value={newTelefone}
                onChange={(e) => setNewTelefone(maskPhone(e.target.value))}
                placeholder="Ex: (93) 99999-9999"
                className="w-full h-12 px-4 rounded-xl border border-border-subtle bg-surface-bg text-sm font-medium focus:ring-2 focus:ring-primary-main/30 focus:border-primary-main outline-none transition-all"
              />
            </div>
          </div>
          {error && <p className="text-[11px] font-bold text-red-500 uppercase tracking-widest">{error}</p>}
          {success && <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest">{success}</p>}
          <button
            type="submit"
            disabled={creating}
            className="h-12 px-8 bg-primary-main text-primary-contrast rounded-xl text-[11px] font-black uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-50"
          >
            {creating ? "Criando..." : "Criar Usuário"}
          </button>
        </form>
      </div>

      {/* User list */}
      <div className="bg-surface-card rounded-3xl p-5 sm:p-8 shadow-sm border border-border-subtle space-y-4">
        <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-400">
          Usuários Cadastrados
        </h2>
        {loading ? (
          <p className="text-slate-400 text-sm">Carregando...</p>
        ) : (
          <div className="space-y-3">
            {users.map((u) => (
              <div key={u.id} className="rounded-2xl border border-border-subtle overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-surface-bg">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-700 truncate">{u.email}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-widest">
                      {u.isAdmin ? "Administrador" : "Corretor"} · criado em {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                    {(u.profile?.nome || u.profile?.creci) && (
                      <p className="text-[10px] text-primary-main mt-0.5 font-bold">
                        {u.profile?.nome}{u.profile?.creci ? ` · CRECI ${u.profile.creci}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => handleOpenEditProfile(u)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${editingProfileUser === u.id ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-800 hover:text-white"}`}
                      title="Editar nome, CRECI e telefone"
                    >
                      <User size={12} />
                      Perfil
                    </button>
                    {!u.isAdmin && (
                      <>
                        <button
                          onClick={() => editingPermUser === u.id ? setEditingPermUser(null) : handleOpenPerms(u)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${editingPermUser === u.id ? "bg-primary-main text-white" : "bg-primary-main/10 text-primary-main hover:bg-primary-main hover:text-white"}`}
                        >
                          <Settings size={12} />
                          Permissões
                        </button>
                        <button
                          onClick={() => handleDelete(u.id, u.email)}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                          title="Excluir usuário"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                    {u.isAdmin && (
                      <span className="text-[10px] font-black px-3 py-1.5 bg-amber-50 text-amber-600 rounded-xl uppercase tracking-widest">
                        Acesso Total
                      </span>
                    )}
                  </div>
                </div>

                {/* Profile edit panel */}
                <AnimatePresence>
                  {editingProfileUser === u.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-5 border-t border-border-subtle bg-white space-y-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Perfil de <span className="text-slate-700">{u.email.split("@")[0]}</span> — aparece nos recibos
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="sm:col-span-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Nome Completo</label>
                            <input
                              className="w-full h-10 px-3 rounded-xl border border-border-subtle bg-surface-bg text-sm font-medium focus:ring-2 focus:ring-primary-main/30 outline-none transition-all"
                              placeholder="Ex: João da Silva"
                              value={editProfileData.nome}
                              onChange={(e) => setEditProfileData({ ...editProfileData, nome: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">CRECI</label>
                            <input
                              className="w-full h-10 px-3 rounded-xl border border-border-subtle bg-surface-bg text-sm font-medium focus:ring-2 focus:ring-primary-main/30 outline-none transition-all"
                              placeholder="Ex: 13919"
                              value={editProfileData.creci}
                              onChange={(e) => setEditProfileData({ ...editProfileData, creci: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Telefone</label>
                            <input
                              className="w-full h-10 px-3 rounded-xl border border-border-subtle bg-surface-bg text-sm font-medium focus:ring-2 focus:ring-primary-main/30 outline-none transition-all"
                              placeholder="Ex: (93) 99999-9999"
                              value={editProfileData.telefone}
                              onChange={(e) => setEditProfileData({ ...editProfileData, telefone: maskPhone(e.target.value) })}
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-1">
                          <button onClick={() => setEditingProfileUser(null)} className="btn-secondary px-5 py-2 text-xs">Cancelar</button>
                          <button
                            onClick={handleSaveUserProfile}
                            disabled={savingUserProfile}
                            className="btn-primary px-6 py-2 text-xs flex items-center gap-2"
                          >
                            {savingUserProfile ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                            Salvar Perfil
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Permissions panel */}
                <AnimatePresence>
                  {editingPermUser === u.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-5 border-t border-border-subtle bg-white space-y-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Seções que <span className="text-primary-main">{u.email.split("@")[0]}</span> pode acessar:
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {ALL_SECTIONS_LIST.map((sec) => {
                            const enabled = pendingPerms[sec] ?? false;
                            return (
                              <button
                                key={sec}
                                type="button"
                                onClick={() => setPendingPerms(prev => ({ ...prev, [sec]: !enabled }))}
                                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${enabled ? "bg-primary-main/10 border-primary-main text-primary-main" : "bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300"}`}
                              >
                                <div className={`w-4 h-4 rounded flex items-center justify-center flex-none transition-all ${enabled ? "bg-primary-main text-white" : "border-2 border-slate-300"}`}>
                                  {enabled && <Check size={10} />}
                                </div>
                                {SECTION_LABELS[sec]}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex justify-end gap-3 pt-1">
                          <button onClick={() => setEditingPermUser(null)} className="btn-secondary px-5 py-2 text-xs">Cancelar</button>
                          <button
                            onClick={handleSavePerms}
                            disabled={savingPerms}
                            className="btn-primary px-6 py-2 text-xs flex items-center gap-2"
                          >
                            {savingPerms ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                            Salvar Permissões
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>
      {DeleteModal}
      </>
      )}
    </div>
  );
};

// --- Main App ---

export default function App({ onLogout, isAdmin, userId, userEmail, userPermissions }: { onLogout?: () => void; isAdmin?: boolean; userId?: string; userEmail?: string; userPermissions?: Record<string, boolean> }) {
  const [section, setSection] = useState<Section>("dashboard");
  const [developments, setDevelopments] = useState<Empreendimento[]>([]);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [sales, setSales] = useState<Venda[]>([]);
  const [config, setConfig] = useState<AppConfig>({
    theme: "standard",
    vendedores: [],
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [forceDesktop, setForceDesktop] = useState(() => localStorage.getItem('force-desktop') === 'true');
  const [userProfile, setUserProfile] = useState<{ nome: string; creci: string; telefone: string }>({ nome: "", creci: "", telefone: "" });

  useEffect(() => {
    authFetch("/api/auth/profile")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setUserProfile({ nome: d.nome || "", creci: d.creci || "", telefone: d.telefone || "" }); })
      .catch(() => {});
  }, []);

  const toggleDesktop = () => {
    const next = !forceDesktop;
    setForceDesktop(next);
    localStorage.setItem('force-desktop', String(next));
  };
  const [contractToOpen, setContractToOpen] = useState<Venda | null>(null);
  const [prefilledSale, setPrefilledSale] = useState<
    Partial<Venda> | undefined
  >(undefined);
  const [editingVendaEntry, setEditingVendaEntry] = useState<{
    venda: Venda;
    cliente: Cliente | null;
  } | null>(null);

  useEffect(() => {
    let subDevs: { unsubscribe: () => void } | null = null;
    let subClientes: { unsubscribe: () => void } | null = null;
    let subVendas: { unsubscribe: () => void } | null = null;

    const load = async () => {
      try {
        const results = await Promise.allSettled([
          dbService.getEmpreendimentos(),
          dbService.getClientes(),
          dbService.getVendas(),
          dbService.getAppConfig(),
        ]);

        if (results[0].status === 'fulfilled') setDevelopments(results[0].value);
        else console.error('Erro empreendimentos:', results[0].reason);

        if (results[1].status === 'fulfilled') setClients(results[1].value);
        else console.error('Erro clientes:', results[1].reason);

        if (results[2].status === 'fulfilled') setSales(results[2].value);
        else console.error('Erro vendas:', results[2].reason);

        if (results[3].status === 'fulfilled') setConfig(results[3].value);
        else console.error('Erro config:', results[3].reason);

        const anyFailed = results.some(r => r.status === 'rejected');
        if (anyFailed) {
          const firstErr = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
          console.error('Erro ao carregar dados:', JSON.stringify(firstErr.reason));
        }

        setIsLoaded(true);

        subDevs = dbService.subscribeToEmpreendimentos((d) => setDevelopments(d));
        subClientes = dbService.subscribeToClientes((d) => setClients(d));
        subVendas = dbService.subscribeToVendas((d) => setSales(d));
      } catch (e: unknown) {
        console.error('Erro ao carregar dados:', e);
        alert('Erro crítico ao carregar dados:\n' + JSON.stringify(e));
        setIsLoaded(true);
      }
    };
    load();

    return () => {
      subDevs?.unsubscribe();
      subClientes?.unsubscribe();
      subVendas?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", config.theme);
  }, [config.theme]);

  const saveDev = (newDev: Empreendimento) => {
    if (!isLoaded) return;
    const exists = developments.some((d) => d.id === newDev.id);
    const updated = exists
      ? developments.map((d) => (d.id === newDev.id ? newDev : d))
      : [...developments, newDev];
    setDevelopments(updated);
    dbService.saveEmpreendimentos(updated).catch((e) => alert('Erro ao salvar empreendimento:\n' + JSON.stringify(e)));
  };

  const deleteDev = (id: string) => {
    const updated = developments.filter((d) => d.id !== id);
    setDevelopments(updated);
    dbService.saveEmpreendimentos(updated).catch((e) => alert('Erro ao deletar empreendimento:\n' + JSON.stringify(e)));
  };

  const saveSale = (newSale: Venda, newClient: Cliente) => {
    if (!isLoaded) return newSale;
    let updatedClients = [...clients];
    const existingClientIndex = clients.findIndex(
      (c) => c.cpf === newClient.cpf,
    );
    if (existingClientIndex === -1) {
      updatedClients.push(newClient);
      setClients(updatedClients);
      dbService.saveClientes(updatedClients).catch(console.error);
    } else {
      newSale.clienteId = clients[existingClientIndex].id;
    }

    const updatedSales = [newSale, ...sales];
    setSales(updatedSales);
    dbService.saveVendas(updatedSales).catch(console.error);

    const updatedDevs = developments.map((d) => {
      if (d.id === newSale.empreendimentoId) {
        const lotInfoKey =
          `${newSale.quadra}-${newSale.numeroLote}`.toUpperCase();
        return {
          ...d,
          lotesVendidos: (d.lotesVendidos || 0) + 1,
          lotesInfo: {
            ...(d.lotesInfo || {}),
            [lotInfoKey]: { rua: newSale.rua },
          },
        };
      }
      return d;
    });
    setDevelopments(updatedDevs);
    dbService.saveEmpreendimentos(updatedDevs).catch(console.error);

    return newSale;
  };

  const updateLotesInfo = (
    id: string,
    info: Record<string, { rua: string; status?: 'disponivel' | 'indisponivel'; desistente?: { clienteId: string; clienteNome: string; dataDesistencia: string } }>,
  ) => {
    const updated = developments.map((d) =>
      d.id === id
        ? { ...d, lotesInfo: { ...(d.lotesInfo || {}), ...info } }
        : d,
    );
    setDevelopments(updated);
    dbService.saveEmpreendimentos(updated).catch(console.error);
  };

  const deleteLot = (devId: string, key: string) => {
    const updated = developments.map((d) => {
      if (d.id !== devId) return d;
      const newLotesInfo = { ...(d.lotesInfo || {}) };
      delete newLotesInfo[key];
      return { ...d, lotesInfo: newLotesInfo };
    });
    setDevelopments(updated);
    dbService.saveEmpreendimentos(updated).catch(console.error);
  };

  const saveAppConfig = (newConfig: AppConfig) => {
    setConfig(newConfig);
    dbService.saveAppConfig(newConfig).catch(console.error);
  };

  const handleImport = async (
    data: { empreendimentos: Empreendimento[]; clientes: Cliente[]; vendas: Venda[]; config: AppConfig },
    mode: "replace" | "merge"
  ) => {
    let finalDevs: Empreendimento[];
    let finalClients: Cliente[];
    let finalSales: Venda[];
    let finalConfig: AppConfig;

    if (mode === "replace") {
      finalDevs = data.empreendimentos;
      finalClients = data.clientes;
      finalSales = data.vendas;
      finalConfig = data.config;
    } else {
      const devMap = new Map(developments.map((d) => [d.id, d]));
      data.empreendimentos.forEach((d) => devMap.set(d.id, d));
      finalDevs = Array.from(devMap.values());

      const clientMap = new Map(clients.map((c) => [c.id, c]));
      data.clientes.forEach((c) => clientMap.set(c.id, c));
      finalClients = Array.from(clientMap.values());

      const saleMap = new Map(sales.map((s) => [s.id, s]));
      data.vendas.forEach((s) => saleMap.set(s.id, s));
      finalSales = Array.from(saleMap.values());

      finalConfig = { ...config, ...data.config, vendedores: data.config?.vendedores ?? config.vendedores };
    }

    await Promise.all([
      dbService.saveEmpreendimentos(finalDevs),
      dbService.saveClientes(finalClients),
      dbService.saveVendas(finalSales),
      dbService.saveAppConfig(finalConfig),
    ]);

    setDevelopments(finalDevs);
    setClients(finalClients);
    setSales(finalSales);
    setConfig(finalConfig);
  };

  const [contractInitialMode, setContractInitialMode] = React.useState<'recibo' | undefined>(undefined);

  const handleGoToContracts = (v: Venda) => {
    setSection("contratos");
    setContractToOpen(v);
    setContractInitialMode(undefined);
  };

  const handleGoToContractsRecibo = (v: Venda) => {
    setSection("contratos");
    setContractToOpen(v);
    setContractInitialMode('recibo');
  };

  const handleUpdateProprietario = (p: Proprietario) => {
    const updated = (config.proprietarios || []).map((x) => x.id === p.id ? p : x);
    const newConfig = { ...config, proprietarios: updated };
    setConfig(newConfig);
    dbService.saveAppConfig(newConfig).catch(console.error);
  };

  const handleStartSale = (data: Partial<Venda>) => {
    setPrefilledSale(data);
    setEditingVendaEntry(null);
    setSection("vendas");
  };

  const handleEditVenda = (venda: Venda) => {
    const cliente = clients.find((c) => c.id === venda.clienteId) || null;
    setEditingVendaEntry({ venda, cliente });
    setPrefilledSale(undefined);
    setSection("vendas");
  };

  const handleUpdateVendaFull = (updatedVenda: Venda, updatedCliente: Cliente) => {
    const updatedSales = sales.map((s) =>
      s.id === updatedVenda.id ? updatedVenda : s
    );
    setSales(updatedSales);
    dbService.saveVendas(updatedSales).catch(console.error);
    const updatedClients = clients.map((c) =>
      c.id === updatedCliente.id ? updatedCliente : c
    );
    setClients(updatedClients);
    dbService.saveClientes(updatedClients).catch(console.error);
    setEditingVendaEntry(null);
  };

  const handleMergeClients = (masterId: string, duplicateIds: string[]) => {
    const updatedSales = sales.map((s) =>
      duplicateIds.includes(s.clienteId)
        ? { ...s, clienteId: masterId, clienteNome: clients.find(c => c.id === masterId)?.nome || s.clienteNome }
        : s
    );
    setSales(updatedSales);
    dbService.saveVendas(updatedSales).catch(console.error);
    const updatedClients = clients.filter((c) => !duplicateIds.includes(c.id));
    setClients(updatedClients);
    dbService.saveClientes(updatedClients).catch(console.error);
  };

  const updateVendaStatus = (
    vendaId: string,
    newStatus: "pendente" | "pago" | "cancelado",
  ) => {
    const updated = sales.map((s) =>
      s.id === vendaId ? { ...s, status: newStatus } : s,
    );
    setSales(updated);
    dbService.saveVendas(updated).catch(console.error);
    if (contractToOpen && contractToOpen.id === vendaId) {
      setContractToOpen({ ...contractToOpen, status: newStatus });
    }
  };

  const deleteVenda = (id: string) => {
    const updated = sales.filter((s) => s.id !== id);
    setSales(updated);
    dbService.saveVendas(updated).catch(console.error);
  };

  const updateVenda = (venda: Venda) => {
    const updated = sales.map((s) => (s.id === venda.id ? venda : s));
    setSales(updated);
    dbService.saveVendas(updated).catch(console.error);
  };

  const renderSection = () => {
    switch (section) {
      case "dashboard":
        return (
          <DashboardSection
            sales={sales}
            developments={developments}
            clients={clients}
            onNavigate={(s) => setSection(s)}
            onViewContract={(v) => { setSection("contratos"); setContractToOpen(v); }}
          />
        );
      case "empreendimentos":
        return (
          <EmpreendimentosSection
            developments={developments}
            sales={sales}
            clients={clients}
            onSave={saveDev}
            onDelete={deleteDev}
            onUpdateLotesInfo={updateLotesInfo}
            onDeleteLot={deleteLot}
            onStartSale={handleStartSale}
            onViewContract={(v) => { setSection("contratos"); setContractToOpen(v); }}
            proprietarios={config.proprietarios || []}
          />
        );
      case "proprietarios":
        return <ProprietariosSection config={config} onSave={saveAppConfig} />;
      case "vendas":
        return (
          <VendasSection
            developments={developments}
            sales={sales}
            onSaveVenda={saveSale}
            onGoToContracts={handleGoToContracts}
            onGoToContractsRecibo={handleGoToContractsRecibo}
            initialSaleData={prefilledSale}
            onSaveDev={saveDev}
            vendedores={config.vendedores || []}
            clients={clients}
            editingEntry={editingVendaEntry}
            onUpdateVendaFull={handleUpdateVendaFull}
            onMergeClients={handleMergeClients}
          />
        );
      case "contratos":
        return (
          <ContratosSection
            sales={sales}
            clients={clients}
            developments={developments}
            initialVenda={contractToOpen}
            onUpdateStatus={updateVendaStatus}
            onSaveVenda={saveSale}
            onDeleteVenda={deleteVenda}
            onUpdateVenda={updateVenda}
            vendedores={config.vendedores || []}
            proprietarios={config.proprietarios || []}
            initialMode={contractInitialMode}
            onUpdateProprietario={handleUpdateProprietario}
            onEditVenda={handleEditVenda}
            onClearInitialVenda={() => setContractToOpen(null)}
            userProfile={userProfile}
          />
        );
      case "clientes":
        return (
          <ClientesSection
            clients={clients}
            sales={sales}
            onUpdateCliente={(updated) => {
              const updatedList = clients.map((c) =>
                c.id === updated.id ? updated : c
              );
              setClients(updatedList);
              dbService.saveClientes(updatedList).catch(console.error);
            }}
          />
        );
      case "aniversarios":
        return <AniversariosSection clients={clients} sales={sales} />;
      case "calculadora":
        return <CalculatorSection />;
      case "config":
        return (
          <ConfigSection
            config={config}
            onSave={saveAppConfig}
            developments={developments}
            clients={clients}
            sales={sales}
            onImport={handleImport}
          />
        );
      case "usuarios":
        return (
          <UsuariosSection
            isAdmin={isAdmin}
            userId={userId}
            userEmail={userEmail}
          />
        );
      default:
        return <DashboardSection sales={sales} developments={developments} clients={clients} onNavigate={(s) => setSection(s)} />;
    }
  };

  const getTitle = () => {
    const titles: Record<Section, string> = {
      dashboard: "Dashboard Geral",
      empreendimentos: "Empreendimentos",
      proprietarios: "Proprietários",
      vendas: "Registro de Novas Vendas",
      contratos: "Contratos e Documentação",
      clientes: "Gestão de Clientes",
      aniversarios: "Calendário de Aniversariantes",
      calculadora: "Simulador de Vendas",
      config: "Configurações do Sistema",
      usuarios: "Gerenciar Usuários",
    };
    return titles[section];
  };

  return (
    <div className="min-h-screen bg-surface-bg flex">
      <Sidebar
        currentSection={section}
        setSection={(s) => {
          // Só navega se tiver permissão
          if (userPermissions && !userPermissions[s] && !isAdmin) return;
          setSection(s);
        }}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        onLogout={onLogout}
        isAdmin={isAdmin}
        forceDesktop={forceDesktop}
        onToggleDesktop={toggleDesktop}
        userPermissions={userPermissions}
        userEmail={userEmail}
      />

      <main className={`flex-1 ${forceDesktop ? "ml-72" : "lg:ml-72"} p-4 sm:p-8 lg:p-10 pt-24 lg:pt-32 ${forceDesktop ? "pb-10" : "pb-32 lg:pb-10"} no-print transition-all duration-300`}>
        <Header
          title={getTitle()}
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          forceDesktop={forceDesktop}
        />

        <AnimatePresence mode="wait">
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="max-w-7xl mx-auto"
          >
            {renderSection()}
          </motion.div>
        </AnimatePresence>
      </main>

      {!forceDesktop && <BottomNav currentSection={section} setSection={setSection} />}
      {section !== "vendas" && !forceDesktop && <FAB setSection={setSection} />}

      {/* Hidden print area for contracts */}
      <div className="hidden print-only w-full h-full bg-white">
        {/* The contract modal content is handled separately but we can replicate standard print view if needed */}
        {/* For this applet, window.print on the modal is effective since it's the only visible thing */}
      </div>
    </div>
  );
}

