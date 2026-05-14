import React, { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Building2,
  ShoppingCart,
  FileText,
  Users,
  Cake,
  Calculator,
  ChevronRight,
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
import { dbService } from "./dbService";
import { maskCPF, maskRG, maskCEP, maskPhone, validateCPF } from "./lib/masks";
import { geminiService } from "./geminiService";

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
  const r = rg.replace(/\D/g, "");
  return r.length >= 7 && r.length <= 10;
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
  FileCheck,
  MessageCircle,
  BarChart3,
  Download,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  PieChart as PieChartIcon,
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

// --- Components ---

const Sidebar = ({
  currentSection,
  setSection,
  isOpen,
  setIsOpen,
  onLogout,
}: {
  currentSection: Section;
  setSection: (s: Section) => void;
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  onLogout?: () => void;
}) => {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "vendas", label: "Nova Venda", icon: ShoppingCart },
    { id: "empreendimentos", label: "Empreendimentos", icon: Building2 },
    { id: "proprietarios", label: "Proprietários", icon: UserCheck },
    { id: "contratos", label: "Contratos", icon: FileText },
    { id: "clientes", label: "Clientes", icon: Users },
    { id: "aniversarios", label: "Aniversários", icon: Cake },
    { id: "calculadora", label: "Calculadora", icon: Calculator },
    { id: "config", label: "Configurações", icon: Settings },
  ];

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
        className={`w-72 bg-surface-card h-screen flex flex-col fixed left-0 top-0 border-r border-border-subtle shadow-xl z-[60] transition-transform duration-300 transform ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div className="p-8 flex justify-between items-center bg-surface-card border-b border-border-subtle">
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
          {menuItems.map((item) => {
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
        </nav>

        <div className="p-6 border-t border-slate-50">
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
}: {
  title: string;
  toggleSidebar: () => void;
}) => (
  <header className="h-20 lg:h-24 bg-surface-card/80 backdrop-blur-md border-b border-border-subtle flex items-center px-6 lg:px-10 fixed top-0 right-0 left-0 lg:left-72 z-40">
    <button
      onClick={toggleSidebar}
      className="lg:hidden p-3 mr-4 bg-surface-bg hover:bg-slate-100 rounded-2xl text-slate-600 transition-colors"
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
}: {
  title: string;
  value: string;
  icon: any;
  colorClass: string;
}) => (
  <div className={`stat-card-gradient ${colorClass}`}>
    <div className="flex justify-between items-start">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-2">
          {title}
        </p>
        <p className="text-4xl font-display font-bold tracking-tight">
          {value}
        </p>
      </div>
      <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
        <Icon size={24} className="stroke-[2.5]" />
      </div>
    </div>
    <div className="absolute -right-6 -bottom-6 opacity-10">
      <Icon size={120} />
    </div>
  </div>
);

// --- Sections ---

const DashboardSection = ({
  sales,
  developments,
}: {
  sales: Venda[];
  developments: Empreendimento[];
}) => {
  const totalRevenue = sales.reduce((acc, sale) => acc + sale.valorLote, 0);
  const totalCommissions = sales.reduce(
    (acc, sale) => acc + (sale.comissao || 0),
    0,
  );
  const totalCosts = sales.reduce((acc, sale) => acc + (sale.custo || 0), 0);
  const totalProfit = totalRevenue - totalCosts - totalCommissions;

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
    <div className="space-y-8">
      <div className="flex justify-between items-center px-2">
        <h3 className="text-xl font-display font-bold text-slate-800 flex items-center gap-3">
          <LayoutDashboard className="text-primary-main" />
          Visão Geral
        </h3>
        <button
          onClick={() => exportToCSV(sales)}
          className="btn-ghost text-xs px-4 py-2 border-slate-200"
        >
          <Download size={14} />
          <span>Exportar Vendas</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
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
          title="Comissões"
          value={new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
            maximumFractionDigits: 0,
          }).format(totalCommissions)}
          icon={Calculator}
          colorClass="bg-gradient-to-br from-chumbo-base to-chumbo-muted text-primary-contrast"
        />
        <motion.div
          whileHover={{ y: -5 }}
          className="card-premium border-primary-main/20 bg-primary-main/[0.02]"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400 mb-2">
                Lucro Líquido
              </p>
              <p
                className={`text-3xl font-display font-bold tracking-tight ${totalProfit >= 0 ? "text-success-main" : "text-red-500"}`}
              >
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                  maximumFractionDigits: 0,
                }).format(totalProfit)}
              </p>
            </div>
            <div className="p-3 bg-surface-card shadow-sm border border-border-subtle rounded-2xl">
              <TrendingUp
                size={24}
                className={
                  totalProfit >= 0 ? "text-success-main" : "text-red-500"
                }
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-4 font-bold flex items-center gap-1">
            Total após custos e comissões
          </p>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card-premium">
          <div className="flex items-center gap-2 mb-8">
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
          <div className="flex items-center gap-2 mb-8">
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
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-lg lg:text-xl font-display font-bold text-slate-800 flex items-center gap-2">
            <div className="w-1.5 h-6 bg-primary-main rounded-full" />
            Vendas Recentes
          </h3>
          <button className="text-sm font-bold text-primary-main hover:underline">
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
                <tr key={venda.id} className="group">
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
  onStartSale,
  onClose,
}: {
  dev: Empreendimento;
  sales: Venda[];
  onStartSale: (v: Partial<Venda>) => void;
  onClose: () => void;
}) => {
  const quadras = dev.quadras?.split(",").map((q) => q.trim()) || [];
  const soldLots = sales.filter((s) => s.empreendimentoId === dev.id);

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
              // Try to find how many lots in this quadra from lotesInfo
              const lotsInQuadra = Object.keys(dev.lotesInfo || {})
                .filter((key) => key.startsWith(q.toUpperCase() + "-"))
                .map((key) => key.split("-")[1]);

              // If no lotesInfo, show a standard range (e.g. 1-20) if possible or just the known ones
              const displayLots =
                lotsInQuadra.length > 0
                  ? lotsInQuadra.sort((a, b) => Number(a) - Number(b))
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
                          className={`group relative p-4 rounded-2xl border aspect-square flex flex-col items-center justify-center transition-all ${
                            sold
                              ? "bg-red-50 border-red-100 text-red-600"
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
              Vendido
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary-main" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Selecionado
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const EmpreendimentosSection = ({
  developments,
  sales,
  onSave,
  onDelete,
  onUpdateLotesInfo,
  onStartSale,
  proprietarios = [],
}: {
  developments: Empreendimento[];
  sales: Venda[];
  onSave: (d: Empreendimento) => void;
  onDelete: (id: string) => void;
  onUpdateLotesInfo: (
    id: string,
    info: Record<string, { rua: string }>,
  ) => void;
  onStartSale: (v: Partial<Venda>) => void;
  proprietarios?: Proprietario[];
}) => {
  const emptyForm: Partial<Empreendimento> = {
    nome: "", endereco: "", cidade: "", estado: "", totalLotes: 0,
    descricao: "", comunidade: "", quadras: "", ruas: "", proprietarioId: "",
  };
  const [isAdding, setIsAdding] = useState(false);
  const [editingDev, setEditingDev] = useState<Empreendimento | null>(null);
  const [formData, setFormData] = useState<Partial<Empreendimento>>(emptyForm);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedDevForMap, setSelectedDevForMap] =
    useState<Empreendimento | null>(null);

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
      quadras: dev.quadras, ruas: dev.ruas, proprietarioId: dev.proprietarioId || "",
    });
    setIsAdding(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome) return;
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

      const newLotesInfo: Record<string, { rua: string }> = {};
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
              <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="label">Quadras Disponíveis</label>
                  <input
                    className="input-field"
                    value={formData.quadras}
                    onChange={(e) =>
                      setFormData({ ...formData, quadras: e.target.value })
                    }
                    placeholder="Ex: A, B, C, D"
                  />
                </div>
                <div>
                  <label className="label">Ruas / Acessos</label>
                  <input
                    className="input-field"
                    value={formData.ruas}
                    onChange={(e) =>
                      setFormData({ ...formData, ruas: e.target.value })
                    }
                    placeholder="Ex: Rua 01, Rua 02, Av. Principal"
                  />
                </div>
              </div>
              <div>
                <label className="label">Total de Lotes</label>
                <input
                  type="number"
                  className="input-field font-bold"
                  value={formData.totalLotes}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      totalLotes: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">Proprietário (Vendedor no Contrato)</label>
                <select
                  className="input-field"
                  value={formData.proprietarioId || ""}
                  onChange={(e) => setFormData({ ...formData, proprietarioId: e.target.value })}
                >
                  <option value="">Selecionar proprietário...</option>
                  {proprietarios.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome} — CPF {p.cpf}</option>
                  ))}
                </select>
                {proprietarios.length === 0 && (
                  <p className="text-[10px] text-amber-500 font-bold mt-1">Cadastre proprietários na aba "Proprietários" primeiro.</p>
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
            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
              <button
                onClick={() => openEditForm(dev)}
                className="p-2.5 bg-blue-50 text-blue-500 rounded-xl hover:bg-blue-500 hover:text-white transition-all shadow-sm"
              >
                <Pencil size={18} />
              </button>
              <button
                onClick={() => onDelete(dev.id)}
                className="p-2.5 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
              >
                <Trash2 size={18} />
              </button>
            </div>

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
              {dev.ruas && (
                <p className="text-xs text-slate-500 line-clamp-1 mb-1">
                  <span className="font-bold text-slate-700">Ruas:</span>{" "}
                  {dev.ruas}
                </p>
              )}
              {dev.quadras && (
                <p className="text-xs text-slate-500 line-clamp-1">
                  <span className="font-bold text-slate-700">Quadras:</span>{" "}
                  {dev.quadras}
                </p>
              )}
            </div>

            {(() => {
              const prop = proprietarios.find(p => p.id === dev.proprietarioId);
              return prop ? (
                <div className="mb-3 px-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Proprietário</p>
                  <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <UserCheck size={12} className="text-primary-main" />
                    {prop.nome}
                  </p>
                </div>
              ) : null;
            })()}

            <div className="mt-auto space-y-5 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                    Vendas
                  </p>
                  <p className="text-2xl font-display font-bold text-slate-800 leading-none">
                    {dev.lotesVendidos}{" "}
                    <span className="text-sm font-medium text-slate-400">
                      / {dev.totalLotes}
                    </span>
                  </p>
                </div>
                <p className="text-sm font-bold text-primary-main">
                  {Math.round((dev.lotesVendidos / dev.totalLotes) * 100)}%
                </p>
              </div>

              <div className="relative">
                <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: `${(dev.lotesVendidos / dev.totalLotes) * 100}%`,
                    }}
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

              <button
                onClick={() => setSelectedDevForMap(dev)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-primary-main transition-colors shadow-lg shadow-slate-900/10"
              >
                <LayoutDashboard size={14} />
                <span>Dashboard de Lotes</span>
              </button>
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
            onStartSale={(v) => {
              onStartSale(v);
              setSelectedDevForMap(null);
            }}
            onClose={() => setSelectedDevForMap(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const VendasSection = ({
  developments,
  onSaveVenda,
  onGoToContracts,
  initialSaleData,
  onSaveDev,
  vendedores = [],
}: {
  developments: Empreendimento[];
  onSaveVenda: (v: Venda, c: Cliente) => Venda;
  onGoToContracts: (v: Venda) => void;
  initialSaleData?: Partial<Venda>;
  onSaveDev: (d: Empreendimento) => void;
  vendedores?: Vendedor[];
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
    dataVencimento: "",
    vendedor: "",
    valorParcela: 0,
    custo: 0,
    comissao: 0,
    formaPagamento: "Boleto",
    ...initialSaleData,
  });
  const [showNovoDev, setShowNovoDev] = useState(false);
  const [novoDevData, setNovoDevData] = useState({ nome: "", comunidade: "", quadras: "", ruas: "", totalLotes: 0 });

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
      ruas: novoDevData.ruas,
    };
    onSaveDev(novo);
    setSaleData({ ...saleData, empreendimentoId: novo.id });
    setShowNovoDev(false);
    setNovoDevData({ nome: "", comunidade: "", quadras: "", ruas: "", totalLotes: 0 });
  };

  // Update saleData if initialSaleData changes (e.g. coming from Dashboard)
  useEffect(() => {
    if (initialSaleData) {
      setSaleData((prev) => ({ ...prev, ...initialSaleData }));
    }
  }, [initialSaleData]);

  const [rawText, setRawText] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isExtractingFiles, setIsExtractingFiles] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [lastSavedVenda, setLastSavedVenda] = useState<Venda | null>(null);

  const handleExtractIA = async () => {
    if (!rawText.trim()) return;
    setIsExtracting(true);
    try {
      const data = await geminiService.extractSaleData(rawText);
      setClientData((prev) => ({
        ...prev,
        nome: data.nomeComprador || prev.nome,
        nacionalidade: data.nacionalidade || prev.nacionalidade,
        rg: data.rg || prev.rg,
        cpf: data.cpf ? maskCPF(data.cpf) : prev.cpf,
        estadoCivil: data.estadoCivil || prev.estadoCivil,
        profissao: data.profissao || prev.profissao,
        nascimento: data.nascimento || prev.nascimento,
        telefone1: data.telefone1 ? maskPhone(data.telefone1) : prev.telefone1,
        telefone2: data.telefone2 ? maskPhone(data.telefone2) : prev.telefone2,
        endereco: data.endereco || prev.endereco,
        numero: data.numero || prev.numero,
        bairro: data.bairro || prev.bairro,
        cidade: data.cidade || prev.cidade,
        estado: data.estado || prev.estado,
        cep: data.cep ? maskCEP(data.cep) : prev.cep,
      }));
      setSaleData((prev) => ({
        ...prev,
        numeroLote: data.numeroLote || prev.numeroLote,
        quadra: data.quadra || prev.quadra,
        valorLote: data.valorLote || prev.valorLote,
        valorEntrada: data.valorEntrada || prev.valorEntrada,
        valorParcela: data.valorParcela || prev.valorParcela,
        quantidadeParcelas: data.quantidadeParcelas || prev.quantidadeParcelas,
        dataVencimento: data.dataVencimento || prev.dataVencimento,
        vendedor: data.vendedor || prev.vendedor,
      }));
      alert("IA preencheu os campos identificados!");
    } catch (err) {
      alert("Erro ao extrair dados com IA.");
    } finally {
      setIsExtracting(false);
    }
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
    try {
      const data = await geminiService.extractFromFiles(attachedFiles);
      applyExtractedData(data, developments);
      alert("IA preencheu os campos a partir dos documentos!");
    } catch (err) {
      alert("Erro ao extrair dados dos arquivos: " + ((err as any)?.message || "Tente novamente."));
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

  // Effect to auto-fill street if known
  useEffect(() => {
    if (saleData.empreendimentoId && saleData.quadra && saleData.numeroLote) {
      const dev = developments.find((d) => d.id === saleData.empreendimentoId);
      const key = `${saleData.quadra}-${saleData.numeroLote}`.toUpperCase();
      if (dev?.lotesInfo?.[key]) {
        setSaleData((prev) => ({ ...prev, rua: dev.lotesInfo![key].rua }));
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
      alert("Por favor, preencha os campos obrigatórios.");
      return;
    }
    if (clientData.cpf && !validateCPF(clientData.cpf)) {
      alert("CPF inválido. Verifique os dígitos informados.");
      return;
    }
    const dev = developments.find((d) => d.id === saleData.empreendimentoId);
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
            Venda Registrada!
          </h2>
          <p className="text-slate-500">
            O cadastro foi concluído e os dados estão salvos.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
          <button onClick={handleCopySummary} className="btn-ghost px-8">
            <Copy size={18} />
            <span>Copiar Resumo Texto</span>
          </button>
          <button
            onClick={() => onGoToContracts(lastSavedVenda)}
            className="btn-primary px-8"
          >
            <FileText size={18} />
            <span>Gerar Contrato Agora</span>
          </button>
          <button
            onClick={() => setLastSavedVenda(null)}
            className="btn-ghost px-8"
          >
            <span>Novo Cadastro</span>
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-8 pb-32 lg:pb-0">
      {/* IA Auto-fill Section */}
      <div className="card-premium bg-gradient-to-br from-primary-main/[0.03] to-transparent border-primary-main/10">
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
          <textarea
            className="input-field min-h-[100px] resize-none"
            placeholder="Cole aqui nome, CPF, endereço, lote, pagamento..."
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
          />
          <button
            type="button"
            disabled={isExtracting || !rawText.trim()}
            onClick={handleExtractIA}
            className="btn-primary w-full sm:w-auto px-8"
          >
            {isExtracting ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                <span>Processando com IA...</span>
              </>
            ) : (
              <>
                <Sparkles size={18} />
                <span>Preencher Automaticamente</span>
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
                  <span>Analisando documentos...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>Extrair com IA</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
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
                <input
                  required
                  className="input-field"
                  value={clientData.nome}
                  onChange={(e) =>
                    setClientData({ ...clientData, nome: e.target.value })
                  }
                  placeholder="Nome Completo"
                />
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
              <input
                required
                className="input-field font-mono"
                value={clientData.cpf}
                onChange={(e) =>
                  setClientData({ ...clientData, cpf: maskCPF(e.target.value) })
                }
                placeholder="000.000.000-00"
              />
            </div>
            <div>
              <label className="label">RG</label>
              <input
                required
                className="input-field font-mono"
                value={clientData.rg}
                onChange={(e) =>
                  setClientData({ ...clientData, rg: maskRG(e.target.value) })
                }
                placeholder="00.000.000-0"
              />
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
                      className="input-field font-mono"
                      value={secondBuyerData?.cpf}
                      onChange={(e) =>
                        setSecondBuyerData({
                          ...secondBuyerData!,
                          cpf: maskCPF(e.target.value),
                        })
                      }
                      placeholder="000.000.000-00"
                    />
                  </div>
                  <div>
                    <label className="label">RG</label>
                    <input
                      required
                      className="input-field font-mono"
                      value={secondBuyerData?.rg}
                      onChange={(e) =>
                        setSecondBuyerData({
                          ...secondBuyerData!,
                          rg: e.target.value,
                        })
                      }
                      placeholder="00.000.000-0"
                    />
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
                        <div>
                          <label className="label">Quadras</label>
                          <input className="input-field" placeholder="Ex: A, B, C" value={novoDevData.quadras} onChange={(e) => setNovoDevData({ ...novoDevData, quadras: e.target.value })} />
                        </div>
                        <div>
                          <label className="label">Ruas / Acessos</label>
                          <input className="input-field" placeholder="Ex: Rua 01, Av. Principal" value={novoDevData.ruas} onChange={(e) => setNovoDevData({ ...novoDevData, ruas: e.target.value })} />
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
                      {developments.find(
                        (d) => d.id === saleData.empreendimentoId,
                      )?.quadras || "Não informada"}
                    </p>
                    <p>
                      <span className="font-bold text-slate-500">Ruas:</span>{" "}
                      {developments.find(
                        (d) => d.id === saleData.empreendimentoId,
                      )?.ruas || "Não informada"}
                    </p>
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
                <div>
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
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                        Saldo Financiado
                      </p>
                      <p className="font-display font-bold text-slate-700">
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(
                          (saleData.valorLote || 0) -
                            (saleData.valorEntrada || 0),
                        )}
                      </p>
                    </div>
                    <div className="space-y-1 text-right">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button type="button" className="btn-ghost w-full" onClick={() => {
                  const key = 'venda_rascunho';
                  const saved = localStorage.getItem(key);
                  if (saved) {
                    const { clientData: cd, saleData: sd } = JSON.parse(saved);
                    if (window.confirm('Restaurar rascunho salvo?')) {
                      if (cd) setClientData((prev) => ({ ...prev, ...cd }));
                      if (sd) setSaleData((prev) => ({ ...prev, ...sd }));
                    } else {
                      localStorage.setItem(key, JSON.stringify({ clientData, saleData }));
                      alert('Rascunho salvo!');
                    }
                  } else {
                    localStorage.setItem(key, JSON.stringify({ clientData, saleData }));
                    alert('Rascunho salvo!');
                  }
                }}>
                  <FileText size={18} />
                  <span>Rascunho</span>
                </button>
                <button
                  type="submit"
                  className="btn-primary w-full shadow-lg shadow-primary-main/20"
                >
                  <ShoppingCart size={18} />
                  <span>Finalizar Venda</span>
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
}) => {
  const [selectedVenda, setSelectedVenda] = useState<Venda | null>(
    initialVenda || null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"contract" | "receipt">("contract");
  const [showNovoContrato, setShowNovoContrato] = useState(false);
  const [clienteMode, setClienteMode] = useState<"existente" | "novo">("existente");
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState("");
  const [editingVenda, setEditingVenda] = useState<Venda | null>(null);
  const [editVendaForm, setEditVendaForm] = useState<Partial<Venda>>({});
  const [novoCliente, setNovoCliente] = useState<Partial<Cliente>>({
    genero: "M", nacionalidade: "brasileiro", estadoCivil: "solteiro",
  });
  const emptyContrato = {
    empreendimentoId: "", quadra: "", numeroLote: "", rua: "",
    valorLote: 0, valorEntrada: 0, quantidadeParcelas: 1, valorParcela: 0,
    dataVencimento: "", formaPagamento: "Dinheiro", vendedor: "", vendedorId: "",
    dataVenda: new Date().toISOString().split("T")[0],
  };
  const [contratoData, setContratoData] = useState(emptyContrato);
  const [ruaWarning, setRuaWarning] = useState<string | null>(null);
  const [downloadingDocx, setDownloadingDocx] = useState(false);

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
  const [gerarVendedor, setGerarVendedor] = useState(emptyGerarVendedor);
  const [gerarExtra, setGerarExtra] = useState({
    rua: "", comunidade: "", formaPagamento: "Dinheiro",
    medidaFrente: "", medidaLateralDir: "", medidaLateralEsq: "", medidaFundos: "", areaTotal: "",
  });

  const handleOpenGerarContrato = () => {
    if (!selectedVenda) return;
    const dev = developments.find((d) => d.id === selectedVenda.empreendimentoId);
    // Auto-fill vendedor from the proprietário linked to the empreendimento
    const prop = dev?.proprietarioId
      ? proprietarios.find((p) => p.id === dev.proprietarioId)
      : undefined;
    setGerarVendedor(
      prop
        ? {
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
          }
        : emptyGerarVendedor
    );
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
    setShowGerarModal(true);
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
    try {
      const res = await fetch("/api/contrato/parcelado-padrao", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendedor: gerarVendedor,
          cliente,
          empreendimento: { nome: desenvolvimento.nome, comunidade: gerarExtra.comunidade, cidade: desenvolvimento.cidade, estado: desenvolvimento.estado },
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
        const err = await res.json();
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
    }
  }, [initialVenda]);

  const handlePrint = () => window.print();
  const client = selectedVenda
    ? clients.find((c) => c.id === selectedVenda.clienteId)
    : null;
  const development = selectedVenda
    ? developments.find((d) => d.id === selectedVenda.empreendimentoId)
    : null;

  const filteredSales = sales.filter((venda) => {
    const query = searchTerm.toLowerCase();
    return (
      venda.clienteNome.toLowerCase().includes(query) ||
      venda.empreendimentoNome.toLowerCase().includes(query) ||
      venda.numeroLote.toLowerCase().includes(query) ||
      venda.quadra.toLowerCase().includes(query) ||
      venda.numeroContrato.toLowerCase().includes(query) ||
      venda.rua?.toLowerCase().includes(query)
    );
  });

  const getStatusInfo = (status?: string) => {
    switch (status) {
      case "pago":
        return {
          label: "Pago",
          color: "text-success-main bg-success-main/10",
          icon: CheckCircle2,
        };
      case "cancelado":
        return {
          label: "Cancelado",
          color: "text-red-500 bg-red-50",
          icon: AlertCircle,
        };
      default:
        return {
          label: "Pendente",
          color: "text-amber-500 bg-amber-50",
          icon: Clock,
        };
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-2">
        <div className="space-y-1">
          <h3 className="text-xl font-display font-bold text-slate-800 flex items-center gap-3">
            <FileText className="text-primary-main" />
            Contratos Gerados
          </h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {sales.length} emitidos
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-80">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Pesquisar contratos..."
              className="w-full h-12 pl-12 pr-4 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-primary-main/20 focus:border-primary-main transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowNovoContrato(true)}
            className="btn-primary flex items-center gap-2 h-12 px-6 whitespace-nowrap"
          >
            <Plus size={18} />
            Novo Contrato
          </button>
        </div>
      </div>

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
                    {[
                      { label: "Valor do Lote (R$)", field: "valorLote", type: "number" },
                      { label: "Entrada (R$)", field: "valorEntrada", type: "number" },
                      { label: "Nº de Parcelas", field: "quantidadeParcelas", type: "number" },
                      { label: "Valor da Parcela (R$)", field: "valorParcela", type: "number" },
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
                    <div>
                      <label className="label">Data de Vencimento das Parcelas</label>
                      <input className="input-field" placeholder="Ex: todo dia 10" value={contratoData.dataVencimento} onChange={(e) => setContratoData({ ...contratoData, dataVencimento: e.target.value })} />
                    </div>
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
                    onUpdateVenda({ ...editingVenda, ...editVendaForm } as Venda);
                    setEditingVenda(null);
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

      <div className="card-premium">
        <div className="overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
          <table className="w-full text-left border-separate border-spacing-y-2">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <th className="pb-3 px-4">Status</th>
                <th className="pb-3 px-4">Titular</th>
                <th className="pb-3 px-4">Loteamento</th>
                <th className="pb-3 px-4 text-right">Montante</th>
                <th className="pb-3 px-4 text-center">Documento</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filteredSales.map((venda, idx) => {
                const s = getStatusInfo(venda.status);
                const Icon = s.icon;
                return (
                  <tr key={venda.id} className="group">
                    <td className="py-4 px-4 bg-slate-50 group-hover:bg-primary-main/5 rounded-l-2xl transition-colors">
                      <div
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest inline-flex items-center gap-1.5 ${s.color}`}
                      >
                        <Icon size={12} />
                        {s.label}
                      </div>
                    </td>
                    <td className="py-4 px-4 bg-slate-50 group-hover:bg-primary-main/5 transition-colors font-semibold text-slate-700">
                      {venda.clienteNome}
                    </td>
                    <td className="py-4 px-4 bg-slate-50 group-hover:bg-primary-main/5 transition-colors text-slate-500">
                      {venda.empreendimentoNome}
                    </td>
                    <td className="py-4 px-4 bg-slate-50 group-hover:bg-primary-main/5 transition-colors text-right font-display font-bold text-primary-main">
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(venda.valorLote)}
                    </td>
                    <td className="py-4 px-4 bg-slate-50 group-hover:bg-primary-main/5 rounded-r-2xl transition-colors text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedVenda(venda);
                            setViewMode("contract");
                          }}
                          className="p-2.5 bg-surface-card text-primary-main rounded-xl shadow-sm border border-border-subtle hover:bg-primary-main hover:text-primary-contrast transition-all"
                          title="Contrato"
                        >
                          <FileText size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedVenda(venda);
                            setViewMode("receipt");
                          }}
                          className="p-2.5 bg-surface-card text-chumbo-base rounded-xl shadow-sm border border-border-subtle hover:bg-chumbo-base hover:text-primary-contrast transition-all"
                          title="Recibo"
                        >
                          <FileCheck size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setEditingVenda(venda);
                            setEditVendaForm({ ...venda });
                          }}
                          className="p-2.5 bg-surface-card text-amber-500 rounded-xl shadow-sm border border-border-subtle hover:bg-amber-500 hover:text-white transition-all"
                          title="Editar contrato"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Excluir contrato de ${venda.clienteNome}? Esta ação não pode ser desfeita.`)) {
                              onDeleteVenda(venda.id);
                            }
                          }}
                          className="p-2.5 bg-surface-card text-red-400 rounded-xl shadow-sm border border-border-subtle hover:bg-red-500 hover:text-white transition-all"
                          title="Excluir contrato"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredSales.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-16 text-center text-slate-300 italic font-medium"
                  >
                    {searchTerm
                      ? `Nenhum contrato encontrado para "${searchTerm}"`
                      : "Nenhum contrato formalizado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {selectedVenda && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 lg:p-8 bg-slate-900/40 backdrop-blur-md no-print">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="bg-surface-card w-full max-w-5xl h-full lg:h-auto lg:max-h-[85vh] rounded-none lg:rounded-[32px] shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="p-6 lg:p-8 border-b border-border-subtle flex justify-between items-center bg-surface-card">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary-main rounded-2xl text-primary-contrast">
                    {viewMode === "contract" ? (
                      <FileText size={24} />
                    ) : (
                      <FileCheck size={24} />
                    )}
                  </div>
                  <div>
                    <h4 className="font-display font-bold text-slate-800 text-lg">
                      {viewMode === "contract"
                        ? "Visualização de Contrato"
                        : "Visualização de Recibo"}
                    </h4>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {selectedVenda.numeroContrato}
                      </p>
                      <span className="text-slate-300">•</span>
                      <div className="flex gap-1">
                        {(["pendente", "pago", "cancelado"] as const).map(
                          (status) => (
                            <button
                              key={status}
                              onClick={() =>
                                onUpdateStatus(selectedVenda.id, status)
                              }
                              className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded transition-colors ${selectedVenda.status === status ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
                            >
                              {status}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="hidden sm:flex self-center items-center gap-4 mr-4 border-r border-slate-200 pr-4">
                    <button
                      onClick={() =>
                        setViewMode(
                          viewMode === "contract" ? "receipt" : "contract",
                        )
                      }
                      className="px-4 py-2 border border-border-subtle rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-colors"
                    >
                      Mudar para{" "}
                      {viewMode === "contract" ? "Recibo" : "Contrato"}
                    </button>
                  </div>
                  {viewMode === "contract" && (
                    <button
                      onClick={handleOpenGerarContrato}
                      disabled={downloadingDocx}
                      className="btn-ghost h-12 px-5 disabled:opacity-50"
                      title="Gerar contrato parcelado padrão (.docx)"
                    >
                      {downloadingDocx ? (
                        <span className="text-xs font-bold">Gerando...</span>
                      ) : (
                        <>
                          <FileDown size={18} />
                          <span className="hidden sm:inline text-xs font-bold uppercase tracking-widest">.docx</span>
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={handlePrint}
                    className="btn-primary h-12 px-6"
                  >
                    <Printer size={18} />{" "}
                    <span className="hidden sm:inline">Imprimir</span>
                  </button>
                  <button
                    onClick={() => setSelectedVenda(null)}
                    className="h-12 w-12 flex items-center justify-center text-slate-400 hover:bg-slate-50 rounded-2xl transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-12 bg-slate-100/50">
                {viewMode === "contract" ? (
                  <div
                    id="contract-content"
                    className="bg-white shadow-2xl p-8 sm:p-20 mx-auto w-full max-w-[21cm] min-h-[29.7cm] text-black text-[13px] leading-[1.8] font-serif border border-slate-200"
                  >
                    <div className="text-center space-y-3 mb-16">
                      <h1 className="text-2xl font-bold underline underline-offset-8 decoration-1 mb-8 uppercase">
                        Instrumento Particular de Promessa de Compra e Venda
                      </h1>
                      <div className="flex justify-center gap-12 font-mono text-[10px] text-slate-400">
                        <span>CONT Nº: {selectedVenda.numeroContrato}</span>
                        <span>
                          DATA:{" "}
                          {new Date(selectedVenda.dataVenda).toLocaleDateString(
                            "pt-BR",
                          )}
                        </span>
                      </div>
                    </div>

                    <section className="mb-10">
                      <h2 className="font-bold mb-4 uppercase tracking-wider border-b border-slate-800 py-1 text-sm bg-slate-50 px-2 italic">
                        1. QUALIFICAÇÃO DAS PARTES
                      </h2>
                      <div className="px-2 space-y-4 leading-relaxed text-justify">
                        <p>
                          <span className="font-bold">
                            PROMITENTE VENDEDOR:
                          </span>{" "}
                          <span className="uppercase font-bold">
                            GENILSON PEREIRA MOREIRA
                          </span>
                          , brasileiro, solteiro, portador do CPF nº
                          632.939.002-91, residente e domiciliado em
                          Santarém/PA.
                        </p>
                        <p>
                          <span className="font-bold">
                            {client?.genero === "F"
                              ? "PROMISSÁRIA COMPRADORA"
                              : client?.genero === "O"
                                ? "PROMISSÁRIO(A) COMPRADOR(A)"
                                : "PROMISSÁRIO COMPRADOR"}
                            :
                          </span>{" "}
                          <span className="font-bold uppercase underline">
                            {client?.nome}
                          </span>
                          ,{" "}
                          {client?.genero === "F"
                            ? "brasileira"
                            : client?.genero === "O"
                              ? "brasileiro(a)"
                              : "brasileiro"}
                          , {genderizeEstadoCivil(client?.estadoCivil || "", client?.genero || "M").toLowerCase()},{" "}
                          {client?.profissao ? client.profissao + ", " : ""}
                          {client?.genero === "F"
                            ? "portadora"
                            : client?.genero === "O"
                              ? "portador(a)"
                              : "portador"}{" "}
                          da carteira de identidade nº {client?.rg} e do CPF nº{" "}
                          {client?.cpf},{" "}
                          {client?.genero === "F"
                            ? "residente e domiciliada"
                            : client?.genero === "O"
                              ? "residente e domiciliado(a)"
                              : "residente e domiciliado"}{" "}
                          na {client?.endereco}, nº {client?.numero},{" "}
                          {client?.bairro}, {client?.cidade}/{client?.estado},
                          CEP {client?.cep}.
                        </p>
                        {selectedVenda.comprador2 && (
                          <p>
                            <span className="font-bold">
                              {selectedVenda.comprador2.genero === "F"
                                ? "SEGUNDA PROMISSÁRIA"
                                : selectedVenda.comprador2.genero === "O"
                                  ? "SEGUNDO(A) PROMISSÁRIO(A)"
                                  : "SEGUNDO PROMISSÁRIO"}
                              :
                            </span>{" "}
                            <span className="font-bold uppercase underline">
                              {selectedVenda.comprador2.nome}
                            </span>
                            ,{" "}
                            {selectedVenda.comprador2.genero === "F"
                              ? "brasileira"
                              : selectedVenda.comprador2.genero === "O"
                                ? "brasileiro(a)"
                                : "brasileiro"}
                            ,{" "}
                            {genderizeEstadoCivil(selectedVenda.comprador2.estadoCivil, selectedVenda.comprador2.genero || "M").toLowerCase()}
                            ,{" "}
                            {selectedVenda.comprador2.profissao
                              ? selectedVenda.comprador2.profissao + ", "
                              : ""}
                            {selectedVenda.comprador2.genero === "F"
                              ? "portadora"
                              : selectedVenda.comprador2.genero === "O"
                                ? "portador(a)"
                                : "portador"}{" "}
                            da carteira de identidade nº{" "}
                            {selectedVenda.comprador2.rg} e do CPF nº{" "}
                            {selectedVenda.comprador2.cpf}.
                          </p>
                        )}
                      </div>
                    </section>

                    <section className="mb-10">
                      <h2 className="font-bold mb-4 uppercase tracking-wider border-b border-slate-800 py-1 text-sm bg-slate-50 px-2 italic">
                        2. OBJETO DO NEGÓCIO
                      </h2>
                      <p className="px-2 leading-relaxed text-justify">
                        Constitui objeto deste contrato a alienação do{" "}
                        <span className="font-bold text-lg underline">
                          LOTE Nº {selectedVenda.numeroLote}
                        </span>
                        , integrante da{" "}
                        <span className="font-bold">
                          QUADRA {selectedVenda.quadra}
                        </span>
                        , situado na{" "}
                        <span className="font-bold font-mono tracking-tight underline">
                          {selectedVenda.rua || "___________________"}
                        </span>
                        , no empreendimento{" "}
                        <span className="font-bold uppercase italic underline decoration-slate-300">
                          {selectedVenda.empreendimentoNome}
                        </span>
                        {development?.comunidade
                          ? `, localizado na comunidade/região ${development.comunidade}`
                          : ""}
                        {development?.ruas
                          ? `, próximo à(s) rua(s) ${development.ruas}`
                          : ""}
                        . O referido imóvel faz parte do projeto aprovado pelos
                        órgãos competentes.
                      </p>
                    </section>

                    <section className="mb-12">
                      <h2 className="font-bold mb-4 uppercase tracking-wider border-b border-slate-800 py-1 text-sm bg-slate-50 px-2 italic">
                        3. DO VALOR E FORMA DE PAGAMENTO
                      </h2>
                      <div className="bg-slate-50 p-6 rounded-2xl space-y-4 border border-slate-100">
                        <p>
                          O preço certo e ajustado da venda ora prometido é de{" "}
                          <span className="font-bold text-xl text-primary-dark">
                            {new Intl.NumberFormat("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            }).format(selectedVenda.valorLote)}
                          </span>
                          , que será pago via{" "}
                          <span className="font-bold underline">
                            {selectedVenda.formaPagamento}
                          </span>{" "}
                          da seguinte forma:
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="p-4 border border-slate-200 bg-white rounded-xl shadow-sm">
                            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">
                              Sinal / Entrada
                            </p>
                            <p className="font-bold text-black text-lg">
                              {new Intl.NumberFormat("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              }).format(selectedVenda.valorEntrada)}
                            </p>
                            <p className="text-[9px] text-slate-400 mt-1 font-bold">
                              PAGO NO ATO DA ASSINATURA
                            </p>
                          </div>
                          <div className="p-4 border border-slate-200 bg-white rounded-xl shadow-sm">
                            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">
                              Saldo Remanescente
                            </p>
                            <p className="font-bold text-black text-lg">
                              {new Intl.NumberFormat("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              }).format(
                                selectedVenda.valorLote -
                                  selectedVenda.valorEntrada,
                              )}
                            </p>
                            <p className="text-[9px] text-slate-400 mt-1 font-bold">
                              FINANCIAMENTO PRÓPRIO
                            </p>
                          </div>
                        </div>

                        <p className="text-sm font-medium leading-relaxed">
                          O saldo remanescente será quitado em{" "}
                          <span className="font-bold">
                            {selectedVenda.quantidadeParcelas} parcelas fixas
                          </span>
                          , no valor de{" "}
                          <span className="font-bold underline">
                            {new Intl.NumberFormat("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            }).format(selectedVenda.valorParcela)}
                          </span>{" "}
                          cada uma, com vencimento no dia{" "}
                          <span className="font-bold underline">
                            {new Date(selectedVenda.dataVencimento).getDate()}
                          </span>{" "}
                          de cada mês, ficando a primeira parcela para o dia{" "}
                          <span className="font-bold underline">
                            {new Date(
                              selectedVenda.dataVencimento,
                            ).toLocaleDateString("pt-BR")}
                          </span>
                          .
                        </p>
                      </div>
                    </section>

                    <section className="mt-32">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-16 px-10">
                        <div className="text-center">
                          <div className="h-px bg-slate-900 mb-2" />
                          <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Representante Vendedor
                          </p>
                          <p className="font-bold text-slate-800 tracking-tight">
                            {selectedVenda.vendedor || "GENILSON P. MOREIRA"}
                          </p>
                        </div>
                        <div className="text-center">
                          <div className="h-px bg-slate-900 mb-2" />
                          <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Promitente Comprador
                          </p>
                          <p className="font-bold text-slate-800 tracking-tight text-sm uppercase">
                            {selectedVenda.clienteNome}
                          </p>
                        </div>
                      </div>
                      <div className="text-center mt-20 text-[9px] text-slate-300 font-bold tracking-widest uppercase">
                        Santarém/PA,{" "}
                        {new Date(selectedVenda.dataVenda).toLocaleDateString(
                          "pt-BR",
                          { day: "2-digit", month: "long", year: "numeric" },
                        )}
                      </div>
                    </section>
                  </div>
                ) : (
                  <div className="bg-white shadow-2xl p-8 sm:p-20 mx-auto w-full max-w-[21cm] min-h-[15cm] text-black font-sans border border-slate-200">
                    <div className="flex justify-between items-start border-b-4 border-slate-900 pb-8 mb-12">
                      <div>
                        <h1 className="text-4xl font-black italic tracking-tighter text-slate-900">
                          RECIBO
                        </h1>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                          Instrumento de Quitação de Valores
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                          Valor do Recibo
                        </p>
                        <p className="text-3xl font-bold bg-slate-900 text-white px-4 py-1 rounded-xl">
                          {new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          }).format(selectedVenda.valorEntrada)}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-8 text-lg leading-loose">
                      <p className="text-justify">
                        Recebemos de{" "}
                        <span className="font-bold uppercase underline underline-offset-4">
                          {selectedVenda.clienteNome}
                        </span>
                        , inscrito(a) no CPF nº{" "}
                        <span className="font-bold">{client?.cpf}</span>, a
                        importância supra de{" "}
                        <span className="font-bold italic">
                          (
                          {new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          }).format(selectedVenda.valorEntrada)}
                          )
                        </span>
                        , referente ao{" "}
                        <span className="font-bold">
                          SINAL E PRINCÍPIO DE PAGAMENTO (ENTRADA)
                        </span>{" "}
                        para aquisição do imóvel:
                      </p>

                      <div className="bg-slate-50 p-8 rounded-[32px] border-2 border-dashed border-slate-200 grid grid-cols-2 gap-6">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                            Empreendimento
                          </p>
                          <p className="font-bold text-slate-800">
                            {selectedVenda.empreendimentoNome}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                            Localização
                          </p>
                          <p className="font-bold text-slate-800">
                            Q:{selectedVenda.quadra} / L:
                            {selectedVenda.numeroLote}
                          </p>
                        </div>
                        {selectedVenda.rua && (
                          <div className="col-span-2">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                              Logradouro
                            </p>
                            <p className="font-bold text-slate-800">
                              {selectedVenda.rua}
                            </p>
                          </div>
                        )}
                      </div>

                      <p className="text-sm font-medium italic text-slate-500">
                        Pelo que damos plena, geral e irrevogável quitação do
                        referido valor, para que nada mais se reclame.
                      </p>
                    </div>

                    <div className="mt-20 pt-10 border-t border-slate-100 flex justify-between items-end">
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          Santarém/PA,{" "}
                          {new Date(selectedVenda.dataVenda).toLocaleDateString(
                            "pt-BR",
                            { day: "2-digit", month: "long", year: "numeric" },
                          )}
                        </p>
                      </div>
                      <div className="w-64 text-center">
                        <div className="h-px bg-slate-900 mb-2" />
                        <p className="text-[10px] font-bold uppercase text-slate-400">
                          Assinatura do Vendedor
                        </p>
                        <p className="font-bold text-slate-900">
                          {selectedVenda.vendedor || "GENILSON P. MOREIRA"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
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
    if (cpf && !validarCPF(cpf))
      setFieldErrors((e) => ({ ...e, cpf: "CPF inválido" }));
    else
      setFieldErrors((e) => ({ ...e, cpf: undefined }));
  };

  const handleBlurRG = () => {
    const rg = editForm.rg || "";
    if (rg && !validarRG(rg))
      setFieldErrors((e) => ({ ...e, rg: "RG inválido (mínimo 7 dígitos)" }));
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
                    className={`input-field ${fieldErrors.cpf ? "border-red-400 focus:ring-red-400" : ""}`}
                    value={editForm.cpf || ""}
                    onChange={(e) => setEditForm({ ...editForm, cpf: e.target.value })}
                    onBlur={handleBlurCPF}
                    placeholder="000.000.000-00"
                  />
                  {fieldErrors.cpf && <p className="text-red-500 text-xs mt-1 font-medium">{fieldErrors.cpf}</p>}
                </div>
                <div>
                  <label className="label">RG</label>
                  <input
                    className={`input-field ${fieldErrors.rg ? "border-red-400 focus:ring-red-400" : ""}`}
                    value={editForm.rg || ""}
                    onChange={(e) => setEditForm({ ...editForm, rg: e.target.value })}
                    onBlur={handleBlurRG}
                    placeholder="0000000"
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

const AniversariosSection = ({ clients }: { clients: Cliente[] }) => {
  const currentMonth = new Date().getMonth();
  const today = new Date();

  const meshAniversariantes = clients.filter((c) => {
    const bday = new Date(c.nascimento);
    return bday.getMonth() === currentMonth;
  });

  const proximos90Dias = clients
    .filter((c) => {
      const bday = new Date(c.nascimento);
      const nextBday = new Date(
        today.getFullYear(),
        bday.getMonth(),
        bday.getDate(),
      );
      if (nextBday < today) nextBday.setFullYear(today.getFullYear() + 1);
      const diffTime = Math.abs(nextBday.getTime() - today.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 && diffDays <= 90 && bday.getMonth() !== currentMonth;
    })
    .sort((a, b) => {
      const bdayA = new Date(a.nascimento);
      const bdayB = new Date(b.nascimento);
      return (
        bdayA.getMonth() - bdayB.getMonth() || bdayA.getDate() - bdayB.getDate()
      );
    });

  return (
    <div className="space-y-12">
      <section>
        <div className="flex items-center gap-3 mb-6 px-2">
          <div className="p-3 bg-chumbo-base/10 text-chumbo-base rounded-2xl">
            <Cake size={24} className="stroke-[2.5]" />
          </div>
          <h3 className="text-xl font-display font-bold text-slate-800 tracking-tight">
            Celebrando este Mês
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {meshAniversariantes.map((cliente) => (
            <motion.div
              whileHover={{ y: -5 }}
              key={cliente.id}
              className="card-premium bg-gradient-to-br from-chumbo-light/20 to-white flex gap-5 items-center border-chumbo-base/20"
            >
              <div className="p-4 bg-chumbo-base text-primary-contrast rounded-2xl shadow-lg shadow-chumbo-base/30">
                <Cake size={28} />
              </div>
              <div>
                <p className="font-display font-bold text-slate-800 text-lg leading-tight">
                  {cliente.nome}
                </p>
                <div className="flex items-center gap-2 text-xs font-bold text-chumbo-base uppercase tracking-widest mt-1">
                  <span>
                    {new Date(cliente.nascimento).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "long",
                    })}
                  </span>
                  <span className="opacity-30">•</span>
                  <span className="text-slate-400 font-mono">
                    {cliente.telefone1}
                  </span>
                </div>
              </div>
              <div className="ml-auto">
                <a
                  href={`https://wa.me/55${cliente.telefone1.replace(/\D/g, "")}?text=${encodeURIComponent(`Olá ${cliente.nome}, passando para te desejar um Feliz Aniversário! Muita saúde, paz e realizações. Parabéns!`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 bg-success-main/10 text-success-main rounded-xl hover:bg-success-main hover:text-white transition-all flex items-center justify-center shadow-lg shadow-success-main/10"
                  title="Enviar parabéns via WhatsApp"
                >
                  <MessageCircle size={20} />
                </a>
              </div>
            </motion.div>
          ))}
          {meshAniversariantes.length === 0 && (
            <div className="col-span-full py-16 text-center text-slate-300 font-medium italic bg-slate-50 rounded-[32px] border-2 border-dashed border-slate-100">
              Nenhuma comemoração prevista para este mês.
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-6 px-2">
          <div className="p-3 bg-slate-100 text-slate-400 rounded-2xl">
            <ChevronRight size={24} className="stroke-[2.5]" />
          </div>
          <h3 className="text-xl font-display font-bold text-slate-800 tracking-tight">
            Próximos 90 dias
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {proximos90Dias.map((cliente) => (
            <div
              key={cliente.id}
              className="card-premium flex gap-5 items-center opacity-80 hover:opacity-100 transition-all"
            >
              <div className="p-3.5 bg-slate-50 text-slate-300 rounded-2xl font-mono text-center leading-none">
                <p className="text-[10px] uppercase font-bold text-slate-400">
                  {new Date(cliente.nascimento).toLocaleDateString("pt-BR", {
                    month: "short",
                  })}
                </p>
                <p className="text-lg font-bold text-slate-600">
                  {new Date(cliente.nascimento).getDate()}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-700 truncate">
                  {cliente.nome}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  {cliente.telefone1}
                </p>
              </div>
              <a
                href={`https://wa.me/55${cliente.telefone1.replace(/\D/g, "")}?text=${encodeURIComponent(`Olá ${cliente.nome}, passando para te desejar um Feliz Aniversário antecipado! Muita saúde, paz e realizações. Parabéns!`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:bg-success-main hover:text-white transition-all shadow-sm"
                title="Saldar via WhatsApp"
              >
                <MessageCircle size={18} />
              </a>
            </div>
          ))}
          {proximos90Dias.length === 0 && (
            <p className="col-span-full text-center text-slate-300 py-4 font-medium italic">
              Sem aniversariantes no radar.
            </p>
          )}
        </div>
      </section>
    </div>
  );
};

const ConfigSection = ({
  config,
  onSave,
}: {
  config: AppConfig;
  onSave: (c: AppConfig) => void;
}) => {
  const [formData, setFormData] = useState({ ...config, vendedores: config.vendedores || [] });
  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState('');
  const [showVendedorForm, setShowVendedorForm] = useState(false);
  const [editingVendedor, setEditingVendedor] = useState<Vendedor | null>(null);
  const emptyVendedor: Omit<Vendedor, "id"> = {
    nome: "", nacionalidade: "Brasileiro", estadoCivil: "solteiro",
    rg: "", cpf: "", endereco: "", numero: "", bairro: "", cidade: "", estado: "", cep: "",
  };
  const [vendedorForm, setVendedorForm] = useState<Omit<Vendedor, "id">>(emptyVendedor);

  const handleSaveVendedor = () => {
    if (!vendedorForm.nome.trim()) { alert("Nome é obrigatório."); return; }
    let updated: Vendedor[];
    if (editingVendedor) {
      updated = (formData.vendedores || []).map((v) =>
        v.id === editingVendedor.id ? { ...vendedorForm, id: editingVendedor.id } : v
      );
    } else {
      updated = [...(formData.vendedores || []), { ...vendedorForm, id: `vend-${Date.now()}` }];
    }
    setFormData({ ...formData, vendedores: updated });
    setShowVendedorForm(false);
    setEditingVendedor(null);
    setVendedorForm(emptyVendedor);
  };

  const handleDeleteVendedor = (id: string) => {
    if (!confirm("Remover este vendedor?")) return;
    setFormData({ ...formData, vendedores: (formData.vendedores || []).filter((v) => v.id !== id) });
  };

  const handleMigrate = async () => {
    setMigrating(true);
    setMigrateMsg('Dados agora salvos diretamente no Supabase. Nenhuma migração necessária.');
    setMigrating(false);
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
          <div key={v.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-border-subtle">
            <div>
              <p className="font-bold text-slate-800 text-sm">{v.nome}</p>
              <p className="text-xs text-slate-400">{v.estadoCivil} · CPF {v.cpf} · {v.cidade}/{v.estado}</p>
            </div>
            <div className="flex gap-2">
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
          <div className="border border-border-subtle rounded-2xl p-6 space-y-4 bg-slate-50/50">
            <h5 className="font-bold text-slate-700 text-sm">{editingVendedor ? "Editar Vendedor" : "Novo Vendedor"}</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Nome Completo</label>
                <input className="input-field" placeholder="Ex: GENILSON PEREIRA MOREIRA" value={vendedorForm.nome} onChange={(e) => setVendedorForm({ ...vendedorForm, nome: e.target.value })} />
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
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
          <div className="bg-slate-900 text-white rounded-[40px] p-10 shadow-[0_30px_100px_-20px_rgba(15,23,42,0.3)] relative overflow-hidden group border border-white/5">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-light/10 rounded-full -mr-24 -mt-24 blur-3xl group-hover:bg-primary-light/20 transition-all duration-1000" />

            <h3 className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-primary-light opacity-60 mb-10">
              Resumo da Proposta
            </h3>

            <div className="space-y-8 relative">
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

              <div className="grid grid-cols-2 gap-8">
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

              <div className="pt-10 border-t border-white/10">
                <p className="text-[10px] font-extrabold uppercase text-primary-light/60 tracking-widest mb-3">
                  Mensalidade Recomendada
                </p>
                <div className="flex items-baseline gap-3">
                  <p className="text-6xl font-display font-bold text-white tracking-tighter drop-shadow-2xl">
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

              <div className="mt-12 p-8 bg-white/5 rounded-[32px] border border-white/10 backdrop-blur-md shadow-inner">
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

  const handleSave = () => {
    if (!form.nome.trim()) { alert("Nome é obrigatório."); return; }
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
    if (!confirm("Remover este proprietário?")) return;
    onSave({ ...config, proprietarios: proprietarios.filter((p) => p.id !== id) });
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
          onClick={() => { setEditingId(null); setForm(emptyProp); setShowForm(true); }}
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
            <div className="card-premium space-y-6 bg-slate-50/50">
              <h4 className="font-bold text-slate-800 text-base">{editingId ? "Editar Proprietário" : "Novo Proprietário"}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">Nome Completo *</label>
                  <input className="input-field" placeholder="Ex: GENILSON PEREIRA MOREIRA" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
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
                  <input className="input-field" placeholder="000.000.000-00" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCPF(e.target.value) })} />
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
                  <label className="label">CEP</label>
                  <input className="input-field" placeholder="00000-000" value={form.cep} onChange={(e) => setForm({ ...form, cep: maskCEP(e.target.value) })} />
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button className="btn-ghost h-10 px-6" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyProp); }}>Cancelar</button>
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
    </div>
  );
};

// --- Main App ---

export default function App({ onLogout }: { onLogout?: () => void }) {
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
  const [contractToOpen, setContractToOpen] = useState<Venda | null>(null);
  const [prefilledSale, setPrefilledSale] = useState<
    Partial<Venda> | undefined
  >(undefined);

  useEffect(() => {
    const load = async () => {
      const [devs, cls, sls, cfg] = await Promise.all([
        dbService.getEmpreendimentos(),
        dbService.getClientes(),
        dbService.getVendas(),
        dbService.getAppConfig(),
      ]);
      setDevelopments(devs);
      setClients(cls);
      setSales(sls);
      setConfig(cfg);
      setIsLoaded(true);
    };
    load().catch(console.error);

    const subDevs = dbService.subscribeToEmpreendimentos((d) => setDevelopments(d));
    const subClientes = dbService.subscribeToClientes((d) => setClients(d));
    const subVendas = dbService.subscribeToVendas((d) => setSales(d));

    return () => {
      subDevs.unsubscribe();
      subClientes.unsubscribe();
      subVendas.unsubscribe();
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", config.theme);
  }, [config.theme]);

  const saveDev = (newDev: Empreendimento) => {
    if (!isLoaded) return;
    const updated = [...developments, newDev];
    setDevelopments(updated);
    dbService.saveEmpreendimentos(updated).catch(console.error);
  };

  const deleteDev = (id: string) => {
    const updated = developments.filter((d) => d.id !== id);
    setDevelopments(updated);
    dbService.saveEmpreendimentos(updated).catch(console.error);
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
    info: Record<string, { rua: string }>,
  ) => {
    const updated = developments.map((d) =>
      d.id === id
        ? { ...d, lotesInfo: { ...(d.lotesInfo || {}), ...info } }
        : d,
    );
    setDevelopments(updated);
    dbService.saveEmpreendimentos(updated).catch(console.error);
  };

  const saveAppConfig = (newConfig: AppConfig) => {
    setConfig(newConfig);
    dbService.saveAppConfig(newConfig).catch(console.error);
  };

  const handleGoToContracts = (v: Venda) => {
    setSection("contratos");
    setContractToOpen(v);
  };

  const handleStartSale = (data: Partial<Venda>) => {
    setPrefilledSale(data);
    setSection("vendas");
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
        return <DashboardSection sales={sales} developments={developments} />;
      case "empreendimentos":
        return (
          <EmpreendimentosSection
            developments={developments}
            sales={sales}
            onSave={saveDev}
            onDelete={deleteDev}
            onUpdateLotesInfo={updateLotesInfo}
            onStartSale={handleStartSale}
            proprietarios={config.proprietarios || []}
          />
        );
      case "proprietarios":
        return <ProprietariosSection config={config} onSave={saveAppConfig} />;
      case "vendas":
        return (
          <VendasSection
            developments={developments}
            onSaveVenda={saveSale}
            onGoToContracts={handleGoToContracts}
            initialSaleData={prefilledSale}
            onSaveDev={saveDev}
            vendedores={config.vendedores || []}
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
        return <AniversariosSection clients={clients} />;
      case "calculadora":
        return <CalculatorSection />;
      case "config":
        return <ConfigSection config={config} onSave={saveAppConfig} />;
      default:
        return <DashboardSection sales={sales} developments={developments} />;
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
    };
    return titles[section];
  };

  return (
    <div className="min-h-screen bg-surface-bg flex">
      <Sidebar
        currentSection={section}
        setSection={setSection}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        onLogout={onLogout}
      />

      <main className="flex-1 lg:ml-72 p-4 sm:p-8 lg:p-10 pt-24 lg:pt-32 pb-32 lg:pb-10 no-print transition-all duration-300">
        <Header
          title={getTitle()}
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
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

      <BottomNav currentSection={section} setSection={setSection} />
      {section !== "vendas" && <FAB setSection={setSection} />}

      {/* Hidden print area for contracts */}
      <div className="hidden print-only w-full h-full bg-white">
        {/* The contract modal content is handled separately but we can replicate standard print view if needed */}
        {/* For this applet, window.print on the modal is effective since it's the only visible thing */}
      </div>
    </div>
  );
}
