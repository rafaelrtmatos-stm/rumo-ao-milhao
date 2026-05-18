import AdmZip from "adm-zip";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Utilitários numéricos ────────────────────────────────────────────────────

function inteiroExtenso(n: number): string {
  if (n === 0) return "zero";
  const unidades = [
    "", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
    "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
  ];
  const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  if (n === 100) return "cem";
  if (n === 1000) return "mil";
  if (n < 20) return unidades[n];
  if (n < 100) {
    const dez = Math.floor(n / 10);
    const un = n % 10;
    return dezenas[dez] + (un > 0 ? " e " + unidades[un] : "");
  }
  if (n < 1000) {
    const cent = Math.floor(n / 100);
    const rest = n % 100;
    return centenas[cent] + (rest > 0 ? " e " + inteiroExtenso(rest) : "");
  }
  if (n < 1_000_000) {
    const mil = Math.floor(n / 1000);
    const rest = n % 1000;
    const milText = mil === 1 ? "mil" : inteiroExtenso(mil) + " mil";
    if (rest === 0) return milText;
    const useE = rest < 100 || rest % 100 === 0;
    return milText + (useE ? " e " : " ") + inteiroExtenso(rest);
  }
  const mi = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  const miText = mi === 1 ? "um milhão" : inteiroExtenso(mi) + " milhões";
  if (rest === 0) return miText;
  return miText + " e " + inteiroExtenso(rest);
}

function capitalizar(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function valorExtenso(n: number): string {
  const intPart = Math.floor(n);
  const cents = Math.round((n - intPart) * 100);
  const intText = inteiroExtenso(intPart);
  const label = intPart === 1 ? "Real" : "Reais";
  if (cents === 0) return intText + " " + label;
  return intText + " " + label + " e " + inteiroExtenso(cents) + (cents === 1 ? " centavo" : " centavos");
}

function brlNum(n: number | undefined | null): string {
  const safe = (n == null || isNaN(Number(n))) ? 0 : Number(n);
  return safe.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numExt(n: number | undefined | null): string {
  const safe = (n == null || isNaN(Number(n))) ? 0 : Number(n);
  return `${brlNum(safe)} (${capitalizar(valorExtenso(safe))})`;
}

function dataExtenso(date: Date): string {
  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${date.getDate()} de ${meses[date.getMonth()]} de ${date.getFullYear()}`;
}

function primeiraParcela(dateStr: string): string {
  if (!dateStr) return "___/___/______";
  const d = new Date(dateStr + "T12:00:00");
  d.setMonth(d.getMonth() + 1);
  return d.toLocaleDateString("pt-BR");
}

function diaDoMes(dateStr: string): number {
  if (!dateStr) return 1;
  return new Date(dateStr + "T12:00:00").getDate();
}

// ─── XML replacement ──────────────────────────────────────────────────────────

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Substitui texto que pode estar fragmentado em múltiplos <w:r> runs.
 * Cria um regex onde entre cada caractere pode haver tags XML arbitrárias.
 */
function rep(xml: string, search: string, replacement: string): string {
  if (!search) return xml;
  const safe = xmlEscape(replacement);
  const chars = [...search].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = chars.join("(?:<[^>]*>\\s*)*");
  try {
    return xml.replace(new RegExp(pattern, "g"), safe);
  } catch {
    return xml.split(search).join(safe);
  }
}

// ─── Valores do template original ────────────────────────────────────────────
// (contrato_template.docx = contrato da Monique / DEUS DA PAZ)

const T = {
  // Vendedor
  VEND_NOME:   "GENILSON PEREIRA MOREIRA",
  VEND_NAC:    "brasileiro",
  VEND_CIVIL:  "solteiro",
  VEND_RG:     "3215776",
  VEND_CPF:    "632.939.002-91",
  // Endereço vendedor - contexto completo para evitar matches errados
  VEND_ADDR:   "Travessa Maranhão, n° 353, Aeroporto Velho, Santarém, PA, CEP 68020-070",

  // Comprador
  COMP_INTRO:  "a Sra. ",
  COMP_NOME:   "MONIQUE DE NAZARE CASTRO VALENTE",
  COMP_NAC:    "brasileira",
  COMP_CIVIL:  "solteira",
  COMP_RG:     "4478817 PC PA",
  COMP_CPF:    "747.909.512-00",
  COMP_FONES:  "(91) 98294-8762 (91) 98888-6169",
  // Endereço comprador - contexto completo
  COMP_ADDR:   "Rua Oliveira Belo, n° 10, Umarizal, Belém, PA, CEP 66050-380",

  // Imóvel
  EMP_NOME:    "DEUS DA PAZ",
  EMP_COM:     "Caranazal",
  EMP_SLASH:   "Santarém/PA",          // formato "Cidade/UF" no corpo
  LOTE_QUADRA: "Lote 35 da Quadra (C)",
  RUA:         "Rua Existente",
  DIM:         "10,54 metros de frente, lateral direita medindo 42,07 metros, pela lateral esquerda medindo 45,39 e medindo 10,00 metros de fundos, com área total de 437,31 metros quadrados",

  // Financeiro (número + extenso sem "R$ " — o "R$" está em run separado)
  VALOR_NUM:   "38.800,00 (Trinta e oito mil e oitocentos Reais)",
  ENT_NUM:     "1.000,00 (Mil Reais)",
  SALDO_NUM:   "37.800,00 (Trinta e sete mil e oitocentos Reais)",
  PARC_CTX:    "63 (Sessenta e três)",   // contexto p/ evitar match em outros nºs
  VALPAR_NUM:  "600,00 (Seiscentos Reais)",
  DIA_CTX:     "vencimento no dia 20 de cada mês",
  PRIMEIRA:    "20/06/2026",
  CORR_NUM:    "3.104,00 (Três mil cento e quatro Reais)",

  // Fórum / data
  FORUM:       "Santarém-PA",
  DATA:        "12 de Maio de 2026",
};

// ─── Interface de parâmetros ──────────────────────────────────────────────────

function buildCorretorXml(corretor: { nome?: string; creci?: string; telefone?: string }): string {
  if (!corretor?.nome?.trim()) return "";
  const xmlEscapeLocal = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const rPr = `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`;
  const rPrB = `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`;
  const center = `<w:pPr><w:jc w:val="center"/></w:pPr>`;
  const p = (rpr: string, text: string) =>
    `<w:p>${center}<w:r>${rpr}<w:t xml:space="preserve">${xmlEscapeLocal(text)}</w:t></w:r></w:p>`;

  let xml = `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="400"/></w:pPr></w:p>`;
  xml += p(rPr, "________________________________________");
  xml += p(rPrB, corretor.nome.toUpperCase());
  if (corretor.creci?.trim()) xml += p(rPr, `CRECI: ${corretor.creci.trim()}`);
  if (corretor.telefone?.trim()) xml += p(rPr, `Tel: ${corretor.telefone.trim()}`);
  return xml;
}

export interface ContratoParams {
  corretor?: { nome?: string; creci?: string; telefone?: string };
  vendedor: {
    nome: string;
    nacionalidade: string;
    estadoCivil: string;
    rg: string;
    cpf: string;
    endereco: string;
    numero: string;
    bairro: string;
    cidade: string;
    estado: string;
    cep: string;
  };
  cliente: {
    nome: string;
    nacionalidade: string;
    genero: "M" | "F" | "O";
    estadoCivil: string;
    rg: string;
    cpf: string;
    profissao?: string;
    telefone1?: string;
    telefone2?: string;
    endereco: string;
    numero: string;
    bairro: string;
    cidade: string;
    estado: string;
    cep: string;
  };
  empreendimento: {
    nome: string;
    comunidade?: string;
    cidade?: string;
    estado?: string;
  };
  venda: {
    numeroLote: string;
    quadra: string;
    rua?: string;
    valorLote: number;
    valorEntrada: number;
    quantidadeParcelas: number;
    valorParcela: number;
    dataVencimento: string;
    dataVenda: string;
    medidaFrente?: string;
    medidaLateralDir?: string;
    medidaLateralEsq?: string;
    medidaFundos?: string;
    areaTotal?: string;
  };
}

// ─── Geração do contrato ──────────────────────────────────────────────────────

export async function gerarContratoParceladoPadrao(params: ContratoParams): Promise<Buffer> {
  const { vendedor, cliente, empreendimento, venda } = params;
  // Garante que valores numéricos nunca sejam undefined/null
  const vendaSegura = {
    ...venda,
    valorLote: Number(venda.valorLote) || 0,
    valorEntrada: Number(venda.valorEntrada) || 0,
    quantidadeParcelas: Number(venda.quantidadeParcelas) || 0,
    valorParcela: Number(venda.valorParcela) || 0,
  };

  // Carregar template
  // Tenta __dirname primeiro (mais confiável em produção), cai para process.cwd() como fallback
  const templatePath = path.join(__dirname, "..", "attached_assets", "contrato_template.docx");
  const zip = new AdmZip(templatePath);
  let xml = zip.readAsText("word/document.xml");

  // ── Valores calculados ──────────────────────────────────────────────────────
  const isF         = cliente.genero === "F";
  const compLabel   = isF ? "COMPRADORA" : "COMPRADOR";
  const saldo       = vendaSegura.valorLote - vendaSegura.valorEntrada;
  const corretagem  = vendaSegura.valorLote * 0.08;
  const dataVenda   = new Date((vendaSegura.dataVenda || new Date().toISOString()).split("T")[0] + "T12:00:00");
  const forumCidade = `${empreendimento.cidade || "Santarém"}-${empreendimento.estado || "PA"}`;
  const empSlash    = `${empreendimento.cidade || "Santarém"}/${empreendimento.estado || "PA"}`;

  const phones = [cliente.telefone1, cliente.telefone2].filter(Boolean).join(" ");

  const dimStr = vendaSegura.medidaFrente
    ? `${vendaSegura.medidaFrente} metros de frente, lateral direita medindo ${vendaSegura.medidaLateralDir || "___"} metros, pela lateral esquerda medindo ${vendaSegura.medidaLateralEsq || "___"} e medindo ${vendaSegura.medidaFundos || "___"} metros de fundos, com área total de ${vendaSegura.areaTotal || "___"} metros quadrados`
    : `___ metros de frente, lateral direita medindo ___ metros, pela lateral esquerda medindo ___ e medindo ___ metros de fundos, com área total de ___ metros quadrados`;

  const parcelasExt = capitalizar(inteiroExtenso(vendaSegura.quantidadeParcelas));
  const diaVenc     = String(diaDoMes(vendaSegura.dataVencimento));
  const primeiraPag = primeiraParcela(vendaSegura.dataVencimento);

  // ── 1. Vendedor ─────────────────────────────────────────────────────────────
  xml = rep(xml, T.VEND_NOME,  vendedor.nome.toUpperCase());
  xml = rep(xml, T.VEND_NAC,   vendedor.nacionalidade.toLowerCase());
  xml = rep(xml, T.VEND_CIVIL, vendedor.estadoCivil.toLowerCase());
  xml = rep(xml, T.VEND_RG,    vendedor.rg);
  // CPF aparece no corpo E na assinatura — substitui ambas as ocorrências
  xml = rep(xml, T.VEND_CPF, vendedor.cpf);

  // Endereço completo em contexto para não colidir com outros valores
  const vendAddr = `${vendedor.endereco}, n° ${vendedor.numero}, ${vendedor.bairro}, ${vendedor.cidade}, ${vendedor.estado}, CEP ${vendedor.cep}`;
  xml = rep(xml, T.VEND_ADDR, vendAddr);

  // ── 2. Comprador ────────────────────────────────────────────────────────────
  xml = rep(xml, T.COMP_INTRO, isF ? "a Sra. " : "o Sr. ");
  xml = rep(xml, T.COMP_NOME,  cliente.nome.toUpperCase());
  xml = rep(xml, T.COMP_NAC,   (cliente.nacionalidade || (isF ? "brasileira" : "brasileiro")).toLowerCase());
  xml = rep(xml, T.COMP_CIVIL, cliente.estadoCivil.toLowerCase());
  xml = rep(xml, T.COMP_RG,    cliente.rg);
  // CPF aparece no corpo E na assinatura
  xml = rep(xml, T.COMP_CPF, cliente.cpf);

  // Telefones: substitui os dois juntos, ou remove "Telefone ..." se não houver
  if (phones) {
    xml = rep(xml, T.COMP_FONES, phones);
  } else {
    xml = rep(xml, `Telefone ${T.COMP_FONES}, `, "");
  }

  // Endereço completo
  const compAddr = `${cliente.endereco}, n° ${cliente.numero}, ${cliente.bairro}, ${cliente.cidade}, ${cliente.estado}, CEP ${cliente.cep}`;
  xml = rep(xml, T.COMP_ADDR, compAddr);

  // Pronomes de gênero específicos na descrição do comprador
  if (!isF) {
    xml = rep(xml, "portadora da", "portador da");
    xml = rep(xml, "residente e domiciliada", "residente e domiciliado");
    xml = rep(xml, "chamada simplesmente de", "chamado simplesmente de");
  }

  // ── 3. COMPRADORA → COMPRADOR (se masculino) — artigos primeiro ────────────
  if (!isF) {
    xml = rep(xml, "da COMPRADORA",  "do COMPRADOR");
    xml = rep(xml, "pela COMPRADORA","pelo COMPRADOR");
    xml = rep(xml, "pel a COMPRADORA","pelo COMPRADOR");  // versão fragmentada
    xml = rep(xml, "A COMPRADORA",   "O COMPRADOR");
    xml = rep(xml, "a COMPRADORA",   "o COMPRADOR");
    xml = rep(xml, "COMPRADORA",     "COMPRADOR");        // restantes
  }

  // ── 4. Imóvel / Empreendimento ───────────────────────────────────────────────
  xml = rep(xml, T.EMP_NOME, empreendimento.nome.toUpperCase());
  if (empreendimento.comunidade) {
    xml = rep(xml, T.EMP_COM, empreendimento.comunidade);
  }
  xml = rep(xml, T.EMP_SLASH, empSlash);
  xml = rep(xml, T.LOTE_QUADRA, `Lote ${vendaSegura.numeroLote} da Quadra (${vendaSegura.quadra})`);
  if (vendaSegura.rua) {
    xml = rep(xml, T.RUA, vendaSegura.rua);
  }
  xml = rep(xml, T.DIM, dimStr);

  // ── 5. Valores financeiros ───────────────────────────────────────────────────
  xml = rep(xml, T.VALOR_NUM,  numExt(vendaSegura.valorLote));
  xml = rep(xml, T.ENT_NUM,    numExt(vendaSegura.valorEntrada));
  xml = rep(xml, T.SALDO_NUM,  numExt(saldo));
  // Parcelas — contexto evita match em outros números do documento
  xml = rep(xml, T.PARC_CTX, `${vendaSegura.quantidadeParcelas} (${parcelasExt})`);
  xml = rep(xml, T.VALPAR_NUM, numExt(vendaSegura.valorParcela));
  xml = rep(xml, T.DIA_CTX,   `vencimento no dia ${diaVenc} de cada mês`);
  xml = rep(xml, T.PRIMEIRA,   primeiraPag);
  xml = rep(xml, T.CORR_NUM,   numExt(corretagem));

  // ── 6. Fórum e data ──────────────────────────────────────────────────────────
  xml = rep(xml, T.FORUM, forumCidade);

  // T.DATA ("12 de Maio de 2026") pode não bater porque o Word fragmenta a data
  // em múltiplos <w:r> separados no XML. Por isso substituímos o bloco XML bruto
  // que contém "Santarém-PA," + a data hardcoded por um parágrafo limpo e dinâmico.
  const dataStr = dataExtenso(dataVenda);

  // Fragmento exato que o Word gerou (data hardcoded "4 de Abril de 2026" partida em runs)
  const FRAG_DATA_HARDCODED =
    'Santarém-PA,</w:t></w:r><w:r><w:rPr><w:spacing w:val="-3"/></w:rPr><w:t xml:space="preserve"> </w:t></w:r><w:proofErr w:type="gramStart"/><w:r><w:t>4</w:t></w:r><w:proofErr w:type="gramEnd"/><w:r><w:rPr><w:spacing w:val="-1"/></w:rPr><w:t xml:space="preserve"> </w:t></w:r><w:r><w:t>de</w:t></w:r><w:r><w:rPr><w:spacing w:val="-1"/></w:rPr><w:t xml:space="preserve"> </w:t></w:r><w:r><w:t>Abril de</w:t></w:r><w:r><w:rPr><w:spacing w:val="-6"/></w:rPr><w:t xml:space="preserve"> </w:t></w:r><w:r><w:rPr><w:spacing w:val="-4"/></w:rPr><w:t>2026</w:t></w:r>';

  // Substitui pelo forum + data dinâmica num único run limpo
  const FRAG_DATA_DINAMICO =
    `${forumCidade},</w:t></w:r><w:r><w:t xml:space="preserve"> ${dataStr}</w:t></w:r>`;

  if (xml.includes(FRAG_DATA_HARDCODED)) {
    xml = xml.replace(FRAG_DATA_HARDCODED, FRAG_DATA_DINAMICO);
  } else {
    // Fallback: tenta o placeholder normal (caso o template seja atualizado)
    xml = rep(xml, T.DATA, dataStr);
  }

  // ── Bloco do corretor (recebedor) ────────────────────────────────────────────
  const corretorXml = buildCorretorXml((params as any).corretor ?? {});
  if (corretorXml) {
    xml = xml.replace("<w:sectPr", corretorXml + "<w:sectPr");
  }

  // ── Gravar XML modificado e retornar buffer ──────────────────────────────────
  zip.updateFile("word/document.xml", Buffer.from(xml, "utf-8"));
  return zip.toBuffer();
}
