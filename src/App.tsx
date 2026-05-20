// ATUALIZAÇÃO MAPA
// - Bolinhas sem número no modo visualização/exportação
// - Números e quadra aparecem no modo edição
// - Tamanho das bolinhas configurável por porcentagem no menu Editar mapa
// - Sair da edição somente ao clicar em Salvar / OK
// - Nome exportado: empreendimento + dia da semana + data + hora

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
  Banknote,
  CreditCard,
  Layers,
  Sparkles,
  Copy,
  Save,
  FileCheck,
  MessageCircle,
  BarChart3,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  PieChart as PieChartIcon,
  Trophy,
  Medal,
  Download,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
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
import {
  Section,
  Empreendimento,
  Cliente,
  Venda,
  VendaExcluida,
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


function normalizeLotText(value?: string | number | null): string {
  return String(value ?? "").trim();
}

function normalizeLotKeyPart(value?: string | number | null): string {
  return normalizeLotText(value).toUpperCase();
}

function getQuadraList(dev?: Empreendimento | null): string[] {
  return (dev?.quadras || "")
    .split(",")
    .map((q) => q.trim())
    .filter(Boolean);
}

function findQuadraName(dev: Empreendimento, quadra: string): string | null {
  const wanted = normalizeLotKeyPart(quadra);
  return getQuadraList(dev).find((q) => normalizeLotKeyPart(q) === wanted) || null;
}

function getLotInfoKey(quadra: string, lote: string): string {
  return `${normalizeLotKeyPart(quadra)}-${normalizeLotKeyPart(lote)}`;
}

type MapaLoteStatus = "disponivel" | "reservado" | "indisponivel";

function normalizeMapaStatus(status: any): MapaLoteStatus {
  if (status === "reservado") return "reservado";
  if (status === "indisponivel" || status === "vendido") return "indisponivel";
  return "disponivel";
}

function getMapaStatusColorClass(status: any, hasVenda = false): string {
  if (hasVenda || status === "indisponivel" || status === "vendido") return "bg-red-500";
  if (status === "reservado") return "bg-yellow-400 text-slate-900";
  return "bg-blue-500";
}

function getMapaStatusLabel(status: any, hasVenda = false): string {
  if (hasVenda || status === "indisponivel" || status === "vendido") return "Indisponível";
  if (status === "reservado") return "Reservado";
  return "Disponível";
}

function hasConfiguredLot(dev: Empreendimento, quadra: string, lote: string): boolean {
  const quadraName = findQuadraName(dev, quadra);
  const key = getLotInfoKey(quadra, lote);
  if (dev.lotesInfo?.[key]) return true;
  if (!quadraName) return false;
  return getLotesDeQuadra(dev.lotesPorQuadra?.[quadraName]).some(
    (l) => normalizeLotKeyPart(l) === normalizeLotKeyPart(lote)
  );
}

function getLotStatusForSale(
  dev: Empreendimento | undefined,
  quadra: string | undefined,
  lote: string | undefined,
  vendas: Venda[],
  ignoreVendaId?: string
): { exists: boolean; status: "disponivel" | "reservado" | "indisponivel" | "vendido" } {
  if (!dev || !quadra || !lote) return { exists: true, status: "disponivel" };
  const q = normalizeLotText(quadra);
  const l = normalizeLotText(lote);
  const key = getLotInfoKey(q, l);
  const info = dev.lotesInfo?.[key];
  const hasActiveSale = vendas.some(
    (v) =>
      v.id !== ignoreVendaId &&
      v.empreendimentoId === dev.id &&
      normalizeLotKeyPart(v.quadra) === normalizeLotKeyPart(q) &&
      normalizeLotKeyPart(v.numeroLote) === normalizeLotKeyPart(l) &&
      v.status !== "cancelado" &&
      v.status !== "rascunho"
  );

  if (hasActiveSale || info?.status === "vendido") return { exists: hasConfiguredLot(dev, q, l), status: "vendido" };
  if (info?.status === "reservado") return { exists: hasConfiguredLot(dev, q, l), status: "reservado" };
  if (info?.status === "indisponivel") return { exists: hasConfiguredLot(dev, q, l), status: "indisponivel" };
  return { exists: hasConfiguredLot(dev, q, l), status: "disponivel" };
}

function isVendaAtiva(venda?: Venda | null): boolean {
  return !!venda && venda.status !== "cancelado" && venda.status !== "rascunho";
}

function findVendaAtivaDoLote(
  vendas: Venda[],
  empreendimentoId: string,
  quadra: string,
  lote: string,
): Venda | undefined {
  return vendas.find(
    (s) =>
      s.empreendimentoId === empreendimentoId &&
      isVendaAtiva(s) &&
      normalizeLotKeyPart(s.quadra) === normalizeLotKeyPart(quadra) &&
      normalizeLotKeyPart(s.numeroLote) === normalizeLotKeyPart(lote),
  );
}

function formatDateBR(date?: string): string {
  if (!date) return "Não informada";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("pt-BR");
}

function countConfiguredLots(dev: Empreendimento): number {
  const lotesPorQuadraTotal = getQuadraList(dev).reduce(
    (sum, q) => sum + getLotesDeQuadra(dev.lotesPorQuadra?.[q]).length,
    0
  );
  if (lotesPorQuadraTotal > 0) return lotesPorQuadraTotal;
  return Object.keys(dev.lotesInfo || {}).length || dev.totalLotes || 0;
}

function getConfiguredLotKeys(dev: Empreendimento): Set<string> {
  const keys = new Set<string>();

  getQuadraList(dev).forEach((quadra) => {
    getLotesDeQuadra(dev.lotesPorQuadra?.[quadra]).forEach((lote) => {
      keys.add(getLotInfoKey(quadra, lote));
    });
  });

  Object.keys(dev.lotesInfo || {}).forEach((key) => keys.add(key.toUpperCase()));
  return keys;
}

function getConfiguredLotKeysFromRanges(dev: Empreendimento): Set<string> {
  const keys = new Set<string>();
  getQuadraList(dev).forEach((quadra) => {
    getLotesDeQuadra(dev.lotesPorQuadra?.[quadra]).forEach((lote) => {
      keys.add(getLotInfoKey(quadra, lote));
    });
  });
  return keys;
}

function getActiveSaleLotKeys(dev: Empreendimento, vendas: Venda[] = []): Set<string> {
  const keys = new Set<string>();
  vendas.forEach((v) => {
    if (v.empreendimentoId === dev.id && isVendaAtiva(v) && v.quadra && v.numeroLote) {
      keys.add(getLotInfoKey(v.quadra, v.numeroLote));
    }
  });
  return keys;
}

function removeLotFromLotesPorQuadra(dev: Empreendimento, quadra: string, lote: string): { quadras: string; lotesPorQuadra: Record<string, any> } {
  const wantedQuadra = normalizeLotKeyPart(quadra);
  const wantedLote = normalizeLotKeyPart(lote);
  const nextLotesPorQuadra: Record<string, any> = { ...(dev.lotesPorQuadra || {}) };
  const quadras = getQuadraList(dev);
  const realQuadra = quadras.find((q) => normalizeLotKeyPart(q) === wantedQuadra) || quadra;
  const currentLots = getLotesDeQuadra(nextLotesPorQuadra[realQuadra]);
  if (currentLots.length > 0) {
    const remaining = currentLots.filter((l) => normalizeLotKeyPart(l) !== wantedLote);
    if (remaining.length > 0) {
      nextLotesPorQuadra[realQuadra] = { especificos: remaining.join(",") };
    } else {
      delete nextLotesPorQuadra[realQuadra];
      delete nextLotesPorQuadra[wantedQuadra];
    }
  }
  const nextQuadras = quadras.filter((q) => {
    if (normalizeLotKeyPart(q) !== wantedQuadra) return true;
    return getLotesDeQuadra(nextLotesPorQuadra[q]).length > 0;
  });
  return { quadras: nextQuadras.join(", "), lotesPorQuadra: nextLotesPorQuadra };
}

function deleteLotFromEmpreendimento(dev: Empreendimento, key: string, vendas: Venda[] = []): Empreendimento {
  const normalizedKey = key.toUpperCase();
  const [quadra, ...loteParts] = normalizedKey.split("-");
  const lote = loteParts.join("-");
  const newLotesInfo = { ...(dev.lotesInfo || {}) };
  delete newLotesInfo[normalizedKey];
  const nextMapaPontos = ((dev as any).mapaPontos || []).filter((ponto: any) => getLotInfoKey(ponto.quadra, ponto.lote) !== normalizedKey);
  const { quadras, lotesPorQuadra } = removeLotFromLotesPorQuadra(dev, quadra, lote);
  return recalcularEstatisticasEmpreendimento({ ...dev, quadras, lotesPorQuadra, lotesInfo: newLotesInfo, mapaPontos: nextMapaPontos } as Empreendimento, vendas);
}

function applyLotesInfoPatchToEmpreendimento(dev: Empreendimento, info: Record<string, any>, vendas: Venda[] = []): Empreendimento {
  let nextDev: Empreendimento = dev;
  const nextLotesInfo: Record<string, any> = { ...(dev.lotesInfo || {}) };
  Object.entries(info || {}).forEach(([rawKey, rawInfo]) => {
    const key = rawKey.toUpperCase();
    const [quadra, ...loteParts] = key.split("-");
    const lote = loteParts.join("-");
    const ensured = ensureLotExistsInEmpreendimento(nextDev, quadra, lote);
    nextDev = ensured.dev;
    nextLotesInfo[ensured.lotInfoKey] = { ...(nextLotesInfo[ensured.lotInfoKey] || {}), ...(rawInfo || {}) };
  });
  const nextMapaPontos = ((nextDev as any).mapaPontos || []).map((ponto: any) => {
    const key = getLotInfoKey(ponto.quadra, ponto.lote);
    const changed = nextLotesInfo[key];
    if (!changed?.status) return ponto;
    const venda = findVendaAtivaDoLote(vendas, nextDev.id, ponto.quadra, ponto.lote);
    return {
      ...ponto,
      status: venda ? "indisponivel" : normalizeMapaStatus(changed.status),
      observacao: changed.observacao ?? ponto.observacao,
      vendaId: venda?.id || ponto.vendaId,
      clienteNome: venda?.clienteNome || ponto.clienteNome,
      dataVenda: venda?.dataVenda || ponto.dataVenda,
      atualizadoEm: new Date().toISOString(),
    };
  });
  return recalcularEstatisticasEmpreendimento({ ...nextDev, lotesInfo: nextLotesInfo, mapaPontos: nextMapaPontos } as Empreendimento, vendas);
}

function syncEmpreendimentoConfigWithMapa(dev: Empreendimento, vendas: Venda[] = []): Empreendimento {
  const rangeKeys = getConfiguredLotKeysFromRanges(dev);
  const quadras = getQuadraList(dev);
  const activeSaleKeys = getActiveSaleLotKeys(dev, vendas);

  if (rangeKeys.size === 0) {
    // Se não existe nenhum lote configurado nas quadras, o mapa também não pode manter bolinhas antigas.
    // Mantém o nome das quadras quando houver, mas zera lotes, mapa e contadores.
    return recalcularEstatisticasEmpreendimento({
      ...dev,
      totalLotes: 0,
      lotesInfo: {},
      mapaPontos: [],
      lotesPorQuadra: dev.lotesPorQuadra || {},
      quadras: quadras.join(", "),
    } as Empreendimento, vendas);
  }

  const keepKey = (key: string) => rangeKeys.has(key.toUpperCase()) || activeSaleKeys.has(key.toUpperCase());
  const nextLotesInfo = Object.fromEntries(Object.entries(dev.lotesInfo || {}).filter(([key]) => keepKey(key)));
  const nextMapaPontos = ((dev as any).mapaPontos || []).filter((ponto: any) => keepKey(getLotInfoKey(ponto.quadra, ponto.lote)));
  return recalcularEstatisticasEmpreendimento({ ...dev, lotesInfo: nextLotesInfo, mapaPontos: nextMapaPontos } as Empreendimento, vendas);
}

function countSoldLots(dev: Empreendimento, vendas: Venda[]): number {
  const soldKeys = new Set<string>();
  vendas.forEach((v) => {
    if (
      v.empreendimentoId === dev.id &&
      v.status !== "cancelado" &&
      v.status !== "rascunho" &&
      v.quadra &&
      v.numeroLote
    ) {
      soldKeys.add(getLotInfoKey(v.quadra, v.numeroLote));
    }
  });
  Object.entries(dev.lotesInfo || {}).forEach(([key, info]) => {
    if ((info as any)?.status === "vendido") soldKeys.add(key.toUpperCase());
  });
  return soldKeys.size;
}

function recalcularEstatisticasEmpreendimento(dev: Empreendimento, vendas: Venda[] = []): Empreendimento {
  const configuredKeys = getConfiguredLotKeys(dev);
  const totalLotes = configuredKeys.size > 0 ? configuredKeys.size : Number(dev.totalLotes || 0);
  const soldKeys = new Set<string>();
  const indisponiveis = new Set<string>();
  const reservados = new Set<string>();

  vendas.forEach((v) => {
    if (
      v.empreendimentoId === dev.id &&
      v.status !== "cancelado" &&
      v.status !== "rascunho" &&
      v.quadra &&
      v.numeroLote
    ) {
      soldKeys.add(getLotInfoKey(v.quadra, v.numeroLote));
    }
  });

  Object.entries(dev.lotesInfo || {}).forEach(([key, info]) => {
    const normalizedKey = key.toUpperCase();
    if ((info as any)?.status === "vendido") soldKeys.add(normalizedKey);
    if ((info as any)?.status === "reservado") reservados.add(normalizedKey);
    if ((info as any)?.status === "indisponivel") indisponiveis.add(normalizedKey);
  });

  soldKeys.forEach((key) => { indisponiveis.delete(key); reservados.delete(key); });
  reservados.forEach((key) => indisponiveis.delete(key));

  const lotesVendidos = soldKeys.size;
  const lotesReservados = reservados.size;
  const lotesIndisponiveis = indisponiveis.size;
  const lotesDisponiveis = Math.max(0, totalLotes - lotesVendidos - lotesReservados - lotesIndisponiveis);

  return {
    ...dev,
    totalLotes,
    lotesVendidos,
    lotesIndisponiveis,
    lotesReservados,
    lotesDisponiveis,
  } as Empreendimento;
}

function ensureLotExistsInEmpreendimento(dev: Empreendimento, quadra: string, lote: string): { dev: Empreendimento; quadraName: string; lotInfoKey: string } {
  const quadraText = normalizeLotText(quadra);
  const loteText = normalizeLotText(lote);
  const existingQuadra = findQuadraName(dev, quadraText);
  const quadraName = existingQuadra || quadraText;
  const quadras = getQuadraList(dev);
  const nextQuadras = existingQuadra ? quadras : [...quadras, quadraName];

  const currentLotesPorQuadra = { ...(dev.lotesPorQuadra || {}) };
  const currentEntry = currentLotesPorQuadra[quadraName] || {};
  const currentLots = getLotesDeQuadra(currentEntry);
  const lotExistsInQuadra = currentLots.some((l) => normalizeLotKeyPart(l) === normalizeLotKeyPart(loteText));

  if (!lotExistsInQuadra) {
    const uniqueLots: string[] = [];
    [...currentLots, loteText].filter(Boolean).forEach((item) => {
      if (!uniqueLots.some((existing) => normalizeLotKeyPart(existing) === normalizeLotKeyPart(item))) {
        uniqueLots.push(item);
      }
    });
    uniqueLots.sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a).localeCompare(String(b), "pt-BR", { numeric: true });
    });
    currentLotesPorQuadra[quadraName] = { especificos: uniqueLots.join(",") };
  }

  const lotInfoKey = getLotInfoKey(quadraName, loteText);
  return {
    dev: {
      ...dev,
      quadras: nextQuadras.join(", "),
      lotesPorQuadra: currentLotesPorQuadra,
      lotesInfo: { ...(dev.lotesInfo || {}) },
    } as Empreendimento,
    quadraName,
    lotInfoKey,
  };
}

function updateLoteStatusInEmpreendimento(
  dev: Empreendimento,
  vendas: Venda[],
  quadra: string,
  lote: string,
  novoStatus: "disponivel" | "reservado" | "indisponivel" | "vendido",
  options: Record<string, any> = {},
): Empreendimento {
  const loteText = normalizeLotText(lote);
  const { dev: ensuredDev, quadraName, lotInfoKey } = ensureLotExistsInEmpreendimento(dev, quadra, loteText);
  const existingInfo = (ensuredDev.lotesInfo || {})[lotInfoKey] || {};
  const historicoStatus = [
    ...(((existingInfo as any).historicoStatus as any[]) || []),
    {
      statusAnterior: (existingInfo as any).status || "disponivel",
      novoStatus,
      data: new Date().toISOString(),
      origem: options.origem || "manual",
      vendaId: options.venda?.id || options.vendaId || (existingInfo as any).vendaId || null,
      clienteId: options.venda?.clienteId || options.clienteId || (existingInfo as any).clienteId || null,
      clienteNome: options.venda?.clienteNome || options.clienteNome || (existingInfo as any).clienteNome || null,
    },
  ];

  const nextInfo: Record<string, any> = {
    ...existingInfo,
    rua: options.rua ?? options.venda?.rua ?? (existingInfo as any).rua ?? "",
    status: novoStatus,
    historicoStatus,
  };

  if (novoStatus === "vendido") {
    nextInfo.vendaId = options.venda?.id || options.vendaId || nextInfo.vendaId;
    nextInfo.clienteId = options.venda?.clienteId || options.clienteId || nextInfo.clienteId;
    nextInfo.clienteNome = options.venda?.clienteNome || options.clienteNome || nextInfo.clienteNome;
    nextInfo.dataVenda = options.venda?.dataVenda || options.dataVenda || nextInfo.dataVenda;
    nextInfo.empreendimentoNome = options.venda?.empreendimentoNome || options.empreendimentoNome || dev.nome;
  }

  if (novoStatus === "disponivel" && options.removerVinculoAtivo !== false) {
    if (nextInfo.vendaId || nextInfo.clienteNome || nextInfo.dataVenda || options.venda) {
      nextInfo.historicoLiberacao = [
        ...(((existingInfo as any).historicoLiberacao as any[]) || []),
        {
          vendaId: nextInfo.vendaId || options.venda?.id || "",
          clienteId: nextInfo.clienteId || options.venda?.clienteId || "",
          clienteNome: nextInfo.clienteNome || options.venda?.clienteNome || "Cliente não informado",
          empreendimentoId: dev.id,
          empreendimentoNome: nextInfo.empreendimentoNome || options.venda?.empreendimentoNome || dev.nome,
          quadra: quadraName,
          lote: loteText,
          dataVenda: nextInfo.dataVenda || options.venda?.dataVenda || "",
          dataLiberacao: new Date().toISOString(),
        },
      ];
      nextInfo.desistente = {
        clienteId: nextInfo.clienteId || options.venda?.clienteId || "",
        clienteNome: nextInfo.clienteNome || options.venda?.clienteNome || "Cliente não informado",
        dataDesistencia: new Date().toISOString().split("T")[0],
        dataVenda: nextInfo.dataVenda || options.venda?.dataVenda || "",
        vendaId: nextInfo.vendaId || options.venda?.id || "",
      };
    }
    delete nextInfo.vendaId;
    delete nextInfo.clienteId;
    delete nextInfo.clienteNome;
    delete nextInfo.dataVenda;
    delete nextInfo.empreendimentoNome;
  }

  const nextMapaPontos = ((ensuredDev as any).mapaPontos || []).map((ponto: any) => {
    const sameLot = getLotInfoKey(ponto.quadra, ponto.lote) === lotInfoKey;
    if (!sameLot) return ponto;
    const pontoAtualizado: any = {
      ...ponto,
      status: novoStatus === "vendido" ? "indisponivel" : normalizeMapaStatus(novoStatus),
      atualizadoEm: new Date().toISOString(),
    };
    if (novoStatus === "vendido") {
      pontoAtualizado.vendaId = options.venda?.id || options.vendaId || pontoAtualizado.vendaId;
      pontoAtualizado.clienteNome = options.venda?.clienteNome || options.clienteNome || pontoAtualizado.clienteNome;
      pontoAtualizado.dataVenda = options.venda?.dataVenda || options.dataVenda || pontoAtualizado.dataVenda;
    }
    if (novoStatus === "disponivel" && options.removerVinculoAtivo !== false) {
      if (pontoAtualizado.vendaId || pontoAtualizado.clienteNome) {
        pontoAtualizado.historico = [
          ...((pontoAtualizado.historico as any[]) || []),
          {
            clienteAnterior: pontoAtualizado.clienteNome || nextInfo.clienteNome || "Cliente não informado",
            vendaIdAnterior: pontoAtualizado.vendaId || nextInfo.vendaId || "",
            dataVenda: pontoAtualizado.dataVenda || nextInfo.dataVenda || "",
            dataLiberacao: new Date().toISOString(),
            status: "liberado/desistiu",
          },
        ];
      }
      delete pontoAtualizado.vendaId;
      delete pontoAtualizado.clienteNome;
      delete pontoAtualizado.dataVenda;
    }
    return pontoAtualizado;
  });

  const nextDev = {
    ...ensuredDev,
    lotesInfo: {
      ...(ensuredDev.lotesInfo || {}),
      [lotInfoKey]: nextInfo,
    },
    mapaPontos: nextMapaPontos,
  } as Empreendimento;

  return recalcularEstatisticasEmpreendimento(nextDev, vendas);
}

function addOrUpdateSoldLotFromSale(dev: Empreendimento, venda: Venda, vendas: Venda[]): Empreendimento {
  if (!venda.quadra || !venda.numeroLote) return recalcularEstatisticasEmpreendimento(dev, vendas);
  return updateLoteStatusInEmpreendimento(dev, vendas, venda.quadra, venda.numeroLote, "vendido", {
    venda,
    origem: "venda",
    rua: venda.rua || "",
    removerVinculoAtivo: false,
  });
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

function textoMaiusculo(valor: any): string {
  return String(valor || "").toLocaleUpperCase("pt-BR");
}

function normalizarNomeObrigatorio<T extends Record<string, any>>(obj: T): T {
  return { ...obj, nome: textoMaiusculo(obj?.nome).trim() };
}

// ─── Componente: Busca de CEP por Rua / Cidade ──────────────────────────────
type CepResultado = {
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
};

const BuscarCEPPorRua = ({
  onSelect,
  estadoPadrao = "PA",
  cidadePadrao = "",
}: {
  onSelect: (r: CepResultado) => void;
  estadoPadrao?: string;
  cidadePadrao?: string;
}) => {
  const [open, setOpen] = React.useState(false);
  const [uf, setUf] = React.useState(estadoPadrao);
  const [cidade, setCidade] = React.useState(cidadePadrao);
  const [rua, setRua] = React.useState("");
  const [resultados, setResultados] = React.useState<CepResultado[]>([]);
  const [buscando, setBuscando] = React.useState(false);
  const [erro, setErro] = React.useState("");

  const buscar = async () => {
    const ufClean = uf.trim().toUpperCase();
    const cidadeClean = cidade.trim();
    const ruaClean = rua.trim();
    if (!ufClean || !cidadeClean || !ruaClean) {
      setErro("Preencha UF, cidade e pelo menos parte da rua.");
      return;
    }
    setBuscando(true);
    setErro("");
    setResultados([]);
    try {
      const url = `https://viacep.com.br/ws/${encodeURIComponent(ufClean)}/${encodeURIComponent(cidadeClean)}/${encodeURIComponent(ruaClean)}/json/`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erro de rede");
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        setErro("Nenhum CEP encontrado. Tente termos mais genéricos.");
      } else {
        setResultados(data.slice(0, 20));
      }
    } catch {
      setErro("Falha ao buscar. Verifique a conexão e tente novamente.");
    } finally {
      setBuscando(false);
    }
  };

  const handleSelect = (r: CepResultado) => {
    onSelect(r);
    setOpen(false);
    setResultados([]);
    setRua("");
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-[10px] font-bold text-primary-main hover:underline mt-1"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        Não sei o CEP — buscar por rua/cidade
      </button>
    );
  }

  return (
    <div className="mt-2 bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Buscar CEP por endereço</p>
        <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="label">UF *</label>
          <input
            className="input-field text-center font-bold uppercase"
            maxLength={2}
            value={uf}
            onChange={(e) => setUf(e.target.value.toUpperCase())}
            placeholder="PA"
          />
        </div>
        <div className="col-span-2">
          <label className="label">Cidade *</label>
          <input
            className="input-field"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            placeholder="Ex: Santarém"
          />
        </div>
      </div>
      <div>
        <label className="label">Rua / Logradouro * <span className="text-slate-400 font-normal">(mín. 3 letras)</span></label>
        <div className="flex gap-2">
          <input
            className="input-field flex-1"
            value={rua}
            onChange={(e) => setRua(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder="Ex: Mendonça Furtado"
          />
          <button
            type="button"
            onClick={buscar}
            disabled={buscando}
            className="btn-primary h-11 px-4 text-sm font-bold disabled:opacity-50 flex items-center gap-1.5 shrink-0"
          >
            {buscando ? (
              <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            )}
            Buscar
          </button>
        </div>
      </div>
      {erro && <p className="text-xs font-bold text-red-500 bg-red-50 px-3 py-2 rounded-xl">{erro}</p>}
      {resultados.length > 0 && (
        <div className="space-y-1.5 max-h-52 overflow-y-auto">
          <p className="text-[10px] font-bold text-slate-400 uppercase">{resultados.length} resultado{resultados.length !== 1 ? "s" : ""} — clique para usar</p>
          {resultados.map((r) => (
            <button
              key={r.cep}
              type="button"
              onClick={() => handleSelect(r)}
              className="w-full text-left bg-white border border-slate-200 hover:border-primary-main hover:bg-primary-main/5 rounded-xl px-4 py-2.5 transition-all"
            >
              <p className="font-bold text-slate-800 text-sm">{r.logradouro || r.cep}</p>
              <p className="text-[10px] font-semibold text-slate-500">{r.bairro && `${r.bairro} · `}{r.localidade}/{r.uf} · <span className="font-mono font-bold text-primary-main">{r.cep}</span></p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

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

type GeneroBinario = "M" | "F";

function getGeneroPessoa(pessoa: any, papelBase: "VENDEDOR" | "COMPRADOR") {
  const genero: GeneroBinario = pessoa?.genero === "F" ? "F" : "M";
  const feminino = genero === "F";
  const papel = papelBase === "VENDEDOR"
    ? (feminino ? "VENDEDORA" : "VENDEDOR")
    : (feminino ? "COMPRADORA" : "COMPRADOR");

  return {
    genero,
    tratamento: feminino ? "Sra." : "Sr.",
    artigo: feminino ? "a" : "o",
    nacionalidade: feminino ? "brasileira" : "brasileiro",
    estadoCivil: genderizeEstadoCivil(pessoa?.estadoCivil || "", genero).toLowerCase(),
    portador: feminino ? "portadora" : "portador",
    domiciliado: feminino ? "domiciliada" : "domiciliado",
    chamado: feminino ? "chamada" : "chamado",
    papel,
    aoA: feminino ? "à" : "ao",
    peloPela: feminino ? "pela" : "pelo",
  };
}

function generoContratoValido(pessoa: any): boolean {
  return pessoa?.genero === "M" || pessoa?.genero === "F";
}
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
    { id: "vendas", label: "Nova Venda", icon: ShoppingCart },
    { id: "contratos", label: "Contratos", icon: FileText },
    { id: "empreendimentos", label: "Empreendimentos", icon: Building2 },
    { id: "clientes", label: "Clientes", icon: Users },
    { id: "aniversarios", label: "Aniversários", icon: Cake },
    { id: "proprietarios", label: "Proprietários", icon: UserCheck },
    { id: "usuarios", label: "Usuários", icon: User },
    { id: "calculadora", label: "Calculadora", icon: Calculator },
  ];

  // Filtra itens de menu por permissão (admin sempre vê tudo)
  const mainMenuItems = isAdmin
    ? allMenuItems
    : allMenuItems.filter((item) => userPermissions?.[item.id] !== false);

  const configItem = { id: "config", label: "Configurações", icon: Settings };
  const showConfig = isAdmin || userPermissions?.["config"] !== false;
  const historicoItem = { id: "historico", label: "Lixeira", icon: Trash2 };
  const showHistorico = isAdmin || userPermissions?.["historico"] !== false;

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

          {/* Lixeira */}
          {showHistorico && (() => {
            const item = historicoItem;
            const Icon = item.icon;
            const isActive = currentSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setSection(item.id as Section); setIsOpen(false); }}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-200 group ${isActive ? "bg-primary-main text-primary-contrast shadow-lg shadow-primary-main/20 font-semibold" : "text-slate-500 hover:bg-slate-50 hover:text-primary-main"}`}
              >
                <div className={`p-2 rounded-lg ${isActive ? "bg-white/20" : "bg-slate-100 group-hover:bg-primary-light/10 text-slate-400 group-hover:text-primary-main"} transition-colors`}>
                  <Icon size={18} />
                </div>
                <span className="text-sm">{item.label}</span>
                {isActive && <motion.div layoutId="nav-active" className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-contrast shadow-sm" />}
              </button>
            );
          })()}

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
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "contratos", label: "Contratos", icon: FileText },
    { id: "clientes", label: "Clientes", icon: Users },
    { id: "empreendimentos", label: "Mapa", icon: MapPin },
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
    <div className="flex justify-between items-start gap-1">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1.5">
          {title}
        </p>
        <p className="text-base sm:text-2xl lg:text-3xl font-display font-bold tracking-tight break-all leading-tight">
          {value}
        </p>
        {subtitle && (
          <p className="text-[9px] opacity-70 mt-1 font-semibold">{subtitle}</p>
        )}
      </div>
      <div className="p-2 sm:p-3 bg-white/20 rounded-xl sm:rounded-2xl backdrop-blur-md shrink-0">
        <Icon size={20} className="stroke-[2.5]" />
      </div>
    </div>
    <div className="absolute -right-4 -bottom-4 opacity-10">
      <Icon size={80} />
    </div>
    {onClick && (
      <p className="text-[9px] font-bold uppercase tracking-widest opacity-50 mt-2 flex items-center gap-1">
        Ver <span className="text-base leading-none">›</span>
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

  // À vista: quantidadeParcelas === 0 ou formaPagamento indica "à vista"
  const vendasAvista = sales.filter(
    (s) =>
      s.quantidadeParcelas === 0 ||
      (typeof s.formaPagamento === "string" &&
        s.formaPagamento.toLowerCase().includes("vista")),
  );
  const vendasParceladas = sales.filter(
    (s) =>
      (s.quantidadeParcelas ?? 0) > 0 &&
      !(
        typeof s.formaPagamento === "string" &&
        s.formaPagamento.toLowerCase().includes("vista")
      ),
  );
  const totalAvistaValor = vendasAvista.reduce((acc, s) => acc + s.valorLote, 0);
  const totalParceladoValor = vendasParceladas.reduce((acc, s) => acc + s.valorLote, 0);
  const fmtBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(v);

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
    <div className="space-y-4 sm:space-y-8">
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

      {/* Cards principais — 2 colunas no celular, 4 no desktop */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-6">
        <StatCard
          title="Vendas"
          value={sales.length.toString()}
          icon={TrendingUp}
          colorClass="bg-gradient-to-br from-primary-main to-primary-accent"
        />
        <StatCard
          title="Faturamento"
          value={fmtBRL(totalRevenue)}
          icon={DollarSign}
          colorClass="bg-gradient-to-br from-slate-800 to-slate-900"
        />
        <StatCard
          title="Lotes Disponíveis"
          value={totalLotesDisponiveis.toString()}
          icon={LayoutDashboard}
          colorClass="bg-gradient-to-br from-chumbo-base to-chumbo-muted text-primary-contrast"
          onClick={() => onNavigate?.("empreendimentos")}
          subtitle={`em ${developments.length} empreend.`}
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

      {/* Indicadores de tipo de venda */}
      <div className="grid grid-cols-3 gap-2 sm:gap-6">
        {/* À Vista */}
        <div className="card-premium flex flex-col gap-2">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="p-1.5 sm:p-2 bg-emerald-100 rounded-lg sm:rounded-xl">
              <Banknote size={14} className="text-emerald-700 sm:hidden" />
              <Banknote size={18} className="text-emerald-700 hidden sm:block" />
            </div>
            <span className="text-[9px] sm:text-xs font-bold uppercase tracking-widest text-slate-500">À Vista</span>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xl sm:text-3xl font-display font-bold text-slate-800 leading-none">
              {vendasAvista.length}
            </p>
            <p className="text-[9px] text-slate-400 font-semibold">unidades</p>
            <p className="text-xs sm:text-sm font-display font-bold text-emerald-700 leading-none mt-1 break-all">
              {fmtBRL(totalAvistaValor)}
            </p>
            <p className="text-[9px] text-slate-400 font-semibold">faturado</p>
          </div>
        </div>

        {/* Parcelado */}
        <div className="card-premium flex flex-col gap-2">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="p-1.5 sm:p-2 bg-blue-100 rounded-lg sm:rounded-xl">
              <CreditCard size={14} className="text-blue-700 sm:hidden" />
              <CreditCard size={18} className="text-blue-700 hidden sm:block" />
            </div>
            <span className="text-[9px] sm:text-xs font-bold uppercase tracking-widest text-slate-500">Parcelado</span>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xl sm:text-3xl font-display font-bold text-slate-800 leading-none">
              {vendasParceladas.length}
            </p>
            <p className="text-[9px] text-slate-400 font-semibold">unidades</p>
            <p className="text-xs sm:text-sm font-display font-bold text-blue-700 leading-none mt-1 break-all">
              {fmtBRL(totalParceladoValor)}
            </p>
            <p className="text-[9px] text-slate-400 font-semibold">faturado</p>
          </div>
        </div>

        {/* Total Geral */}
        <div className="card-premium flex flex-col gap-2 border-primary-main/20">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="p-1.5 sm:p-2 bg-primary-main/10 rounded-lg sm:rounded-xl">
              <Layers size={14} className="text-primary-main sm:hidden" />
              <Layers size={18} className="text-primary-main hidden sm:block" />
            </div>
            <span className="text-[9px] sm:text-xs font-bold uppercase tracking-widest text-slate-500">Total</span>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xl sm:text-3xl font-display font-bold text-slate-800 leading-none">
              {sales.length}
            </p>
            <p className="text-[9px] text-slate-400 font-semibold">unidades</p>
            <p className="text-xs sm:text-sm font-display font-bold text-primary-main leading-none mt-1 break-all">
              {fmtBRL(totalRevenue)}
            </p>
            <p className="text-[9px] text-slate-400 font-semibold">faturado</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-8">
        <div className="card-premium">
          <div className="flex items-center gap-2 mb-3 sm:mb-6">
            <BarChart3 size={16} className="text-primary-main" />
            <h4 className="font-display font-bold text-slate-800 text-sm sm:text-base">
              Vendas (7 dias)
            </h4>
          </div>
          <div className="h-48 sm:h-64 w-full">
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
          <div className="flex items-center gap-2 mb-3 sm:mb-6">
            <PieChartIcon size={16} className="text-primary-main" />
            <h4 className="font-display font-bold text-slate-800 text-sm sm:text-base">
              Ocupação por Loteamento
            </h4>
          </div>
          <div className="h-48 sm:h-64 w-full">
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

      {/* Ranking de Vendedores */}
      {(() => {
        const rankMap: Record<string, {
          nome: string;
          totalVendas: number;
          totalContratos: number;
          totalValor: number;
          avista: number;
          parcelado: number;
        }> = {};

        sales.forEach((s) => {
          const nome = (s.vendedor || "").trim() || "Sem vendedor";
          if (!rankMap[nome]) {
            rankMap[nome] = { nome, totalVendas: 0, totalContratos: 0, totalValor: 0, avista: 0, parcelado: 0 };
          }
          rankMap[nome].totalVendas += 1;
          rankMap[nome].totalValor += s.valorLote;
          if (s.contratoGerado || s.numeroContrato) rankMap[nome].totalContratos += 1;
          const isAvista =
            s.quantidadeParcelas === 0 ||
            (typeof s.formaPagamento === "string" && s.formaPagamento.toLowerCase().includes("vista"));
          if (isAvista) rankMap[nome].avista += 1;
          else rankMap[nome].parcelado += 1;
        });

        const ranking = Object.values(rankMap).sort(
          (a, b) => b.totalValor - a.totalValor || b.totalVendas - a.totalVendas
        );

        if (ranking.length === 0) return null;

        const medalColors = ["text-yellow-500", "text-slate-400", "text-amber-700"];
        const maxValor = ranking[0]?.totalValor || 1;

        return (
          <div className="card-premium">
            <div className="flex items-center gap-2 mb-4 sm:mb-6">
              <Trophy size={18} className="text-primary-main" />
              <h3 className="text-lg font-display font-bold text-slate-800">Ranking de Vendedores</h3>
            </div>

            <div className="hidden sm:grid grid-cols-[2rem_1fr_repeat(5,auto)] items-center gap-x-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 pb-2 border-b border-slate-100 mb-2">
              <span>#</span>
              <span>Vendedor</span>
              <span className="text-center w-12">Vendas</span>
              <span className="text-center w-16">Contratos</span>
              <span className="text-center w-14">À Vista</span>
              <span className="text-center w-14">Parcelado</span>
              <span className="text-right w-28">Total</span>
            </div>

            <div className="flex flex-col gap-2">
              {ranking.map((v, i) => {
                const pct = Math.round((v.totalValor / maxValor) * 100);
                return (
                  <div key={v.nome} className="rounded-2xl bg-slate-50 hover:bg-primary-main/5 transition-colors p-3 sm:p-4">
                    {/* Mobile */}
                    <div className="flex items-start justify-between gap-3 sm:hidden">
                      <div className="flex items-center gap-2">
                        {i < 3
                          ? <Medal size={18} className={medalColors[i]} />
                          : <span className="w-[18px] text-center text-xs font-bold text-slate-400">{i + 1}</span>
                        }
                        <span className="font-semibold text-slate-800 text-sm">{v.nome}</span>
                      </div>
                      <span className="font-display font-bold text-primary-main text-sm whitespace-nowrap">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v.totalValor)}
                      </span>
                    </div>
                    <div className="flex gap-3 mt-2 sm:hidden text-[11px] text-slate-500 font-semibold flex-wrap">
                      <span>{v.totalVendas} vendas</span>
                      <span>·</span>
                      <span>{v.totalContratos} contratos</span>
                      <span>·</span>
                      <span>{v.avista} à vista</span>
                      <span>·</span>
                      <span>{v.parcelado} parc.</span>
                    </div>
                    <div className="mt-2 h-1 rounded-full bg-slate-200 sm:hidden">
                      <div className="h-1 rounded-full bg-primary-main transition-all" style={{ width: `${pct}%` }} />
                    </div>

                    {/* Desktop */}
                    <div className="hidden sm:grid grid-cols-[2rem_1fr_repeat(5,auto)] items-center gap-x-4">
                      <div className="flex items-center justify-center">
                        {i < 3
                          ? <Medal size={16} className={medalColors[i]} />
                          : <span className="text-xs font-bold text-slate-400">{i + 1}</span>
                        }
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 text-sm truncate">{v.nome}</p>
                        <div className="mt-1 h-1 rounded-full bg-slate-200">
                          <div className="h-1 rounded-full bg-primary-main" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className="text-center text-sm font-bold text-slate-700 w-12">{v.totalVendas}</span>
                      <span className="text-center text-sm font-bold text-slate-700 w-16">{v.totalContratos}</span>
                      <span className="text-center text-sm font-bold text-emerald-700 w-14">{v.avista}</span>
                      <span className="text-center text-sm font-bold text-blue-700 w-14">{v.parcelado}</span>
                      <span className="text-right font-display font-bold text-primary-main text-sm whitespace-nowrap w-28">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v.totalValor)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
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
  onSaveDev,
  canEditMap = false,
  onMarkerSaved,
}: {
  dev: Empreendimento;
  sales: Venda[];
  clients: Cliente[];
  onStartSale: (v: Partial<Venda>) => void;
  onClose: () => void;
  onViewContract: (v: Venda) => void;
  onSaveDev: (d: Empreendimento) => void;
  canEditMap?: boolean;
  onMarkerSaved?: (quadra: string, lote: string, status: MapaLoteStatus, observacao: string) => void;
}) => {
  const [localDev, setLocalDev] = useState<Empreendimento>(dev);
  const [mode, setMode] = useState<"mapa" | "quadradinhos">((dev as any).mapaImagemBase64 || (dev as any).mapaImagemUrl ? "mapa" : "quadradinhos");
  // mapAction: "visualizar" = modo leitura, "editar" = edição geral (marcador ao clicar), "massa" = edição em massa
  const [mapAction, setMapAction] = useState<"visualizar" | "editar" | "massa">("visualizar");

  // Novo marcador unificado: fase "idle" | "formulario" | "aguardando_segundo"
  // lote pode ser "1" (único) ou "1,2,3,4" (múltiplos → linha entre dois pontos)
  const [marcadorFase, setMarcadorFase] = useState<"idle" | "formulario" | "aguardando_segundo">("idle");
  const [marcadorPonto1, setMarcadorPonto1] = useState<{ xPercent: number; yPercent: number } | null>(null);
  const [marcadorPonto2Preview, setMarcadorPonto2Preview] = useState<{ xPercent: number; yPercent: number } | null>(null);
  const [marcadorForm, setMarcadorForm] = useState({ quadra: "", lote: "", status: "disponivel" as MapaLoteStatus, observacao: "" });

  // Tamanho visual das bolinhas configurável em porcentagem.
  // Não altera xPercent/yPercent, portanto não move nenhuma bolinha.
  const [markerSizePercent, setMarkerSizePercent] = useState<number>(() => {
    const initial = Number((dev as any).mapaMarkerSizePercent ?? 100);
    return Number.isFinite(initial) ? Math.max(40, Math.min(220, initial)) : 100;
  });

  const [selectedPoint, setSelectedPoint] = useState<any | null>(null);
  const [selectedLotSale, setSelectedLotSale] = useState<Venda | null>(null);
  const [lastSessionPointIds, setLastSessionPointIds] = useState<string[]>([]);

  // Sequencia 2 pontos: mantida internamente para compatibilidade com criarBolinhasSequencia
  const [seqFase, setSeqFase] = useState<"aguardando_primeiro" | "formulario" | "aguardando_segundo">("aguardando_primeiro");
  const [seqPrimeiroClique, setSeqPrimeiroClique] = useState<{ xPercent: number; yPercent: number } | null>(null);
  const [seqForm, setSeqForm] = useState({ quadra: "", loteInicial: "", loteFinal: "", status: "disponivel" as MapaLoteStatus, observacao: "" });
  const [seqPreview, setSeqPreview] = useState<{ xPercent: number; yPercent: number } | null>(null);

  // Arrastar bolinhas no modo edição
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ mouseX: number; mouseY: number; xPercent: number; yPercent: number } | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Edição em massa
  const [massaSelIds, setMassaSelIds] = useState<Set<string>>(new Set());
  const [massaAcao, setMassaAcao] = useState<"disponivel" | "reservado" | "indisponivel" | "excluir" | "">("" as any);
  const [massaFiltroQuadra, setMassaFiltroQuadra] = useState("");
  const [massaFiltroLoteIni, setMassaFiltroLoteIni] = useState("");
  const [massaFiltroLoteFin, setMassaFiltroLoteFin] = useState("");

  // Seleção múltipla com CTRL (modo editar)
  const [ctrlSelectedIds, setCtrlSelectedIds] = useState<Set<string>>(new Set());

  // Posição do painel "Novo marcador" arrastável — via ref para zero re-renders durante drag
  const [marcadorPanelPos, setMarcadorPanelPos] = useState<{ x: number; y: number } | null>(null);
  const [draggingPanel, setDraggingPanel] = useState(false);
  const marcadorPanelRef = useRef<HTMLDivElement>(null);
  const dragPanelRef = useRef<{ mouseX: number; mouseY: number; panelX: number; panelY: number } | null>(null);
  const isDraggingPanelRef = useRef(false);
  const rafPanelRef = useRef<number | null>(null);

  useEffect(() => {
    setLocalDev(dev);
    const incomingMarkerSize = Number((dev as any).mapaMarkerSizePercent ?? 100);
    if (Number.isFinite(incomingMarkerSize)) setMarkerSizePercent(Math.max(40, Math.min(220, incomingMarkerSize)));
    // NÃO resetar mapAction aqui — a edição só encerra via salvarEdicaoMapa
    if (!((dev as any).mapaImagemBase64 || (dev as any).mapaImagemUrl)) setMode("quadradinhos");
  }, [dev]);

  useEffect(() => {
    if (!canEditMap) setMapAction("visualizar");
  }, [canEditMap]);

  // Resetar estado marcador ao trocar action
  useEffect(() => {
    if (mapAction !== "editar") {
      setMarcadorFase("idle");
      setMarcadorPonto1(null);
      setMarcadorPonto2Preview(null);
    }
  }, [mapAction]);

  const mapaPontos = ((localDev as any).mapaPontos || []) as any[];
  const mapaImagem = (localDev as any).mapaImagemBase64 || (localDev as any).mapaImagemUrl || "";
  const quadras = getQuadraList(localDev);
  const isEditingMap = canEditMap && mapAction !== "visualizar";
  const isMultiLote = (lote: string) => lote.includes(",") && lote.split(",").filter((s: string) => s.trim()).length > 1;

  const persistDev = (nextDev: Empreendimento) => {
    const recalculado = recalcularEstatisticasEmpreendimento(nextDev, sales);
    setLocalDev(recalculado);
    onSaveDev(recalculado);
  };

  const vendaDoLote = (quadra: string, lote: string, vendaId?: string) => {
    if (vendaId) {
      const byId = sales.find((v) => v.id === vendaId);
      if (byId) return byId;
    }
    return findVendaAtivaDoLote(sales, localDev.id, quadra, lote);
  };

  // ──────────────────────────────────────────────
  // UPLOAD DE IMAGEM
  // ──────────────────────────────────────────────
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const allowedImages = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    const isPDF = file.type === "application/pdf";
    if (!allowedImages.includes(file.type) && !isPDF) {
      alert("Use imagem PNG, JPG, WEBP ou arquivo PDF.");
      return;
    }
    if (isPDF) {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          if (!(window as any).pdfjsLib) {
            await new Promise<void>((resolve, reject) => {
              const script = document.createElement("script");
              script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
              script.onload = () => {
                (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
                  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
                resolve();
              };
              script.onerror = reject;
              document.head.appendChild(script);
            });
          }
          const pdfjsLib = (window as any).pdfjsLib;
          const pdfDoc = await pdfjsLib.getDocument({ data: reader.result as ArrayBuffer }).promise;
          const page = await pdfDoc.getPage(1);
          const viewport = page.getViewport({ scale: 2.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          persistDev({
            ...localDev,
            mapaImagemBase64: canvas.toDataURL("image/png"),
            mapaImagemUrl: "",
            mapaPontos: mapaPontos,
          } as Empreendimento);
          setMode("mapa");
        } catch (err) {
          alert("Não foi possível converter o PDF.\n" + String((err as any)?.message || err));
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      persistDev({
        ...localDev,
        mapaImagemBase64: String(reader.result || ""),
        mapaImagemUrl: "",
        mapaPontos: mapaPontos,
      } as Empreendimento);
      setMode("mapa");
    };
    reader.readAsDataURL(file);
  };

  // ──────────────────────────────────────────────
  // TAMANHO DAS BOLINHAS
  // ──────────────────────────────────────────────
  const getBallBasePixelSize = () => {
    const pct = Math.max(40, Math.min(220, Number(markerSizePercent) || 100)) / 100;
    return {
      size: Math.round(18 * pct),
      font: Math.max(6, Math.round(7 * pct)),
    };
  };

  const getBallPixelSize = () => {
    // Tamanho fixo em px: não depende do zoom/tela e não altera a posição.
    return getBallBasePixelSize();
  };

  // ──────────────────────────────────────────────
  // DOWNLOAD IMAGEM/PDF
  // ──────────────────────────────────────────────
  const limparNomeArquivoMapa = (value: string) =>
    (value || "EMPREENDIMENTO")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .toUpperCase();

  const getNomeArquivoMapaExportado = (ext: "png" | "pdf") => {
    const now = new Date();
    const diaSemana = limparNomeArquivoMapa(now.toLocaleDateString("pt-BR", { weekday: "long" }));
    const data = now.toLocaleDateString("pt-BR").replace(/\//g, "-");
    const hora = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }).replace(":", "-");
    const empreendimento = limparNomeArquivoMapa(localDev.nome || "EMPREENDIMENTO");
    return `${empreendimento}_${diaSemana}_${data}_${hora}.${ext}`;
  };

  const gerarCanvasMapaInterativo = (): Promise<HTMLCanvasElement> => {
    return new Promise((resolve, reject) => {
      if (!mapaImagem) {
        reject(new Error("Nenhum mapa carregado para baixar."));
        return;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Não foi possível preparar o mapa.")); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const baseSize = getBallBasePixelSize().size;
        const scale = Math.max(canvas.width / 1000, 1);
        const radius = Math.max((baseSize * scale) / 2, 10);
        mapaPontos.forEach((ponto) => {
          const venda = vendaDoLote(ponto.quadra, ponto.lote, ponto.vendaId);
          const indisponivel = ponto.status === "indisponivel" || !!venda;
          const reservado = !indisponivel && ponto.status === "reservado";
          const x = (Number(ponto.xPercent) / 100) * canvas.width;
          const y = (Number(ponto.yPercent) / 100) * canvas.height;
          ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = indisponivel ? "#ef4444" : reservado ? "#facc15" : "#3b82f6";
          ctx.fill();
          ctx.lineWidth = Math.max(3 * scale, 2); ctx.strokeStyle = "#ffffff"; ctx.stroke();
          // Exportação/visualização impressa: bolinha limpa, sem número.
          // Os números aparecem somente no modo Editar mapa.
        });
        resolve(canvas);
      };
      img.onerror = () => reject(new Error("Não foi possível baixar o mapa. Recarregue a imagem e tente novamente."));
      img.src = mapaImagem;
    });
  };

  const baixarMapaInterativoImagem = async () => {
    try {
      const canvas = await gerarCanvasMapaInterativo();
      const link = document.createElement("a");
      link.download = getNomeArquivoMapaExportado("png");
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch (error: any) {
      alert(error?.message || "Não foi possível baixar o mapa com as bolinhas.");
    }
  };

  const baixarMapaInterativoPdf = async () => {
    try {
      const canvas = await gerarCanvasMapaInterativo();
      const { jsPDF } = await import("jspdf");
      const landscape = canvas.width >= canvas.height;
      const pdf = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 6;
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;
      const ratio = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
      const imgWidth = canvas.width * ratio;
      const imgHeight = canvas.height * ratio;
      const x = (pageWidth - imgWidth) / 2;
      const y = (pageHeight - imgHeight) / 2;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y, imgWidth, imgHeight);
      pdf.save(getNomeArquivoMapaExportado("pdf"));
    } catch (error: any) {
      alert(error?.message || "Não foi possível baixar o mapa em PDF.");
    }
  };

  // ──────────────────────────────────────────────
  // CRIAR/PERSISTIR BOLINHA
  // ──────────────────────────────────────────────
  const ensureMapLotAndPoint = (raw: { quadra: string; lote: string; xPercent: number; yPercent: number; status: MapaLoteStatus; observacao?: string; moveExisting?: boolean; confirmMissing?: boolean; confirmDuplicate?: boolean }) => {
    const quadra = normalizeLotText(raw.quadra);
    const lote = normalizeLotText(raw.lote);
    if (!quadra || !lote) { alert("Informe quadra e lote."); return false; }
    const existingPoint = mapaPontos.find((p) => getLotInfoKey(p.quadra, p.lote) === getLotInfoKey(quadra, lote));
    if (existingPoint && !raw.moveExisting) {
      if (raw.confirmDuplicate === false) return false;
      const reposition = window.confirm("Este lote já existe no mapa. Deseja reposicionar a bolinha existente?");
      if (!reposition) return false;
      return ensureMapLotAndPoint({ ...raw, moveExisting: true });
    }
    const lotExists = hasConfiguredLot(localDev, quadra, lote);
    if (!lotExists && raw.confirmMissing !== false) {
      const add = window.confirm("Esta quadra/lote não existe no empreendimento. Deseja adicionar automaticamente?");
      if (!add) return false;
    }
    const ensured = ensureLotExistsInEmpreendimento(localDev, quadra, lote);
    const existingInfo = ensured.dev.lotesInfo?.[ensured.lotInfoKey] || {};
    const pontoBase = {
      id: existingPoint?.id || `map-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      empreendimentoId: localDev.id,
      quadra: ensured.quadraName,
      lote,
      xPercent: raw.xPercent,
      yPercent: raw.yPercent,
      status: raw.status,
      observacao: raw.observacao || existingPoint?.observacao || "",
      criadoEm: existingPoint?.criadoEm || new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
      vendaId: existingPoint?.vendaId,
      clienteNome: existingPoint?.clienteNome,
      dataVenda: existingPoint?.dataVenda,
      historico: existingPoint?.historico || [],
    };
    const currentPontos = ((localDev as any).mapaPontos || []) as any[];
    const nextPontos = raw.moveExisting && existingPoint
      ? currentPontos.map((p: any) => p.id === existingPoint.id ? pontoBase : p)
      : [...currentPontos, pontoBase];
    const nextInfo = { ...existingInfo, status: raw.status, observacao: raw.observacao || existingInfo.observacao || "" };
    const nextDev = recalcularEstatisticasEmpreendimento({
      ...ensured.dev,
      lotesInfo: { ...(ensured.dev.lotesInfo || {}), [ensured.lotInfoKey]: nextInfo },
      mapaPontos: nextPontos,
    } as Empreendimento, sales);
    persistDev(nextDev);
    if (!raw.moveExisting) setLastSessionPointIds((prev) => [...prev, pontoBase.id]);
    // Sync com Gerenciador de Lotes
    if (onMarkerSaved) onMarkerSaved(ensured.quadraName, lote, raw.status, raw.observacao || "");
    return true;
  };

  // ──────────────────────────────────────────────
  // SEQUÊNCIA 2 PONTOS: criar bolinhas distribuídas
  // ──────────────────────────────────────────────
  const criarBolinhasSequencia = (p1: { xPercent: number; yPercent: number }, p2: { xPercent: number; yPercent: number }, form: typeof seqForm) => {
    const quadra = normalizeLotText(form.quadra);
    const ini = parseInt(form.loteInicial);
    const fin = parseInt(form.loteFinal);
    if (!quadra || isNaN(ini) || isNaN(fin)) { alert("Informe quadra, lote inicial e lote final."); return; }
    const step = ini <= fin ? 1 : -1;
    const lotes: number[] = [];
    for (let l = ini; step > 0 ? l <= fin : l >= fin; l += step) lotes.push(l);
    const total = lotes.length;
    let nextDevLocal = localDev;
    const newIds: string[] = [];
    lotes.forEach((loteNum, idx) => {
      const t = total === 1 ? 0 : idx / (total - 1);
      const xPercent = p1.xPercent + (p2.xPercent - p1.xPercent) * t;
      const yPercent = p1.yPercent + (p2.yPercent - p1.yPercent) * t;
      const loteStr = String(loteNum);
      const lotInfoKey = getLotInfoKey(quadra, loteStr);
      const existingPoint = ((nextDevLocal as any).mapaPontos || []).find((p: any) => getLotInfoKey(p.quadra, p.lote) === lotInfoKey);
      const ensured = ensureLotExistsInEmpreendimento(nextDevLocal, quadra, loteStr);
      const existingInfo = ensured.dev.lotesInfo?.[ensured.lotInfoKey] || {};
      const id = existingPoint?.id || `map-${Date.now()}-${Math.random().toString(16).slice(2)}-${idx}`;
      const pontoBase = {
        id,
        empreendimentoId: localDev.id,
        quadra: ensured.quadraName,
        lote: loteStr,
        xPercent,
        yPercent,
        status: form.status,
        observacao: form.observacao || existingPoint?.observacao || "",
        criadoEm: existingPoint?.criadoEm || new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
        vendaId: existingPoint?.vendaId,
        clienteNome: existingPoint?.clienteNome,
        dataVenda: existingPoint?.dataVenda,
        historico: existingPoint?.historico || [],
        // Linha de sequência para movimentação posterior
        linhaSeqId: `seq-${quadra}-${ini}-${fin}-${Date.now()}`,
        linhaSeqOrdem: idx,
        linhaSeqTotal: total,
      };
      const currentPontos = ((ensured.dev as any).mapaPontos || []) as any[];
      const nextPontos = existingPoint
        ? currentPontos.map((p: any) => p.id === existingPoint.id ? pontoBase : p)
        : [...currentPontos, pontoBase];
      const nextInfo = { ...existingInfo, status: form.status, observacao: form.observacao || existingInfo.observacao || "" };
      nextDevLocal = {
        ...ensured.dev,
        lotesInfo: { ...(ensured.dev.lotesInfo || {}), [ensured.lotInfoKey]: nextInfo },
        mapaPontos: nextPontos,
      } as Empreendimento;
      if (!existingPoint) newIds.push(id);
    });
    const finalDev = recalcularEstatisticasEmpreendimento(nextDevLocal, sales);
    persistDev(finalDev);
    setLastSessionPointIds((prev) => [...prev, ...newIds]);
  };

  // Distribuir bolinhas em curva Bézier quadrática (3 pontos)
  const criarBolinhasCurva = (p1: { xPercent: number; yPercent: number }, pmid: { xPercent: number; yPercent: number }, p2: { xPercent: number; yPercent: number }, form: { quadra: string; loteInicial: string; loteFinal: string; status: MapaLoteStatus; observacao: string }) => {
    const quadra = normalizeLotText(form.quadra);
    const ini = parseInt(form.loteInicial);
    const fin = parseInt(form.loteFinal);
    if (!quadra || isNaN(ini) || isNaN(fin)) { alert("Informe quadra, lote inicial e lote final."); return; }
    const step = ini <= fin ? 1 : -1;
    const lotes: number[] = [];
    for (let l = ini; step > 0 ? l <= fin : l >= fin; l += step) lotes.push(l);
    const total = lotes.length;
    let nextDevLocal = localDev;
    const newIds: string[] = [];
    lotes.forEach((loteNum, idx) => {
      const t = total === 1 ? 0 : idx / (total - 1);
      const inv = 1 - t;
      const xPercent = (inv * inv * p1.xPercent) + (2 * inv * t * pmid.xPercent) + (t * t * p2.xPercent);
      const yPercent = (inv * inv * p1.yPercent) + (2 * inv * t * pmid.yPercent) + (t * t * p2.yPercent);
      const loteStr = String(loteNum);
      const lotInfoKey = getLotInfoKey(quadra, loteStr);
      const existingPoint = ((nextDevLocal as any).mapaPontos || []).find((p: any) => getLotInfoKey(p.quadra, p.lote) === lotInfoKey);
      const ensured = ensureLotExistsInEmpreendimento(nextDevLocal, quadra, loteStr);
      const existingInfo = ensured.dev.lotesInfo?.[ensured.lotInfoKey] || {};
      const id = existingPoint?.id || `map-${Date.now()}-${Math.random().toString(16).slice(2)}-${idx}`;
      const pontoBase = {
        id, empreendimentoId: localDev.id, quadra: ensured.quadraName, lote: loteStr, xPercent, yPercent,
        status: form.status, observacao: form.observacao || existingPoint?.observacao || "",
        criadoEm: existingPoint?.criadoEm || new Date().toISOString(), atualizadoEm: new Date().toISOString(),
        vendaId: existingPoint?.vendaId, clienteNome: existingPoint?.clienteNome, dataVenda: existingPoint?.dataVenda,
        historico: existingPoint?.historico || [],
      };
      const currentPontos = ((ensured.dev as any).mapaPontos || []) as any[];
      const nextPontos = existingPoint
        ? currentPontos.map((p: any) => p.id === existingPoint.id ? pontoBase : p)
        : [...currentPontos, pontoBase];
      const nextInfo = { ...existingInfo, status: form.status, observacao: form.observacao || existingInfo.observacao || "" };
      nextDevLocal = { ...ensured.dev, lotesInfo: { ...(ensured.dev.lotesInfo || {}), [ensured.lotInfoKey]: nextInfo }, mapaPontos: nextPontos } as Empreendimento;
      if (!existingPoint) newIds.push(id);
    });
    const finalDev = recalcularEstatisticasEmpreendimento(nextDevLocal, sales);
    persistDev(finalDev);
    setLastSessionPointIds((prev) => [...prev, ...newIds]);
  };

  // ──────────────────────────────────────────────
  // CLIQUE NO MAPA
  // ──────────────────────────────────────────────
  // ──────────────────────────────────────────────
  // CLIQUE NO MAPA — novo fluxo unificado
  // ──────────────────────────────────────────────
  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditingMap) return;
    if (draggingId) return; // não abre formulário durante arrastar
    const rect = e.currentTarget.getBoundingClientRect();
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;

    // modo edição normal: clique abre formulário "Novo marcador"
    if (mapAction === "editar") {
      if (marcadorFase === "idle") {
        // Abre formulário no ponto clicado
        setMarcadorPonto1({ xPercent, yPercent });
        setMarcadorForm({ quadra: "", lote: "", status: "disponivel", observacao: "" });
        // Posicionar card à direita do clique, centralizado verticalmente na viewport
        const CARD_WIDTH = 288; // w-72 = 288px
        const CARD_HEIGHT = 340; // altura estimada do card
        const OFFSET = 16; // espaço entre bolinha e card
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;
        let cardX = e.clientX + OFFSET;
        let cardY = (viewportH - CARD_HEIGHT) / 2;
        // Se sair pela direita, posicionar à esquerda do clique
        if (cardX + CARD_WIDTH > viewportW - 8) {
          cardX = e.clientX - CARD_WIDTH - OFFSET;
        }
        // Garantir que não saia pela esquerda
        if (cardX < 8) cardX = 8;
        // Garantir que não saia pelo topo/base
        cardY = Math.max(8, Math.min(viewportH - CARD_HEIGHT - 8, cardY));
        setMarcadorPanelPos({ x: cardX, y: cardY });
        setMarcadorFase("formulario");
        return;
      }
      if (marcadorFase === "aguardando_segundo") {
        // Segundo clique: cria bolinhas em linha entre os dois pontos
        const lotes = marcadorForm.lote.split(",").map((s: string) => s.trim()).filter(Boolean);
        const ini = parseInt(lotes[0]);
        const fin = parseInt(lotes[lotes.length - 1]);
        criarBolinhasSequencia(
          marcadorPonto1!,
          { xPercent, yPercent },
          { quadra: marcadorForm.quadra, loteInicial: String(ini), loteFinal: String(fin), status: marcadorForm.status, observacao: marcadorForm.observacao }
        );
        // Não sai da edição — apenas reseta para próximo marcador
        setMarcadorFase("idle");
        setMarcadorPonto1(null);
        setMarcadorPonto2Preview(null);
        return;
      }
      return;
    }
  };

  const handleMapMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditingMap) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
    // Preview linha multi-lote
    if (mapAction === "editar" && marcadorFase === "aguardando_segundo") {
      setMarcadorPonto2Preview({ xPercent, yPercent });
    }
    // Manter compatibilidade interna sequencia
    if (marcadorFase === "aguardando_segundo") {
      setSeqPreview({ xPercent, yPercent });
    }
  };

  // ──────────────────────────────────────────────
  // ARRASTAR BOLINHAS (modo edição)
  // ──────────────────────────────────────────────
  const handleBallMouseDown = (e: React.MouseEvent, ponto: any) => {
    if (!isEditingMap) return;
    e.stopPropagation();
    e.preventDefault();
    setDraggingId(ponto.id);
    setDragStart({ mouseX: e.clientX, mouseY: e.clientY, xPercent: ponto.xPercent, yPercent: ponto.yPercent });
  };

  const handleMapMouseUp = () => {
    if (draggingId) {
      setDraggingId(null);
      setDragStart(null);
    }
  };

  const handleMapMouseMoveForDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingId || !dragStart || !mapContainerRef.current) return;
    const rect = mapContainerRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragStart.mouseX) / rect.width) * 100;
    const dy = ((e.clientY - dragStart.mouseY) / rect.height) * 100;
    const newX = Math.max(0, Math.min(100, dragStart.xPercent + dx));
    const newY = Math.max(0, Math.min(100, dragStart.yPercent + dy));
    const currentPontos = ((localDev as any).mapaPontos || []) as any[];
    const nextPontos = currentPontos.map((p: any) =>
      p.id === draggingId ? { ...p, xPercent: newX, yPercent: newY, atualizadoEm: new Date().toISOString() } : p
    );
    setLocalDev((prev) => ({ ...prev, mapaPontos: nextPontos } as any));
  };

  const commitDrag = () => {
    if (!draggingId) return;
    persistDev(localDev);
    setDraggingId(null);
    setDragStart(null);
  };

  // ──────────────────────────────────────────────
  // ALINHAMENTO DE SEQUÊNCIA EXISTENTE
  // ──────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const alinharSequencia = (_tipo: "reta" | "bezier") => {
    // função mantida para compatibilidade, não exposta na UI
    const quadra = "";
    const ini = 0;
    const fin = 0;
    if (!quadra || isNaN(ini) || isNaN(fin)) { alert("Informe quadra, lote inicial e lote final para alinhar."); return; }
    const min = Math.min(ini, fin); const max = Math.max(ini, fin);
    const pontosSeq = mapaPontos.filter((p) => normalizeLotText(p.quadra) === quadra && Number.isFinite(Number(p.lote)) && Number(p.lote) >= min && Number(p.lote) <= max).sort((a, b) => ini <= fin ? Number(a.lote) - Number(b.lote) : Number(b.lote) - Number(a.lote));
    if (pontosSeq.length < 2) { alert("Marque pelo menos dois pontos dessa sequência."); return; }
    const primeiro = pontosSeq[0]; const ultimo = pontosSeq[pontosSeq.length - 1];
    const meioEx = pontosSeq[Math.floor(pontosSeq.length / 2)];
    const controle = tipo === "bezier" ? { xPercent: meioEx?.xPercent ?? ((primeiro.xPercent + ultimo.xPercent) / 2), yPercent: meioEx?.yPercent ?? (Math.min(primeiro.yPercent, ultimo.yPercent) - 10) } : null;
    const ids = new Set(pontosSeq.map((p) => p.id));
    const posicoes = new Map<string, { xPercent: number; yPercent: number }>();
    pontosSeq.forEach((p, idx) => {
      const t = pontosSeq.length === 1 ? 0 : idx / (pontosSeq.length - 1);
      if (!controle) {
        posicoes.set(p.id, { xPercent: primeiro.xPercent + (ultimo.xPercent - primeiro.xPercent) * t, yPercent: primeiro.yPercent + (ultimo.yPercent - primeiro.yPercent) * t });
      } else {
        const inv = 1 - t;
        posicoes.set(p.id, { xPercent: (inv * inv * primeiro.xPercent) + (2 * inv * t * controle.xPercent) + (t * t * ultimo.xPercent), yPercent: (inv * inv * primeiro.yPercent) + (2 * inv * t * controle.yPercent) + (t * t * ultimo.yPercent) });
      }
    });
    const nextPontos = mapaPontos.map((p) => ids.has(p.id) ? { ...p, ...(posicoes.get(p.id) || {}), atualizadoEm: new Date().toISOString() } : p);
    persistDev({ ...localDev, mapaPontos: nextPontos } as Empreendimento);
  };

  // ──────────────────────────────────────────────
  // AÇÕES NAS BOLINHAS (modo visualização)
  // ──────────────────────────────────────────────
  const marcarPonto = (ponto: any, status: MapaLoteStatus) => {
    const venda = vendaDoLote(ponto.quadra, ponto.lote, ponto.vendaId);
    if (status === "disponivel" && venda) {
      const ok = window.confirm(`Este lote está vinculado à venda de ${venda.clienteNome || ponto.clienteNome || "cliente não informado"}. Ao marcar como disponível, o lote será liberado para nova venda, mas o histórico será mantido. Deseja continuar?`);
      if (!ok) return;
    }
    const historicoExtra = status === "disponivel" && (ponto.vendaId || ponto.clienteNome)
      ? [{ clienteAnterior: ponto.clienteNome || venda?.clienteNome || "Cliente não informado", vendaIdAnterior: ponto.vendaId || venda?.id || "", dataVenda: ponto.dataVenda || venda?.dataVenda || "", dataLiberacao: new Date().toISOString(), status: "liberado/desistiu" }]
      : [];
    const nextPontos = mapaPontos.map((p) => {
      if (p.id !== ponto.id) return p;
      const next: any = { ...p, status, atualizadoEm: new Date().toISOString(), historico: [...(p.historico || []), ...historicoExtra] };
      if (status === "disponivel") { delete next.vendaId; delete next.clienteNome; delete next.dataVenda; }
      return next;
    });
    let nextDev = updateLoteStatusInEmpreendimento(localDev, sales, ponto.quadra, ponto.lote, status, { origem: "mapa", venda, removerVinculoAtivo: status === "disponivel" });
    nextDev = { ...nextDev, mapaPontos: nextPontos } as Empreendimento;
    persistDev(nextDev);
    // Sync com Gerenciador de Lotes
    if (onMarkerSaved) onMarkerSaved(ponto.quadra, ponto.lote, status, ponto.observacao || "");
    setSelectedPoint(null);
  };

  const editarPonto = (ponto: any) => {
    const quadraOriginal = normalizeLotText(ponto.quadra);
    const loteOriginal = normalizeLotText(ponto.lote);
    const quadra = normalizeLotText(window.prompt(`[Editando: Quadra ${ponto.quadra} · Lote ${ponto.lote}]\n\nQuadra`, ponto.quadra) || ponto.quadra);
    // Alertar se a quadra foi alterada
    if (normalizeLotKeyPart(quadra) !== normalizeLotKeyPart(quadraOriginal)) {
      const confirmar = window.confirm(`⚠️ ATENÇÃO: Você está alterando a Quadra de "${quadraOriginal}" para "${quadra}".\n\nIsso moverá o marcador para outra quadra. Deseja continuar?`);
      if (!confirmar) return;
    }
    const lote = normalizeLotText(window.prompt(`[Editando: Quadra ${ponto.quadra} · Lote ${ponto.lote}]\n\nLote`, ponto.lote) || ponto.lote);
    const statusInput = (window.prompt(`[Editando: Quadra ${ponto.quadra} · Lote ${ponto.lote}]\n\nStatus: disponivel, reservado ou indisponivel`, ponto.status) || ponto.status).toLowerCase();
    const status: MapaLoteStatus = statusInput === "indisponivel" ? "indisponivel" : statusInput === "reservado" ? "reservado" : "disponivel";
    const observacao = window.prompt(`[Editando: Quadra ${ponto.quadra} · Lote ${ponto.lote}]\n\nObservação`, ponto.observacao || "") || "";
    const oldNum = Number(loteOriginal); const newNum = Number(lote);
    const mudouNumeroSequencial = quadra === quadraOriginal && lote !== loteOriginal && Number.isFinite(oldNum) && Number.isFinite(newNum);
    const renumerarSequencia = mudouNumeroSequencial
      ? window.confirm(`Você alterou o lote ${loteOriginal} para ${lote}. Deseja continuar a sequência a partir do lote ${lote}?\n\nOK = renumerar este e os próximos pontos.\nCancelar = alterar somente esta bolinha.`)
      : false;
    const pontosAfetados = renumerarSequencia
      ? mapaPontos.filter((p) => normalizeLotText(p.quadra) === quadraOriginal && Number.isFinite(Number(p.lote)) && Number(p.lote) >= oldNum).sort((a, b) => Number(a.lote) - Number(b.lote))
      : [ponto];
    const affectedIds = new Set(pontosAfetados.map((p) => p.id));
    const targetKeys = renumerarSequencia
      ? new Set(pontosAfetados.map((_, idx) => getLotInfoKey(quadra, String(newNum + idx))))
      : new Set([getLotInfoKey(quadra, lote)]);
    const duplicate = mapaPontos.find((p) => !affectedIds.has(p.id) && targetKeys.has(getLotInfoKey(p.quadra, p.lote)));
    if (duplicate) { alert("Já existe uma bolinha com esta quadra/lote."); return; }
    let nextDev: Empreendimento = localDev;
    const atualizacaoPorId: Record<string, { quadra: string; lote: string }> = {};
    if (renumerarSequencia) {
      pontosAfetados.forEach((pAfetado, idx) => {
        const targetLote = String(newNum + idx);
        const ensured = ensureLotExistsInEmpreendimento(nextDev, quadra, targetLote);
        const existingInfo = ensured.dev.lotesInfo?.[ensured.lotInfoKey] || {};
        nextDev = { ...ensured.dev, lotesInfo: { ...(ensured.dev.lotesInfo || {}), [ensured.lotInfoKey]: { ...existingInfo, status: pAfetado.id === ponto.id ? status : (existingInfo.status || pAfetado.status || "disponivel"), observacao: pAfetado.id === ponto.id ? observacao : (existingInfo.observacao || pAfetado.observacao || "") } } } as Empreendimento;
        atualizacaoPorId[pAfetado.id] = { quadra: ensured.quadraName, lote: targetLote };
      });
      const nextPontos = mapaPontos.map((p) => atualizacaoPorId[p.id] ? { ...p, ...atualizacaoPorId[p.id], status: p.id === ponto.id ? status : p.status, observacao: p.id === ponto.id ? observacao : p.observacao, atualizadoEm: new Date().toISOString() } : p);
      persistDev({ ...nextDev, mapaPontos: nextPontos } as Empreendimento);
    } else {
      const ensured = ensureLotExistsInEmpreendimento(localDev, quadra, lote);
      const oldKey = getLotInfoKey(ponto.quadra, ponto.lote);
      const nextPontos = mapaPontos.map((p) => p.id === ponto.id ? { ...p, quadra: ensured.quadraName, lote, status, observacao, atualizadoEm: new Date().toISOString() } : p);
      const nextInfo = { ...(ensured.dev.lotesInfo?.[ensured.lotInfoKey] || {}), status, observacao };
      const lotesInfo = { ...(ensured.dev.lotesInfo || {}), [ensured.lotInfoKey]: nextInfo };
      if (oldKey !== ensured.lotInfoKey && !vendaDoLote(ponto.quadra, ponto.lote, ponto.vendaId)) delete (lotesInfo as any)[oldKey];
      persistDev({ ...ensured.dev, lotesInfo, mapaPontos: nextPontos } as Empreendimento);
    }
    // Sync com Gerenciador de Lotes
    if (onMarkerSaved) onMarkerSaved(quadra, lote, status, observacao);
    setSelectedPoint(null);
  };

  const excluirPonto = (ponto: any) => {
    const venda = vendaDoLote(ponto.quadra, ponto.lote, ponto.vendaId);
    if (venda) {
      const ok = window.confirm("Esta bolinha possui venda vinculada. Excluir a bolinha não apagará a venda/contrato. Deseja continuar?");
      if (!ok) return;
    } else {
      const ok = window.confirm("Excluir esta bolinha do mapa?");
      if (!ok) return;
    }
    const currentPontos = ((localDev as any).mapaPontos || []) as any[];
    persistDev({ ...localDev, mapaPontos: currentPontos.filter((p: any) => p.id !== ponto.id) } as Empreendimento);
    setSelectedPoint(null);
    // Não sai do modo edição
  };

  const desfazerUltimoPonto = () => {
    const lastId = lastSessionPointIds[lastSessionPointIds.length - 1];
    if (!lastId) return;
    const currentPontos = ((localDev as any).mapaPontos || []) as any[];
    persistDev({ ...localDev, mapaPontos: currentPontos.filter((p: any) => p.id !== lastId) } as Empreendimento);
    setLastSessionPointIds((prev) => prev.slice(0, -1));
  };

  // ──────────────────────────────────────────────
  // EDIÇÃO EM MASSA
  // ──────────────────────────────────────────────
  const toggleMassaSel = (id: string) => {
    setMassaSelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selecionarQuadraCompleta = (quadra: string) => {
    const ids = mapaPontos.filter((p) => normalizeLotText(p.quadra) === normalizeLotText(quadra)).map((p) => p.id);
    setMassaSelIds(new Set(ids));
  };

  const selecionarIntervalo = () => {
    const quadra = normalizeLotText(massaFiltroQuadra);
    const ini = parseInt(massaFiltroLoteIni);
    const fin = parseInt(massaFiltroLoteFin);
    if (!quadra || isNaN(ini) || isNaN(fin)) { alert("Informe quadra, lote inicial e lote final."); return; }
    const min = Math.min(ini, fin); const max = Math.max(ini, fin);
    const ids = mapaPontos.filter((p) => normalizeLotText(p.quadra) === quadra && Number(p.lote) >= min && Number(p.lote) <= max).map((p) => p.id);
    setMassaSelIds(new Set(ids));
  };

  const aplicarAcaoMassa = () => {
    if (massaSelIds.size === 0) { alert("Selecione ao menos uma bolinha."); return; }
    if (!massaAcao) { alert("Selecione uma ação."); return; }
    if (massaAcao === "excluir") {
      const ok = window.confirm(`Excluir ${massaSelIds.size} bolinha(s)? Esta ação não pode ser desfeita.`);
      if (!ok) return;
      const currentPontos = ((localDev as any).mapaPontos || []) as any[];
      persistDev({ ...localDev, mapaPontos: currentPontos.filter((p: any) => !massaSelIds.has(p.id)) } as Empreendimento);
      setMassaSelIds(new Set());
      return;
    }
    const status = massaAcao as MapaLoteStatus;
    let nextDevLocal = localDev;
    massaSelIds.forEach((id) => {
      const ponto = ((nextDevLocal as any).mapaPontos || []).find((p: any) => p.id === id);
      if (!ponto) return;
      const currentPontos = ((nextDevLocal as any).mapaPontos || []) as any[];
      const nextPontos = currentPontos.map((p: any) => p.id === id ? { ...p, status, atualizadoEm: new Date().toISOString() } : p);
      nextDevLocal = updateLoteStatusInEmpreendimento(nextDevLocal, sales, ponto.quadra, ponto.lote, status, { origem: "mapa" });
      nextDevLocal = { ...nextDevLocal, mapaPontos: nextPontos } as Empreendimento;
    });
    persistDev(recalcularEstatisticasEmpreendimento(nextDevLocal, sales));
    setMassaSelIds(new Set());
    // Não sai do modo edição
  };

  // ──────────────────────────────────────────────
  // SELEÇÃO COM CTRL
  // ──────────────────────────────────────────────
  const toggleCtrlSel = (id: string) => {
    setCtrlSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ──────────────────────────────────────────────
  // ALINHAR LOTES SELECIONADOS COM CTRL
  // ──────────────────────────────────────────────
  const alinharLotesSelecionados = () => {
    if (ctrlSelectedIds.size < 3) return;
    // Pegar os pontos selecionados, ordenar por número de lote quando possível
    const selecionados = mapaPontos
      .filter((p) => ctrlSelectedIds.has(p.id))
      .slice()
      .sort((a, b) => {
        const na = Number(a.lote); const nb = Number(b.lote);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return String(a.lote).localeCompare(String(b.lote));
      });
    if (selecionados.length < 3) return;
    const primeiro = selecionados[0];
    const ultimo = selecionados[selecionados.length - 1];
    const total = selecionados.length;
    const posicoes = new Map<string, { xPercent: number; yPercent: number }>();
    selecionados.forEach((p, idx) => {
      const t = idx / (total - 1);
      posicoes.set(p.id, {
        xPercent: primeiro.xPercent + (ultimo.xPercent - primeiro.xPercent) * t,
        yPercent: primeiro.yPercent + (ultimo.yPercent - primeiro.yPercent) * t,
      });
    });
    const ids = new Set(selecionados.map((p) => p.id));
    const nextPontos = mapaPontos.map((p) =>
      ids.has(p.id) ? { ...p, ...(posicoes.get(p.id) || {}), atualizadoEm: new Date().toISOString() } : p
    );
    persistDev({ ...localDev, mapaPontos: nextPontos } as Empreendimento);
    // NÃO sai do modo edição
  };

  // ──────────────────────────────────────────────
  // SALVAR / SAIR DO MODO EDIÇÃO
  // ──────────────────────────────────────────────
  const salvarEdicaoMapa = () => {
    persistDev({
      ...localDev,
      mapaMarkerSizePercent: Math.max(40, Math.min(220, Number(markerSizePercent) || 100)),
    } as Empreendimento);
    setDraggingId(null);
    setDragStart(null);
    setSelectedPoint(null);
    setMarcadorFase("idle");
    setMarcadorPonto1(null);
    setMarcadorPonto2Preview(null);
    setMarcadorForm({ quadra: "", lote: "", status: "disponivel", observacao: "" });
    setSeqFase("aguardando_primeiro");
    setSeqPrimeiroClique(null);
    setSeqPreview(null);
    setMassaSelIds(new Set());
    setCtrlSelectedIds(new Set());
    setMarcadorPanelPos(null);
    setLastSessionPointIds([]);
    setMapAction("visualizar");
  };

  const entrarEdicao = () => {
    setMapAction("editar");
    setMarcadorFase("idle");
    if (mapaImagem) setMode("mapa");
  };

  // ──────────────────────────────────────────────
  // AVISO LOTES SEM BOLINHA
  // ──────────────────────────────────────────────
  const lotesConfigSemBolinha = (() => {
    const pontoKeys = new Set(mapaPontos.map((p: any) => getLotInfoKey(p.quadra, p.lote)));
    let count = 0;
    quadras.forEach((q) => {
      const lotes = getLotesDeQuadra(localDev.lotesPorQuadra?.[q]);
      lotes.forEach((l) => { if (!pontoKeys.has(getLotInfoKey(q, l))) count++; });
    });
    return count;
  })();

  // ──────────────────────────────────────────────
  // PREVIEW BOLINHAS PARA SEQUÊNCIA
  // ──────────────────────────────────────────────
  // Preview bolinhas para o novo fluxo de marcador multi-lote
  const renderSeqPreviewBalls = () => {
    // Novo fluxo: marcador multi-lote aguardando segundo ponto
    if (mapAction === "editar" && marcadorFase === "aguardando_segundo" && marcadorPonto1 && marcadorPonto2Preview) {
      const lotes = marcadorForm.lote.split(",").map((s: string) => s.trim()).filter(Boolean);
      const total = lotes.length;
      const ballSize = getBallPixelSize();
      return (
        <>
          <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
            <line
              x1={`${marcadorPonto1.xPercent}%`} y1={`${marcadorPonto1.yPercent}%`}
              x2={`${marcadorPonto2Preview.xPercent}%`} y2={`${marcadorPonto2Preview.yPercent}%`}
              stroke="#3b82f6" strokeWidth="2" strokeDasharray="6,4" opacity="0.6"
            />
          </svg>
          {lotes.map((loteLabel, idx) => {
            const t = total === 1 ? 0 : idx / (total - 1);
            const x = marcadorPonto1.xPercent + (marcadorPonto2Preview.xPercent - marcadorPonto1.xPercent) * t;
            const y = marcadorPonto1.yPercent + (marcadorPonto2Preview.yPercent - marcadorPonto1.yPercent) * t;
            return (
              <div key={loteLabel} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-400 opacity-60 flex items-center justify-center font-black text-white pointer-events-none"
                style={{ left: `${x}%`, top: `${y}%`, width: `${ballSize.size}px`, height: `${ballSize.size}px`, fontSize: `${ballSize.font}px` }}>
                {loteLabel}
              </div>
            );
          })}
        </>
      );
    }
    return null;
  };

  // ──────────────────────────────────────────────
  // RENDERIZAR QUADRADINHOS
  // ──────────────────────────────────────────────
  const renderQuadradinhos = () => (
    <div className="space-y-12">
      {quadras.length > 0 ? quadras.map((q) => {
        const configuredLots = getLotesDeQuadra(localDev.lotesPorQuadra?.[q]);
        const lotesInfoKeys = Object.keys(localDev.lotesInfo || {}).filter((key) => key.startsWith(q.toUpperCase() + "-")).map((key) => key.split("-")[1]);
        const displayLots = configuredLots.length > 0 ? configuredLots : lotesInfoKeys.length > 0 ? lotesInfoKeys.sort((a, b) => Number(a) - Number(b)) : [];
        return (
          <div key={q} className="space-y-4">
            <div className="flex items-center gap-3"><h4 className="px-4 py-1.5 bg-slate-900 text-white rounded-lg font-display font-bold text-sm">Quadra {q}</h4><div className="h-px flex-1 bg-slate-100" /></div>
            {displayLots.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-50 text-sm text-slate-400 font-medium">Nenhum lote cadastrado nesta quadra.</div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {displayLots.map((l) => {
                  const soldData = vendaDoLote(q, l);
                  const lotInfo = localDev.lotesInfo?.[getLotInfoKey(q, l)];
                  const reserved = !soldData && lotInfo?.status === "reservado";
                  const unavailable = !!soldData || lotInfo?.status === "indisponivel" || lotInfo?.status === "vendido";
                  return (
                    <div key={l} onClick={() => { if (soldData) setSelectedLotSale(soldData); }} className={`group relative p-4 rounded-2xl border aspect-square flex flex-col items-center justify-center transition-all ${unavailable ? "bg-red-50 border-red-100 text-red-600 cursor-pointer hover:bg-red-100" : reserved ? "bg-yellow-50 border-yellow-100 text-yellow-700" : "bg-blue-50 border-blue-100 hover:border-blue-500 hover:shadow-xl text-blue-600"}`}>
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-1">Lote</span>
                      <span className="text-lg font-display font-bold leading-none">{l}</span>
                      <div className={`mt-2 p-1 rounded-full text-[8px] font-bold uppercase tracking-widest ${unavailable ? "bg-red-100" : reserved ? "bg-yellow-100" : "bg-blue-100"}`}>{unavailable ? "Indisp." : reserved ? "Reserva" : "Disp."}</div>
                      {!unavailable && !reserved && <button onClick={(ev) => { ev.stopPropagation(); onStartSale({ empreendimentoId: localDev.id, quadra: q, numeroLote: l, rua: lotInfo?.rua }); }} className="absolute inset-0 flex items-center justify-center bg-blue-600/90 text-white opacity-0 group-hover:opacity-100 rounded-2xl transition-all font-bold text-[10px] uppercase tracking-widest">Vender</button>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      }) : <div className="text-center py-20 space-y-4"><div className="p-4 bg-slate-50 rounded-full w-fit mx-auto text-slate-300"><Info size={32} /></div><p className="text-slate-400 font-medium">Nenhuma quadra cadastrada para este empreendimento.</p><p className="text-xs text-slate-300 max-w-xs mx-auto">Cadastre lotes manualmente ou carregue uma imagem do mapa.</p></div>}
    </div>
  );

  // ──────────────────────────────────────────────
  // RENDERIZAR MAPA
  // ──────────────────────────────────────────────
  const renderMapa = () => {
    const ballSize = getBallPixelSize();
    return (
        <div className="space-y-4">
        {/* Aviso lotes sem bolinha */}
        {isEditingMap && lotesConfigSemBolinha > 0 && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-700 font-medium">
            Existem lotes cadastrados que ainda não foram adicionados ao mapa interativo.
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          {/* CANVAS DO MAPA */}
          <div className="bg-slate-100 rounded-3xl p-2 overflow-auto border border-slate-200">
            <div
              ref={mapContainerRef}
              onClick={handleMapClick}
              onMouseMove={(e) => {
                handleMapMouseMoveForDrag(e);
                handleMapMouseMove(e);
                // Arrastar painel "Novo marcador" — usando ref + RAF para evitar re-render e garantir fluidez
                if (isDraggingPanelRef.current && dragPanelRef.current && marcadorPanelRef.current) {
                  const mouseX = e.clientX;
                  const mouseY = e.clientY;
                  if (rafPanelRef.current) cancelAnimationFrame(rafPanelRef.current);
                  rafPanelRef.current = requestAnimationFrame(() => {
                    if (!dragPanelRef.current || !marcadorPanelRef.current) return;
                    const newX = dragPanelRef.current.panelX + (mouseX - dragPanelRef.current.mouseX);
                    const newY = dragPanelRef.current.panelY + (mouseY - dragPanelRef.current.mouseY);
                    marcadorPanelRef.current.style.left = `${newX}px`;
                    marcadorPanelRef.current.style.top = `${newY}px`;
                  });
                }
              }}
              onMouseUp={() => {
                handleMapMouseUp();
                commitDrag();
                if (isDraggingPanelRef.current) {
                  isDraggingPanelRef.current = false;
                  dragPanelRef.current = null;
                  if (rafPanelRef.current) { cancelAnimationFrame(rafPanelRef.current); rafPanelRef.current = null; }
                  setDraggingPanel(false);
                }
              }}
              onMouseLeave={() => {
                if (draggingId) commitDrag();
                if (isDraggingPanelRef.current) {
                  isDraggingPanelRef.current = false;
                  dragPanelRef.current = null;
                  if (rafPanelRef.current) { cancelAnimationFrame(rafPanelRef.current); rafPanelRef.current = null; }
                  setDraggingPanel(false);
                }
              }}
              className={`relative mx-auto bg-white rounded-2xl overflow-hidden min-w-[320px] select-none ${isEditingMap && mapAction === "editar" && !draggingId ? "cursor-crosshair" : isEditingMap && draggingId ? "cursor-grabbing" : "cursor-default"}`}
              style={{ maxWidth: "1000px" }}
            >
              <img src={mapaImagem} alt="Mapa do empreendimento" className="block w-full h-auto" draggable={false} />

              {/* Preview bolinhas + linha para multi-lote */}
              {renderSeqPreviewBalls()}

              {/* BOLINHAS */}
              {mapaPontos.map((ponto) => {
                const venda = vendaDoLote(ponto.quadra, ponto.lote, ponto.vendaId);
                const statusClass = getMapaStatusColorClass(ponto.status, !!venda);
                const isMassaSel = massaSelIds.has(ponto.id);
                const isCtrlSel = ctrlSelectedIds.has(ponto.id);
                const isDragging = draggingId === ponto.id;
                return (
                  <button
                    key={ponto.id}
                    onMouseDown={(e) => isEditingMap ? handleBallMouseDown(e, ponto) : undefined}
                    onClick={(ev) => {
                      if (draggingId) return;
                      ev.stopPropagation();
                      if (isEditingMap && mapAction === "massa") { toggleMassaSel(ponto.id); return; }
                      // CTRL seleção múltipla no modo edição
                      if (isEditingMap && mapAction === "editar" && ev.ctrlKey) {
                        toggleCtrlSel(ponto.id);
                        return;
                      }
                      setSelectedPoint({ ...ponto, venda });
                    }}
                    title={`Q${ponto.quadra} L${ponto.lote}`}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 font-black flex items-center justify-center transition-shadow ${statusClass} ${isMassaSel ? "ring-4 ring-offset-1 ring-slate-900 border-white shadow-xl" : isCtrlSel ? "ring-4 ring-offset-1 ring-emerald-400 border-white shadow-xl scale-125" : "border-white shadow-lg"} ${isEditingMap ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${isDragging ? "opacity-80 z-50" : "z-10"}`}
                    style={{ left: `${ponto.xPercent}%`, top: `${ponto.yPercent}%`, width: `${ballSize.size}px`, height: `${ballSize.size}px`, fontSize: `${ballSize.font}px` }}
                  >
                    {isEditingMap ? ponto.lote : null}
                  </button>
                );
              })}

              {/* Marcador do primeiro ponto (multi-lote aguardando 2º clique) */}
              {isEditingMap && mapAction === "editar" && marcadorFase === "aguardando_segundo" && marcadorPonto1 && (
                <div className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-blue-700 border-2 border-white rounded-full pointer-events-none z-20 flex items-center justify-center"
                  style={{ left: `${marcadorPonto1.xPercent}%`, top: `${marcadorPonto1.yPercent}%` }}>
                  <div className="w-1.5 h-1.5 bg-white rounded-full" />
                </div>
              )}
            </div>
          </div>

          {/* PAINEL LATERAL */}
          <div className="space-y-3">
            {/* MODO VISUALIZAÇÃO */}
            {!isEditingMap && (
              <div className="card-premium p-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Modo visualização</p>
                <p className="text-xs text-slate-500">Clique em uma bolinha para ver detalhes, iniciar venda ou alterar status.</p>
                {!canEditMap && <p className="text-[11px] text-slate-400 font-medium">A edição do mapa é restrita ao admin ou usuários autorizados.</p>}
              </div>
            )}

            {/* MODO EDIÇÃO — TOOLBAR SIMPLIFICADA */}
            {isEditingMap && (
              <div className="card-premium p-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Editar mapa</p>

                {/* Instrução contextual */}
                {mapAction === "editar" && marcadorFase === "idle" && (
                  <p className="text-xs text-slate-500 bg-blue-50 p-2 rounded-xl">
                    Clique em qualquer ponto do mapa para adicionar um marcador.
                  </p>
                )}
                {mapAction === "editar" && marcadorFase === "formulario" && (
                  <p className="text-xs text-blue-600 bg-blue-50 p-2 rounded-xl font-medium">
                    Preencha os dados e confirme. Se o lote tiver múltiplos (ex: 1,2,3), clique no 2º ponto do mapa depois.
                  </p>
                )}
                {mapAction === "editar" && marcadorFase === "aguardando_segundo" && (
                  <p className="text-xs text-emerald-700 bg-emerald-50 p-2 rounded-xl font-medium">
                    Clique no mapa para definir o ponto final da linha.
                  </p>
                )}

                {/* Botão modo edição em massa */}
          <button
            onClick={() => onNovoContrato ? onNovoContrato() : setShowNovoContrato(true)}
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
          {/* Filtro unificado */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`h-9 px-3 rounded-xl text-xs font-bold border transition-all ${statusFilter ? "bg-primary-main text-white border-primary-main" : "bg-slate-50 text-slate-600 border-slate-200"}`}
          >
            <option value="">Todos</option>
            <option value="avista">À Vista</option>
            <option value="parcelado">Parcelado</option>
            <option value="comcontrato">Com Contrato</option>
            <option value="semcontrato">Sem Contrato</option>
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
            <option value="data_desc">Data (recente primeiro)</option>
            <option value="data_asc">Data (antigo primeiro)</option>
            <option value="valor_desc">Valor (maior primeiro)</option>
            <option value="valor_asc">Valor (menor primeiro)</option>
            <option value="nome_asc">Cliente A–Z</option>
            <option value="emp_asc">Empreendimento A–Z</option>
            <option value="status_asc">Status A–Z</option>
            <option value="corretor_asc">Corretor A–Z</option>
          </select>

          {/* Limpar filtros */}
          {activeFilterCount > 0 && (
                  <button
                    onClick={() => { setShowReciboModal(false); if (selectedVenda) handleEditarContrato(selectedVenda); }}
                    disabled={reciboDownloading !== null}
                    className="btn-secondary flex-1 h-11 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    <Pencil size={17} />
                    Editar
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 sm:p-8 bg-slate-100/50">
                <div ref={reciboRef} style={{width:'1080px',height:'1350px',flexShrink:0,margin:'0 auto',position:'relative'}} className="bg-white p-[80px] text-black font-sans border border-slate-200 flex flex-col">
                  <div className="flex justify-between items-start border-b-4 border-slate-900 pb-8 mb-10">
                    <div>
                      <h1 className="text-4xl font-black italic tracking-tighter text-slate-900">RECIBO</h1>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Instrumento de Quitação de Valores</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Valor do Recibo</p>
                      <p className="text-3xl font-bold bg-slate-900 text-white px-4 py-1 rounded-xl">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                          selectedVenda.quantidadeParcelas === 0 ? selectedVenda.valorLote : selectedVenda.valorEntrada
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-8 text-lg leading-loose flex-1">
                    <p className="text-justify">
                      Recebemos de{" "}
                      <span className="font-bold uppercase underline underline-offset-4">{selectedVenda.clienteNome}</span>
                      , inscrito(a) no CPF nº{" "}
                      <span className="font-bold">{client?.cpf || "___.___.___-__"}</span>
                      , a importância supra de{" "}
                      <span className="font-bold italic">
                        ({new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                          selectedVenda.quantidadeParcelas === 0 ? selectedVenda.valorLote : selectedVenda.valorEntrada
                        )})
                      </span>
                      , referente ao{" "}
                      <span className="font-bold">
                        {selectedVenda.quantidadeParcelas === 0
                          ? "PAGAMENTO INTEGRAL À VISTA"
                          : "SINAL E PRINCÍPIO DE PAGAMENTO (ENTRADA)"}
                      </span>{" "}
                      para aquisição do imóvel:
                    </p>
                    <div className="bg-slate-50 p-8 rounded-[32px] border-2 border-dashed border-slate-200 grid grid-cols-2 gap-6">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Empreendimento</p>
                        <p className="font-bold text-slate-800">{selectedVenda.empreendimentoNome}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Localização</p>
                        <p className="font-bold text-slate-800">
                          {(() => {
                            const reciboDev2 = developments.find((d) => d.id === selectedVenda.empreendimentoId);
                            const snap2 = selectedVenda.contratoSnapshot;
                            const comunidade2 = snap2?.empreendimento?.comunidade || reciboDev2?.comunidade || '';
                            const cidade2 = snap2?.empreendimento?.cidade || reciboDev2?.cidade || 'Santarém';
                            const estado2 = snap2?.empreendimento?.estado || reciboDev2?.estado || 'PA';
                            return comunidade2 ? `${comunidade2} - ${cidade2}/${estado2}` : `${cidade2}/${estado2}`;
                          })()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Quadra/Lote</p>
                        <p className="font-bold text-slate-800">Q:{selectedVenda.quadra} / L:{selectedVenda.numeroLote}</p>
                      </div>
                      {selectedVenda.rua && (
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Logradouro</p>
                          <p className="font-bold text-slate-800">{selectedVenda.rua}</p>
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-medium italic text-slate-500">
                      Pelo que damos plena, geral e irrevogável quitação do referido valor, para que nada mais se reclame.
                    </p>
                  </div>
                  <div className="pt-10 border-t border-slate-100 flex justify-between items-end">
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        Santarém/PA,{" "}
                        {new Date(selectedVenda.dataVenda).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                      </p>
                    </div>
                    <div className="w-64 text-center">
                      <div className="h-px bg-slate-900 mb-2" />
                      <p className="text-[10px] font-bold uppercase text-slate-400">
                        {userProfile?.creci ? "Corretor de Imóveis" : "Angariador/Captador"}
                      </p>
                      {userProfile?.nome ? (
                        <>
                          <p className="font-bold text-slate-900">{userProfile.nome}</p>
                          {userProfile.creci && (
                            <p className="text-[10px] font-bold text-slate-400 mt-0.5">CRECI: {userProfile.creci}</p>
                          )}
                        </>
                      ) : (
                        <p className="font-bold text-slate-900">___________________________</p>
                      )}
                    </div>
                  </div>
                  {/* Carimbo PAGO — capturado junto com o recibo no canvas */}
                  {comCarimbo && (
                    <div style={{
                      position: 'absolute',
                      bottom: '120px',
                      right: '80px',
                      transform: 'rotate(-20deg)',
                      border: '8px solid #16a34a',
                      borderRadius: '16px',
                      padding: '12px 36px',
                      color: '#16a34a',
                      fontSize: '72px',
                      fontWeight: 900,
                      fontFamily: 'serif',
                      opacity: 0.75,
                      letterSpacing: '6px',
                      pointerEvents: 'none',
                      userSelect: 'none',
                    }}>PAGO</div>
                  )}
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
                        {gerarStep === 0 ? "Informações do Lote" : gerarStep === 1 ? "Proprietário / Vendedor" : "Prévia Final do Contrato"}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setShowGerarModal(false)} className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                    <X size={20} />
                  </button>
                </div>
                {/* Steps indicator */}
                <div className="flex items-center gap-2">
                  {["Inf. do Lote", "Prop./Vendedor", "Prévia Final"].map((label, i) => (
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
                    {/* Info do lote (somente leitura) */}
                    <div className="bg-primary-main/5 border border-primary-main/20 rounded-2xl p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary-main mb-3">Dados da Venda</p>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Empreendimento</p>
                          <p className="font-bold text-slate-800 truncate">{gerarEmp.nome || selectedVenda.empreendimentoNome || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Quadra</p>
                          <p className="font-bold text-slate-800">{selectedVenda.quadra || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Lote</p>
                          <p className="font-bold text-slate-800">{selectedVenda.numeroLote || "—"}</p>
                        </div>
                      </div>
                    </div>
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
                          <input className="input-field" value={gerarEmp.nome} onChange={(e) => setGerarEmp({ ...gerarEmp, nome: textoMaiusculo(e.target.value) })} />
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
                        <>
                          <select className="input-field font-semibold" value={gerarProprietarioId} onChange={(e) => handleSelectProprietario(e.target.value)}>
                            <option value="">Selecionar proprietário...</option>
                            {proprietarios.map((p) => (
                              <option key={p.id} value={p.id}>{p.nome} — CPF {p.cpf}</option>
                            ))}
                          </select>
                          {gerarProprietarioId && (
                            <p className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl mt-1.5 flex items-center gap-1.5">
                              <Check size={11} /> Dados preenchidos automaticamente do cadastro
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-amber-600 font-bold bg-amber-50 px-3 py-2 rounded-xl">Nenhum proprietário cadastrado. Cadastre na aba "Proprietários" primeiro.</p>
                      )}
                    </div>
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Dados do Vendedor</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                          <label className="label">Nome Completo *</label>
                          <input className="input-field" placeholder="Nome do vendedor" value={gerarVendedor.nome} onChange={(e) => setGerarVendedor({ ...gerarVendedor, nome: textoMaiusculo(e.target.value) })} />
                        </div>
                        <div>
                          <label className="label">Gênero do Vendedor *</label>
                          <select className="input-field" value={gerarVendedor.genero || ""} onChange={(e) => {
                            const genero = e.target.value as "" | "M" | "F";
                            setGerarVendedor({ ...gerarVendedor, genero, estadoCivil: genderizeEstadoCivil(gerarVendedor.estadoCivil || "Solteiro", genero || "M") });
                          }}>
                            <option value="">Selecionar...</option>
                            <option value="M">Masculino</option>
                            <option value="F">Feminino</option>
                          </select>
                        </div>
                        <div>
                          <label className="label">Nacionalidade</label>
                          <input className="input-field" value={gerarVendedor.nacionalidade} onChange={(e) => setGerarVendedor({ ...gerarVendedor, nacionalidade: e.target.value })} />
                        </div>
                        <div>
                          <label className="label">Estado Civil</label>
                          <select className="input-field" value={gerarVendedor.estadoCivil} onChange={(e) => setGerarVendedor({ ...gerarVendedor, estadoCivil: e.target.value })}>
                            {(gerarVendedor.genero === "F" ? ["Solteira", "Casada", "Divorciada", "Viúva", "União Estável"] : ["Solteiro", "Casado", "Divorciado", "Viúvo", "União Estável"]).map((o) => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="label">RG</label>
                          <input
                            className={`input-field ${vendedorRgError ? "border-red-400 focus:ring-red-400" : gerarVendedor.rg.replace(/\s+/g, "").length >= 5 ? "border-green-400 focus:ring-green-400" : ""}`}
                            placeholder="0000000"
                            value={gerarVendedor.rg}
                            onChange={(e) => {
                              const v = maskRG(e.target.value);
                              setGerarVendedor({ ...gerarVendedor, rg: v });
                              const clean = v.replace(/\s+/g, "").trim();
                              setVendedorRgError(clean.length > 0 && !validarRG(v) ? "RG inválido (mínimo 5 caracteres)" : null);
                            }}
                          />
                          {vendedorRgError && <p className="mt-1 text-[11px] text-red-500 font-semibold">{vendedorRgError}</p>}
                        </div>
                        <div>
                          <label className="label">CPF</label>
                          <input
                            className={`input-field font-mono ${vendedorCpfError ? "border-red-400 focus:ring-red-400" : cpfStatus(gerarVendedor.cpf) === "valid" ? "border-green-400 focus:ring-green-400" : ""}`}
                            placeholder="000.000.000-00"
                            value={gerarVendedor.cpf}
                            onChange={(e) => {
                              const v = maskCPF(e.target.value);
                              setGerarVendedor({ ...gerarVendedor, cpf: v });
                              const raw = v.replace(/\D/g, "");
                              setVendedorCpfError(raw.length > 0 && cpfStatus(v) === "invalid" ? "CPF inválido" : null);
                            }}
                          />
                          {vendedorCpfError && <p className="mt-1 text-[11px] text-red-500 font-semibold">{vendedorCpfError}</p>}
                        </div>
                        <div>
                          <label className="label">CEP {fetchingCep && <span className="text-[9px] text-primary-main font-bold ml-1">buscando...</span>}</label>
                          <input className="input-field" placeholder="00000-000" value={gerarVendedor.cep} onChange={(e) => { const val = maskCEP(e.target.value); setGerarVendedor({ ...gerarVendedor, cep: val }); if (val.replace(/\D/g, "").length === 8) fetchCepGerar(val); }} />
                          <BuscarCEPPorRua
                            estadoPadrao={gerarVendedor.estado || "PA"}
                            cidadePadrao={gerarVendedor.cidade || ""}
                            onSelect={(r) => setGerarVendedor((prev) => ({
                              ...prev,
                              cep: maskCEP(r.cep),
                              endereco: r.logradouro || prev.endereco,
                              bairro: r.bairro || prev.bairro,
                              cidade: r.localidade || prev.cidade,
                              estado: r.uf || prev.estado,
                            }))}
                          />
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
                          {selectedVenda.quantidadeParcelas === 0
                            ? <div><span className="text-slate-500 text-xs">Modalidade</span><p className="font-bold text-success-main">À Vista</p></div>
                            : <>
                              <div><span className="text-slate-500 text-xs">Entrada</span><p className="font-bold text-slate-800">{fmtCurrency(selectedVenda.valorEntrada)}</p></div>
                              <div><span className="text-slate-500 text-xs">Parcelas</span><p className="text-slate-700">{selectedVenda.quantidadeParcelas}x de {fmtCurrency(selectedVenda.valorParcela)}</p></div>
                              <div><span className="text-slate-500 text-xs">Vencimento</span><p className="text-slate-700">{selectedVenda.dataVencimento}</p></div>
                            </>
                          }
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
              {/* Footer: steps 0 e 1 → Voltar + Avançar; step 2 → Voltar + Editar + OK (PDF/DOCX só na view final) */}
              <div className="p-4 sm:p-6 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => gerarStep === 0 ? setShowGerarModal(false) : setGerarStep(gerarStep - 1)}
                  className="btn-secondary h-11 sm:px-6 w-full sm:w-auto flex items-center justify-center gap-2"
                >
                  <ChevronLeft size={17} /> {gerarStep === 0 ? "Cancelar" : "Voltar"}
                </button>

                {gerarStep < 2 ? (
                  <button
                    onClick={() => {
                      // No step 1 (vendedor): validar CPF antes de avançar
                      if (gerarStep === 1) {
                        if (!gerarVendedor.nome.trim()) { alert("Informe o nome do vendedor."); return; }
                        if (!generoContratoValido(gerarVendedor)) { alert("Selecione o gênero do vendedor para gerar o contrato corretamente."); return; }
                        const cpfRaw = gerarVendedor.cpf.replace(/\D/g, "");
                        if (cpfRaw.length > 0 && cpfStatus(gerarVendedor.cpf) === "invalid") {
                          setVendedorCpfError("CPF inválido. Verifique e tente novamente.");
                          return;
                        }
                        const rgClean = gerarVendedor.rg.replace(/\s+/g, "").trim();
                        if (rgClean.length > 0 && !validarRG(gerarVendedor.rg)) {
                          setVendedorRgError("RG inválido (mínimo 5 caracteres).");
                          return;
                        }
                        if (vendedorCpfError || vendedorRgError) return;
                      }
                      setGerarStep(gerarStep + 1);
                    }}
                    className="btn-primary h-11 flex-1 flex items-center justify-center gap-2 font-semibold"
                  >
                    Avançar <ChevronRight size={17} />
                  </button>
                ) : (
                  /* Step 2 (Preview): apenas Editar e OK — PDF/DOCX aparecem só na visualização final */
                  <div className="flex gap-2 flex-1">
                    <button
                      onClick={() => setGerarStep(1)}
                      className="btn-secondary h-11 px-4 flex items-center justify-center gap-2 text-sm font-semibold"
                    >
                      <Pencil size={17} /> Editar
                    </button>
                    <button
                      onClick={() => {
                        // Salvar snapshot, fechar wizard e abrir visualização final
                        const clienteContrato = selectedVenda ? clients.find((c) => c.id === selectedVenda.clienteId) : null;
                        if (!clienteContrato || !validarGenerosAntesDeGerar(gerarVendedor, clienteContrato)) return;
                        if (selectedVenda) {
                          const snapshot = {
                            vendedor: gerarVendedor,
                            empreendimento: gerarEmp,
                            extra: gerarExtra,
                            tipoContrato: tipoContrato,
                            geradoEm: new Date().toISOString(),
                          };
                          onUpdateVenda({ ...selectedVenda, contratoGerado: true, contratoSnapshot: snapshot });
                          // PROBLEMA 6: Salvar vendedor como Proprietário (upsert por CPF)
                          if (onSaveProprietario && gerarVendedor.nome.trim()) {
                            const cpfLimpo = gerarVendedor.cpf.replace(/\D/g, "");
                            const existenteProp = cpfLimpo
                              ? proprietarios.find((p) => p.cpf.replace(/\D/g, "") === cpfLimpo)
                              : null;
                            onSaveProprietario(normalizarNomeObrigatorio({
                              id: existenteProp?.id || `prop-${Date.now()}`,
                              nome: gerarVendedor.nome,
                              genero: gerarVendedor.genero || "M",
                              nacionalidade: gerarVendedor.nacionalidade || "Brasileiro",
                              estadoCivil: genderizeEstadoCivil(gerarVendedor.estadoCivil || "Solteiro", gerarVendedor.genero || "M"),
                              rg: gerarVendedor.rg || "",
                              cpf: gerarVendedor.cpf || "",
                              endereco: gerarVendedor.endereco || "",
                              numero: gerarVendedor.numero || "",
                              bairro: gerarVendedor.bairro || "",
                              cidade: gerarVendedor.cidade || "",
                              estado: (gerarVendedor.estado || "").toUpperCase(),
                              cep: gerarVendedor.cep || "",
                            } as Proprietario));
                          }
                        }
                        // Atualiza selectedVenda localmente para que a prévia final mostre os dados corretos
                        if (selectedVenda) {
                          setSelectedVenda({ ...selectedVenda, contratoGerado: true, contratoSnapshot: {
                            vendedor: gerarVendedor,
                            empreendimento: gerarEmp,
                            extra: gerarExtra,
                            tipoContrato: tipoContrato,
                            geradoEm: new Date().toISOString(),
                          }});
                        }
                        setShowGerarModal(false);
                        // selectedVenda continua setado → prévia final abre automaticamente
                      }}
                      className="btn-primary h-11 flex-1 flex items-center justify-center gap-2 text-sm font-semibold"
                    >
                      <ChevronRight size={17} /> Finalizar Contrato
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {DeleteModal}

      {/* Modal: Mesclar / Duplicar / Cancelar */}
      <AnimatePresence>
        {/* Dialog: Escolha antes de editar contrato */}
        {preEditVenda && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-sm rounded-[28px] shadow-2xl p-8 flex flex-col gap-6"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-100 rounded-xl">
                  <Pencil size={20} className="text-amber-600" />
                </div>
                <div>
                  <h4 className="font-display font-bold text-slate-800">Editar Contrato</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    O lote pode estar marcado como vendido. Como deseja prosseguir?
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    // Editar dados e gerar contrato: abre o wizard completo pré-preenchido
                    const v = preEditVenda;
                    setPreEditVenda(null);
                    const dev = developments.find((d) => d.id === v.empreendimentoId);
                    const snap = v.contratoSnapshot;
                    setGerarProprietarioId("");
                    setGerarVendedor(snap?.vendedor ?? emptyGerarVendedor);
                    setGerarEmp(snap?.empreendimento ?? {
                      nome: dev?.nome || "",
                      comunidade: dev?.comunidade || "",
                      cidade: dev?.cidade || "",
                      estado: dev?.estado || "",
                    });
                    setGerarExtra(snap?.extra ?? {
                      rua: v.rua || "",
                      comunidade: dev?.comunidade || "",
                      formaPagamento: v.formaPagamento || "Dinheiro",
                      medidaFrente: v.medidaFrente || "",
                      medidaLateralDir: v.medidaLateralDir || "",
                      medidaLateralEsq: v.medidaLateralEsq || "",
                      medidaFundos: v.medidaFundos || "",
                      areaTotal: v.areaTotal || "",
                    });
                    setTipoContrato(snap?.tipoContrato ?? (v.quantidadeParcelas === 0 ? "avista" : "parcelado"));
                    setSelectedVenda(v);
                    setGerarStep(0);
                    setTimeout(() => setShowGerarModal(true), 60);
                  }}
                  className="btn-primary h-12 font-semibold flex items-center justify-center gap-2"
                >
                  <FileDown size={17} /> Editar dados e gerar contrato
                </button>
                <button
                  onClick={() => {
                    // Mesclar: abre Nova Venda com editingEntry = venda original (edita dados da venda)
                    const v = preEditVenda;
                    setPreEditVenda(null);
                    onEditVenda?.(v);
                  }}
                  className="btn-secondary h-12 font-semibold flex items-center justify-center gap-2"
                >
                  <Save size={17} /> Editar dados da venda (Nova Venda)
                </button>
                <button
                  onClick={() => {
                    // Duplicar: cria cópia da venda e abre Nova Venda para editar a cópia
                    const v = preEditVenda;
                    setPreEditVenda(null);
                    const novoId = `venda-${Date.now()}`;
                    const novoContrato = `CONT-${Date.now()}`;
                    const copia: Venda = { ...v, id: novoId, numeroContrato: novoContrato };
                    onSaveVenda(copia, clients.find(c => c.id === copia.clienteId) || { id: copia.clienteId, nome: copia.clienteNome, nacionalidade: "Brasileira", genero: "M", rg: "", cpf: "", estadoCivil: "Solteiro(a)", profissao: "", nascimento: "", cep: "", endereco: "", numero: "", bairro: "", cidade: "", estado: "", telefone1: "", dataCadastro: new Date().toISOString() });
                    onEditVenda?.(copia);
                  }}
                  className="btn-secondary h-12 font-semibold flex items-center justify-center gap-2"
                >
                  <Copy size={17} /> Duplicar como nova venda
                </button>
                <button
                  onClick={() => setPreEditVenda(null)}
                  className="text-sm text-slate-400 hover:text-slate-600 font-semibold py-2 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
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
                  <h4 className="font-display font-bold text-slate-800">Salvar alterações</h4>
                  <p className="text-xs text-slate-500 mt-0.5">O que deseja fazer com este contrato?</p>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    onUpdateVenda(pendingEditVenda);
                    setEditingVenda(null);
                    setEditandoVendaOriginal(null);
                    setShowDuplicarModal(false);
                    setPendingEditVenda(null);
                    setSelectedVenda(pendingEditVenda);
                  }}
                  className="btn-primary h-12 font-semibold flex items-center justify-center gap-2"
                >
                  <Save size={17} /> Mesclar (substituir original)
                </button>
                <button
                  onClick={() => {
                    const novoId = `venda-${Date.now()}`;
                    const novoContrato = `CONT-${Date.now()}`;
                    const nova = { ...pendingEditVenda, id: novoId, numeroContrato: novoContrato };
                    onUpdateVenda(nova);
                    setEditingVenda(null);
                    setEditandoVendaOriginal(null);
                    setShowDuplicarModal(false);
                    setPendingEditVenda(null);
                    setSelectedVenda(nova);
                  }}
                  className="btn-secondary h-12 font-semibold flex items-center justify-center gap-2"
                >
                  <Copy size={17} /> Duplicar como novo contrato
                </button>
                <button
                  onClick={() => { setShowDuplicarModal(false); setPendingEditVenda(null); setEditandoVendaOriginal(null); }}
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
    const updated: Cliente = normalizarNomeObrigatorio({ ...editingCliente, ...editForm, estado: (editForm.estado || "").toUpperCase() } as Cliente);
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
                    {field === "cep" && (
                      <BuscarCEPPorRua
                        estadoPadrao={editForm.estado || "PA"}
                        cidadePadrao={editForm.cidade || ""}
                        onSelect={(r) => setEditForm((prev) => ({
                          ...prev,
                          cep: maskCEP(r.cep),
                          endereco: r.logradouro || prev.endereco,
                          bairro: r.bairro || prev.bairro,
                          cidade: r.localidade || prev.cidade,
                          estado: r.uf || prev.estado,
                        }))}
                      />
                    )}
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
                  <label className="label">Gênero</label>
                  <select
                    className="input-field"
                    value={editForm.genero || "M"}
                    onChange={(e) => {
                      const genero = e.target.value as "M" | "F" | "O";
                      setEditForm({
                        ...editForm,
                        genero,
                        estadoCivil: genderizeEstadoCivil(editForm.estadoCivil || "Solteiro", genero),
                      });
                    }}
                  >
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                    <option value="O">Outro</option>
                  </select>
                </div>
                <div>
                  <label className="label">Estado Civil</label>
                  <select
                    className="input-field"
                    value={genderizeEstadoCivil(editForm.estadoCivil || "Solteiro", editForm.genero || "M")}
                    onChange={(e) => setEditForm({ ...editForm, estadoCivil: genderizeEstadoCivil(e.target.value, editForm.genero || "M") })}
                  >
                    {((editForm.genero || "M") === "F"
                      ? ["Solteira", "Casada", "Divorciada", "Viúva", "União Estável"]
                      : (editForm.genero || "M") === "O"
                        ? ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "União Estável"]
                        : ["Solteiro", "Casado", "Divorciado", "Viúvo", "União Estável"]
                    ).map((o) => <option key={o}>{o}</option>)}
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

const AniversariosSection = ({
  clients,
  sales = [],
  onViewContract,
}: {
  clients: Cliente[];
  sales?: Venda[];
  onViewContract?: (v: Venda) => void;
}) => {
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

  // Exclui rascunhos — apenas compras reais
  const clientSales = selectedClient
    ? sales.filter((s) => s.clienteId === selectedClient.id && s.status !== "rascunho")
    : [];

  const isAvista = (s: Venda) =>
    !s.quantidadeParcelas || s.quantidadeParcelas === 0 || s.formaPagamento === "avista";

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

                {/* Purchases — clicáveis, sem badge de status */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Compras ({clientSales.length})
                  </p>
                  {clientSales.length === 0 ? (
                    <p className="text-sm text-slate-400 italic p-3">Nenhuma compra registrada.</p>
                  ) : (
                    clientSales.map((s) => {
                      const avista = isAvista(s);
                      return (
                        <button
                          key={s.id}
                          onClick={() => {
                            setSelectedClient(null);
                            onViewContract?.(s);
                          }}
                          className="w-full text-left p-3 bg-slate-50 hover:bg-primary-main/5 border border-transparent hover:border-primary-main/20 rounded-2xl flex justify-between items-start gap-3 transition-all group"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-800 text-sm truncate">{s.empreendimentoNome}</p>
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                              Quadra {s.quadra} · Lote {s.numeroLote}
                            </p>
                            <span className={`inline-block mt-1.5 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${avista ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                              {avista ? "À Vista" : `Parcelado ${s.quantidadeParcelas}x`}
                            </span>
                          </div>
                          <div className="text-right flex-shrink-0 flex flex-col items-end gap-1.5">
                            <p className="font-display font-bold text-primary-main text-sm">
                              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(s.valorLote)}
                            </p>
                            <ChevronRight size={14} className="text-slate-300 group-hover:text-primary-main transition-colors" />
                          </div>
                        </button>
                      );
                    })
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
        v.id === editingVendedor.id ? normalizarNomeObrigatorio({ ...vendedorForm, estado: (vendedorForm.estado || "").toUpperCase(), id: editingVendedor.id } as any) : v
      );
    } else {
      updated = [...(formData.vendedores || []), normalizarNomeObrigatorio({ ...vendedorForm, estado: (vendedorForm.estado || "").toUpperCase(), id: `vend-${Date.now()}` } as any)];
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
              const normalizedConfig = {
                ...formData,
                vendedores: (formData.vendedores || []).map((v: any) => normalizarNomeObrigatorio({ ...v, estado: (v.estado || "").toUpperCase() })),
                proprietarios: ((formData as any).proprietarios || []).map((p: any) => normalizarNomeObrigatorio({ ...p, estado: (p.estado || "").toUpperCase() })),
              };
              setFormData(normalizedConfig);
              onSave(normalizedConfig);
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
                <input className="input-field" placeholder="Nome Completo" value={vendedorForm.nome} onChange={(e) => setVendedorForm({ ...vendedorForm, nome: textoMaiusculo(e.target.value) })} />
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
                <input className="input-field" value={vendedorForm.rg} onChange={(e) => setVendedorForm({ ...vendedorForm, rg: maskRG(e.target.value) })} />
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
                <BuscarCEPPorRua
                  estadoPadrao={vendedorForm.estado || "PA"}
                  cidadePadrao={vendedorForm.cidade || ""}
                  onSelect={(r) => setVendedorForm((prev) => ({
                    ...prev,
                    cep: maskCEP(r.cep),
                    endereco: r.logradouro || prev.endereco,
                    bairro: r.bairro || prev.bairro,
                    cidade: r.localidade || prev.cidade,
                    estado: r.uf || prev.estado,
                  }))}
                />
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

        <div className="border-t border-slate-100 pt-4 space-y-3">
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-700">Migração do banco:</span> Se seus dados aparecem em um navegador mas não em outro, clique abaixo para consolidar tudo em um único espaço compartilhado.
          </p>
          <button
            onClick={async () => {
              setMigrating(true);
              setMigrateMsg('');
              try {
                const res = await fetch('/api/admin/migrate-to-shared', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(localStorage.getItem('rumo_auth_token') ? { Authorization: `Bearer ${localStorage.getItem('rumo_auth_token')}` } : {}) }, credentials: 'include' });
                const data = await res.json();
                if (data.ok) {
                  setMigrateMsg(`Migração concluída! ${data.moved.empreendimentos} empreendimento(s), ${data.moved.clientes} cliente(s), ${data.moved.vendas} venda(s) consolidados. Recarregue a página.`);
                } else {
                  setMigrateMsg('Erro: ' + (data.error || 'Tente novamente.'));
                }
              } catch (e: any) {
                setMigrateMsg('Erro de conexão: ' + (e?.message || 'Tente novamente.'));
              } finally {
                setMigrating(false);
              }
            }}
            disabled={migrating}
            className="btn-ghost px-8 border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-40"
          >
            {migrating ? (
              <><RefreshCw size={16} className="animate-spin" /> Migrando...</>
            ) : (
              <><ShieldCheck size={16} /> Consolidar dados de todos os navegadores</>
            )}
          </button>
        </div>
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
    nome: "", genero: "M", nacionalidade: "brasileiro", estadoCivil: "Solteiro",
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
    if (!form.nome.trim()) {
      setCpfErr("Informe o nome do proprietário.");
      triggerShake(propFormRef.current);
      return;
    }
    // Validar CPF matematicamente se preenchido
    const cpfRaw = form.cpf.replace(/\D/g, "");
    if (cpfRaw.length > 0) {
      if (cpfRaw.length !== 11) {
        setCpfErr("CPF deve ter 11 dígitos.");
        triggerShake(propFormRef.current);
        return;
      }
      if (!validarCPF(form.cpf)) {
        setCpfErr("CPF inválido — verifique os dígitos.");
        triggerShake(propFormRef.current);
        return;
      }
    }
    // Validar RG minimamente se preenchido
    const rgClean = form.rg.replace(/\s+/g, "").trim();
    if (rgClean.length > 0 && !validarRG(form.rg)) {
      setCpfErr("RG inválido (mínimo 5 caracteres, apenas letras e números).");
      triggerShake(propFormRef.current);
      return;
    }
    // Verificar duplicidade por CPF (exceto na edição do mesmo registro)
    if (cpfRaw.length === 11) {
      const duplicado = proprietarios.find(
        (p) => p.cpf.replace(/\D/g, "") === cpfRaw && p.id !== editingId
      );
      if (duplicado) {
        setCpfErr(`CPF já cadastrado para: ${duplicado.nome}`);
        triggerShake(propFormRef.current);
        return;
      }
    }
    setCpfErr(null);
    let updated: Proprietario[];
    if (editingId) {
      updated = proprietarios.map((p) => p.id === editingId ? normalizarNomeObrigatorio({ ...form, estado: (form.estado || "").toUpperCase(), id: editingId } as any) : p);
    } else {
      updated = [...proprietarios, normalizarNomeObrigatorio({ ...form, estado: (form.estado || "").toUpperCase(), id: `prop-${Date.now()}` } as any)];
    }
    onSave({ ...config, proprietarios: updated });
    setShowForm(false);
    setEditingId(null);
    setForm(emptyProp);
  };

  const handleEdit = (p: Proprietario) => {
    setEditingId(p.id);
    setForm({ nome: p.nome, genero: (p as any).genero || "M", nacionalidade: p.nacionalidade, estadoCivil: genderizeEstadoCivil(p.estadoCivil || "Solteiro", (p as any).genero || "M"), rg: p.rg, cpf: p.cpf, endereco: p.endereco, numero: p.numero, bairro: p.bairro, cidade: p.cidade, estado: p.estado, cep: p.cep } as any);
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
                  <input className="input-field" placeholder="Nome Completo" value={form.nome} onChange={(e) => setForm({ ...form, nome: textoMaiusculo(e.target.value) })} />
                </div>
                <div>
                  <label className="label">Gênero / Tratamento *</label>
                  <select
                    className="input-field"
                    value={(form as any).genero || "M"}
                    onChange={(e) => {
                      const genero = e.target.value as "M" | "F";
                      setForm({
                        ...form,
                        genero,
                        nacionalidade: genero === "F" ? "brasileira" : "brasileiro",
                        estadoCivil: genderizeEstadoCivil(form.estadoCivil || "Solteiro", genero),
                      } as any);
                    }}
                  >
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                  </select>
                </div>
                <div>
                  <label className="label">Nacionalidade</label>
                  <input className="input-field" value={form.nacionalidade} onChange={(e) => setForm({ ...form, nacionalidade: e.target.value })} />
                </div>
                <div>
                  <label className="label">Estado Civil</label>
                  <select className="input-field" value={genderizeEstadoCivil(form.estadoCivil || "Solteiro", (form as any).genero || "M")} onChange={(e) => setForm({ ...form, estadoCivil: genderizeEstadoCivil(e.target.value, (form as any).genero || "M") })}>
                    {(((form as any).genero || "M") === "F" ? ["Solteira", "Casada", "Divorciada", "Viúva", "União Estável"] : ["Solteiro", "Casado", "Divorciado", "Viúvo", "União Estável"]).map((o) => <option key={o}>{o}</option>)}
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
                      setCpfErr(st === "invalid" ? "CPF inválido — verifique os dígitos." : null);
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
                  <BuscarCEPPorRua
                    estadoPadrao={form.estado || "PA"}
                    cidadePadrao={form.cidade || ""}
                    onSelect={(r) => setForm((prev) => ({
                      ...prev,
                      cep: maskCEP(r.cep),
                      endereco: r.logradouro || prev.endereco,
                      bairro: r.bairro || prev.bairro,
                      cidade: r.localidade || prev.cidade,
                      estado: r.uf || prev.estado,
                    }))}
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
    editar_mapas: "Editar mapas",
  };

  const ALL_SECTIONS_LIST = ["dashboard","vendas","empreendimentos","proprietarios","contratos","clientes","aniversarios","calculadora","config","editar_mapas"];

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
      const res = await authFetch("/api/admin/users");
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
      const res = await authFetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar usuário.");
      // Salvar permissões padrão para o novo usuário
      const defaultPerms: Record<string, boolean> = {
        dashboard: true, vendas: true, empreendimentos: false, proprietarios: false,
        contratos: true, clientes: true, aniversarios: true, calculadora: true, config: false, usuarios: false, editar_mapas: false,
      };
      await authFetch(`/api/admin/users/${data.id}/permissions`, {
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
        const res = await authFetch(`/api/admin/users/${id}`, { method: "DELETE" });
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
      contratos: true, clientes: true, aniversarios: true, calculadora: true, config: false, editar_mapas: false,
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
      const res = await authFetch(`/api/admin/users/${editingPermUser}/permissions`, {
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

// --- Histórico de Exclusões ---

const LIXEIRA_KEY = "lotes_lixeira_vendas";

function loadLixeira(): VendaExcluida[] {
  try {
    const raw = localStorage.getItem(LIXEIRA_KEY);
    if (!raw) return [];
    const items: VendaExcluida[] = JSON.parse(raw);
    // Filtrar expirados (> 30 dias)
    const agora = new Date();
    return items.filter((item) => new Date(item.expiresAt) > agora);
  } catch {
    return [];
  }
}

function saveLixeira(items: VendaExcluida[]): void {
  try {
    localStorage.setItem(LIXEIRA_KEY, JSON.stringify(items));
  } catch {
    console.error("Erro ao salvar lixeira");
  }
}

const HistoricoExclusoesSection = ({
  vendasExcluidas,
  onRestore,
}: {
  vendasExcluidas: VendaExcluida[];
  onRestore: (item: VendaExcluida) => void;
}) => {
  const [search, setSearch] = useState("");

  const diasRestantes = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const tipoLabel = (venda: Venda) => {
    if (venda.quantidadeParcelas && venda.quantidadeParcelas > 0) return "Parcelado";
    return "À Vista";
  };

  const filtered = vendasExcluidas.filter((item) => {
    const q = search.toLowerCase();
    return (
      !q ||
      (item.venda.clienteNome || "").toLowerCase().includes(q) ||
      (item.venda.empreendimentoNome || "").toLowerCase().includes(q) ||
      (item.venda.quadra || "").toLowerCase().includes(q) ||
      (item.venda.numeroLote || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por comprador, empreendimento ou lote..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-border-subtle rounded-xl bg-surface-card text-sm focus:outline-none focus:ring-2 focus:ring-primary-main/30"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-400">
          <Trash2 size={48} className="opacity-30" />
          <p className="text-lg font-semibold">Nenhuma venda excluída</p>
          <p className="text-sm text-center max-w-xs">
            Vendas excluídas aparecem aqui por 30 dias e podem ser restauradas.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const dias = diasRestantes(item.expiresAt);
            const tipo = tipoLabel(item.venda);
            const isAvista = tipo === "À Vista";
            return (
              <div
                key={item.venda.id + item.dataExclusao}
                className="bg-surface-card border border-border-subtle rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-800 text-sm">
                      {item.venda.clienteNome || "—"}
                    </span>
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase ${isAvista ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                      {tipo}
                    </span>
                    {dias <= 7 && (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-red-100 text-red-600">
                        Expira em {dias}d
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {item.venda.empreendimentoNome || "—"} · Quadra {item.venda.quadra} · Lote {item.venda.numeroLote}
                  </div>
                  <div className="text-xs text-slate-400">
                    Excluído em {new Date(item.dataExclusao).toLocaleDateString("pt-BR")} · Restaurável por mais {dias} dia{dias !== 1 ? "s" : ""}
                  </div>
                </div>
                <button
                  onClick={() => onRestore(item)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-main text-primary-contrast rounded-xl text-xs font-bold hover:opacity-90 transition-all self-end sm:self-auto whitespace-nowrap"
                >
                  <ArrowLeft size={14} />
                  Restaurar
                </button>
              </div>
            );
          })}
        </div>
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
  const [vendasExcluidas, setVendasExcluidas] = useState<VendaExcluida[]>(() => loadLixeira());
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

    // Recarrega dados quando a janela/aba volta ao foco — garante sincronização
    // entre navegadores, abas e celular sem precisar de WebSocket.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        Promise.allSettled([
          dbService.getEmpreendimentos(),
          dbService.getClientes(),
          dbService.getVendas(),
          dbService.getAppConfig(),
        ]).then((results) => {
          if (results[0].status === 'fulfilled') setDevelopments(results[0].value);
          if (results[1].status === 'fulfilled') setClients(results[1].value);
          if (results[2].status === 'fulfilled') setSales(results[2].value);
          if (results[3].status === 'fulfilled') setConfig(results[3].value);
        }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      subDevs?.unsubscribe();
      subClientes?.unsubscribe();
      subVendas?.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", config.theme);
  }, [config.theme]);

  const saveDev = (newDev: Empreendimento) => {
    if (!isLoaded) return;
    const devRecalculado = recalcularEstatisticasEmpreendimento(newDev, sales);
    const exists = developments.some((d) => d.id === newDev.id);
    const updated = exists
      ? developments.map((d) => (d.id === newDev.id ? devRecalculado : d))
      : [...developments, devRecalculado];
    setDevelopments(updated);
    // Upsert atômico: salva apenas este empreendimento
    dbService.upsertEmpreendimento(devRecalculado).catch((e) => alert('Erro ao salvar empreendimento:\n' + JSON.stringify(e)));
  };

  const deleteDev = (id: string) => {
    const updated = developments.filter((d) => d.id !== id);
    setDevelopments(updated);
    dbService.deleteEmpreendimento(id).catch((e) => alert('Erro ao deletar empreendimento:\n' + JSON.stringify(e)));
  };

  const saveSale = (newSale: Venda, newClient: Cliente) => {
    if (!isLoaded) return newSale;
    let updatedClients = [...clients];
    const existingClientIndex = clients.findIndex(
      (c) => c.cpf === newClient.cpf,
    );
    if (existingClientIndex === -1) {
      newClient = normalizarNomeObrigatorio({ ...newClient, estado: (newClient.estado || "").toUpperCase() });
      updatedClients.push(newClient);
      setClients(updatedClients);
      // Upsert atômico: salva apenas este cliente sem tocar nos outros
      dbService.upsertCliente(newClient).catch((e) => {
        console.error('Erro ao salvar cliente:', e);
        alert('Erro ao salvar cliente no banco. Verifique a conexão.\n' + String(e?.message || e));
      });
    } else {
      const existingClient = clients[existingClientIndex];
      const mergedClient: Cliente = normalizarNomeObrigatorio({
        ...existingClient,
        ...newClient,
        estado: (newClient.estado || existingClient.estado || "").toUpperCase(),
        id: existingClient.id,
        dataCadastro: existingClient.dataCadastro || newClient.dataCadastro,
        genero: (newClient.genero || existingClient.genero || "") as any,
        estadoCivil: newClient.estadoCivil || existingClient.estadoCivil,
      } as Cliente);
      updatedClients = updatedClients.map((c, idx) => idx === existingClientIndex ? mergedClient : c);
      setClients(updatedClients);
      dbService.upsertCliente(mergedClient).catch((e) => {
        console.error('Erro ao atualizar cliente:', e);
        alert('Erro ao atualizar cliente no banco. Verifique a conexão.\n' + String(e?.message || e));
      });
      newSale.clienteId = mergedClient.id;
      newSale.clienteNome = mergedClient.nome;
    }

    const updatedSales = [newSale, ...sales];
    setSales(updatedSales);
    // Upsert atômico: salva apenas esta venda sem sobrescrever as outras
    dbService.upsertVenda(newSale).catch((e) => {
      console.error('Erro ao salvar venda:', e);
      alert('Erro ao salvar venda no banco. Verifique a conexão.\n' + String(e?.message || e));
    });

    const updatedDevs = developments.map((d) => {
      if (d.id === newSale.empreendimentoId) {
        return addOrUpdateSoldLotFromSale(d, newSale, updatedSales);
      }
      return d;
    });
    setDevelopments(updatedDevs);
    // Upsert atômico apenas do empreendimento afetado
    const devAfetado = updatedDevs.find((d) => d.id === newSale.empreendimentoId);
    if (devAfetado) dbService.upsertEmpreendimento(devAfetado).catch(console.error);

    return newSale;
  };

  const persistEmpreendimentoAtualizado = (devAtualizado: Empreendimento) => {
    dbService.upsertEmpreendimento(devAtualizado).catch(console.error);
  };

  const updateLoteStatus = (
    empreendimentoId: string,
    quadra: string,
    lote: string,
    novoStatus: "disponivel" | "reservado" | "indisponivel" | "vendido",
    options: Record<string, any> = {},
  ): Empreendimento | null => {
    let devAtualizado: Empreendimento | null = null;
    const vendasReferencia = options.vendasReferencia || sales;
    const updated = developments.map((d) => {
      if (d.id !== empreendimentoId) return d;
      devAtualizado = updateLoteStatusInEmpreendimento(d, vendasReferencia, quadra, lote, novoStatus, options);
      return devAtualizado;
    });
    setDevelopments(updated);
    if (devAtualizado) persistEmpreendimentoAtualizado(devAtualizado);
    return devAtualizado;
  };

  const updateLotesInfo = (
    id: string,
    info: Record<string, any>,
  ) => {
    let devAtualizado: Empreendimento | null = null;
    const updated = developments.map((d) => {
      if (d.id !== id) return d;
      devAtualizado = applyLotesInfoPatchToEmpreendimento(d, info, sales);
      return devAtualizado;
    });
    setDevelopments(updated);
    if (devAtualizado) persistEmpreendimentoAtualizado(devAtualizado);
  };

  const deleteLot = (devId: string, key: string) => {
    let devAtualizado: Empreendimento | null = null;
    const updated = developments.map((d) => {
      if (d.id !== devId) return d;
      devAtualizado = deleteLotFromEmpreendimento(d, key, sales);
      return devAtualizado;
    });
    setDevelopments(updated);
    if (devAtualizado) persistEmpreendimentoAtualizado(devAtualizado);
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

  // Salva vendedor como proprietário (upsert por CPF — evita duplicidade)
  const handleSaveProprietario = (p: Proprietario) => {
    const lista = config.proprietarios || [];
    const cpfLimpo = p.cpf.replace(/\D/g, "");
    const existente = cpfLimpo
      ? lista.find((x) => x.cpf.replace(/\D/g, "") === cpfLimpo)
      : null;
    let updated: Proprietario[];
    if (existente) {
      // Já existe — atualiza preservando o id original
      updated = lista.map((x) =>
        x.cpf.replace(/\D/g, "") === cpfLimpo ? normalizarNomeObrigatorio({ ...p, estado: (p.estado || "").toUpperCase(), id: x.id } as any) : x
      );
    } else {
      updated = [...lista, normalizarNomeObrigatorio({ ...p, estado: (p.estado || "").toUpperCase() } as any)];
    }
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
    dbService.upsertVenda(updatedVenda).catch(console.error);
    const updatedClients = clients.map((c) =>
      c.id === updatedCliente.id ? updatedCliente : c
    );
    setClients(updatedClients);
    dbService.upsertCliente(updatedCliente).catch(console.error);
    setEditingVendaEntry(null);
  };

  const handleMergeClients = (masterId: string, duplicateIds: string[]) => {
    const updatedSales = sales.map((s) =>
      duplicateIds.includes(s.clienteId)
        ? { ...s, clienteId: masterId, clienteNome: clients.find(c => c.id === masterId)?.nome || s.clienteNome }
        : s
    );
    setSales(updatedSales);
    // Upsert apenas das vendas que tiveram clienteId alterado
    updatedSales
      .filter((s) => {
        const orig = sales.find((o) => o.id === s.id);
        return orig && orig.clienteId !== s.clienteId;
      })
      .forEach((s) => dbService.upsertVenda(s).catch(console.error));
    // Remove clientes duplicados via bulk save (operação de limpeza intencional)
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
    const vendaAtualizada = updated.find((s) => s.id === vendaId);
    if (vendaAtualizada) dbService.upsertVenda(vendaAtualizada).catch(console.error);
    if (contractToOpen && contractToOpen.id === vendaId) {
      setContractToOpen({ ...contractToOpen, status: newStatus });
    }
  };

  const deleteVenda = (id: string) => {
    const venda = sales.find((s) => s.id === id);
    if (!venda) return;

    const dev = developments.find((d) => d.id === venda.empreendimentoId);
    const lotInfoKey = venda.quadra && venda.numeroLote ? getLotInfoKey(venda.quadra, venda.numeroLote) : "";
    const lotInfo = lotInfoKey ? (dev?.lotesInfo || {})[lotInfoKey] : null;
    const contratoComLoteVendido = !!(
      dev &&
      venda.quadra &&
      venda.numeroLote &&
      (lotInfo?.status === "vendido" || findVendaAtivaDoLote(sales, dev.id, venda.quadra, venda.numeroLote))
    );

    let liberarLote = false;
    if (contratoComLoteVendido) {
      const continuar = window.confirm(
        `Este contrato está vinculado a um lote vendido.\n\n` +
        `Cliente: ${venda.clienteNome || "Cliente não informado"}\n` +
        `Empreendimento: ${venda.empreendimentoNome || dev?.nome || "Não informado"}\n` +
        `Quadra: ${venda.quadra}\n` +
        `Lote: ${venda.numeroLote}\n\n` +
        `Deseja continuar?`,
      );
      if (!continuar) return;

      liberarLote = window.confirm(
        `Escolha a ação para o lote ${venda.quadra}-${venda.numeroLote}:\n\n` +
        `OK = Excluir contrato e liberar lote, mantendo histórico.\n` +
        `Cancelar = Excluir apenas o contrato e manter lote vendido.`,
      );
    }

    const updated = sales.filter((s) => s.id !== id);

    if (liberarLote && dev && venda.quadra && venda.numeroLote) {
      updateLoteStatus(dev.id, venda.quadra, venda.numeroLote, "disponivel", {
        venda,
        origem: "exclusao_contrato",
        vendasReferencia: updated,
      });
    }

    // Mover para lixeira em vez de excluir permanentemente
    const agora = new Date();
    const expiresAt = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000);
    const novaExclusao: VendaExcluida = {
      venda,
      dataExclusao: agora.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    const novaLixeira = [...vendasExcluidas.filter((e) => e.venda.id !== id), novaExclusao];
    setVendasExcluidas(novaLixeira);
    saveLixeira(novaLixeira);

    setSales(updated);
    dbService.deleteVendaById(id).catch((e) => {
      console.error('Erro ao excluir venda:', e);
      alert('Erro ao excluir venda no banco.\n' + String(e?.message || e));
    });
  };

  const restoreVenda = (item: VendaExcluida) => {
    // Restaurar: re-inserir no estado de sales e no backend
    const venda = item.venda;
    setSales((prev) => {
      if (prev.find((s) => s.id === venda.id)) return prev;
      return [...prev, venda];
    });
    dbService.upsertVenda(venda).catch((e) => {
      console.error('Erro ao restaurar venda:', e);
      alert('Erro ao restaurar venda no banco.\n' + String(e?.message || e));
    });
    // Remover da lixeira
    const novaLixeira = vendasExcluidas.filter((e) => e.venda.id !== venda.id);
    setVendasExcluidas(novaLixeira);
    saveLixeira(novaLixeira);
  };

  const updateVenda = (venda: Venda) => {
    const updated = sales.map((s) => (s.id === venda.id ? venda : s));
    setSales(updated);
    dbService.upsertVenda(venda).catch(console.error);
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
            onReleaseSoldLot={(vendaId) => updateVendaStatus(vendaId, "cancelado")}
            proprietarios={config.proprietarios || []}
            canEditMap={!!isAdmin || userPermissions?.editar_mapas === true}
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
            onSaveProprietario={handleSaveProprietario}
            onEditVenda={handleEditVenda}
            onNovoContrato={() => { setEditingVendaEntry(null); setSection("vendas"); }}
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
              dbService.upsertCliente(updated).catch(console.error);
            }}
          />
        );
      case "aniversarios":
        return (
          <AniversariosSection
            clients={clients}
            sales={sales}
            onViewContract={(v) => { setSection("contratos"); setContractToOpen(v); }}
          />
        );
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
      case "historico":
        return (
          <HistoricoExclusoesSection
            vendasExcluidas={vendasExcluidas}
            onRestore={restoreVenda}
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
      historico: "Histórico de Exclusões",
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
            {!isLoaded ? (
              <div className="flex flex-col items-center justify-center py-32 gap-4">
                <div className="w-8 h-8 border-4 border-primary-main border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 text-sm font-medium">Carregando dados do servidor...</p>
              </div>
            ) : renderSection()}
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

