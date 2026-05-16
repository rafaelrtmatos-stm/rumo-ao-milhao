import AdmZip from "adm-zip";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Utilitários ─────────────────────────────────────────────────────────────

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
  const safe = n == null || isNaN(Number(n)) ? 0 : Number(n);
  return safe.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numExt(n: number | undefined | null): string {
  const safe = n == null || isNaN(Number(n)) ? 0 : Number(n);
  return `${brlNum(safe)} (${capitalizar(valorExtenso(safe))})`;
}

// ─── XML replacement ──────────────────────────────────────────────────────────

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

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

// ─── Interface ───────────────────────────────────────────────────────────────

function buildCorretorXml(corretor: { nome?: string; creci?: string; telefone?: string }): string {
  if (!corretor?.nome?.trim()) return "";
  const rPr = `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`;
  const rPrB = `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`;
  const center = `<w:pPr><w:jc w:val="center"/></w:pPr>`;
  const p = (rpr: string, text: string) =>
    `<w:p>${center}<w:r>${rpr}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;

  let xml = `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="400"/></w:pPr></w:p>`;
  xml += p(rPr, "________________________________________");
  xml += p(rPrB, corretor.nome.toUpperCase());
  if (corretor.creci?.trim()) xml += p(rPr, `CRECI: ${corretor.creci.trim()}`);
  if (corretor.telefone?.trim()) xml += p(rPr, `Tel: ${corretor.telefone.trim()}`);
  return xml;
}

export interface ReciboAVistaParams {
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
    dataVenda: string;
    medidaFrente?: string;
    medidaLateralDir?: string;
    medidaLateralEsq?: string;
    medidaFundos?: string;
    areaTotal?: string;
  };
}

// ─── Geração ─────────────────────────────────────────────────────────────────

export async function gerarReciboAVistaPadrao(params: ReciboAVistaParams): Promise<Buffer> {
  const { vendedor, cliente, empreendimento, venda } = params;

  const valorTotal = Number(venda.valorLote) || 0;
  const isCompF = cliente.genero === "F";

  // Gênero do vendedor (padrão masculino para proprietário)
  const generoV   = "o";
  const generoV2  = "o";
  const tratVend  = "Sr.";

  // Gênero do comprador
  const generoC   = isCompF ? "a" : "o";
  const generoC2  = isCompF ? "a" : "o";
  const generoC4  = isCompF ? "à" : "ao";
  const tratComp  = isCompF ? "Sra." : "Sr.";
  const portCard  = "portador(a)";

  const vendedorTermo  = "VENDEDOR";
  const compradorTermo = isCompF ? "COMPRADORA" : "COMPRADOR";

  // Data
  const dataVenda = new Date((venda.dataVenda || new Date().toISOString()).split("T")[0] + "T12:00:00");
  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const dia = String(dataVenda.getDate());
  const mesExtenso = meses[dataVenda.getMonth()];
  const ano = String(dataVenda.getFullYear());

  const dimFrente = venda.medidaFrente || "___";
  const dimLatDir = venda.medidaLateralDir || "___";
  const dimLatEsq = venda.medidaLateralEsq || "___";
  const dimFundos = venda.medidaFundos || "___";
  const dimArea   = venda.areaTotal || "___";

  const valorFormatado = numExt(valorTotal);

  // ── Carregar template ──────────────────────────────────────────────────────
  const templatePath = path.join(__dirname, "..", "attached_assets", "recibo_avista_template.docx");
  const zip = new AdmZip(templatePath);
  let xml = zip.readAsText("word/document.xml");

  // ── Substituições ──────────────────────────────────────────────────────────

  xml = rep(xml, "[VALOR_TOTAL]", valorFormatado);

  // Vendedor
  xml = rep(xml, "[GENEROV]", generoV);
  xml = rep(xml, "[TRATVENDEDOR]", tratVend);
  xml = rep(xml, "[VENDEDOR]", vendedor.nome.toUpperCase());
  xml = rep(xml, "[NACIONALIDADE]", vendedor.nacionalidade.toLowerCase());
  xml = rep(xml, "[ESTADO_CIVIL]", vendedor.estadoCivil.toLowerCase());
  xml = rep(xml, "[PORT]", portCard);
  xml = rep(xml, "[RG]", vendedor.rg || "___");
  xml = rep(xml, "[EMISSAO]", "");
  xml = rep(xml, "[CPF]", vendedor.cpf);
  xml = rep(xml, "[GENEROV2]", generoV2);
  xml = rep(xml, "[RUA]", vendedor.endereco || "___");
  xml = rep(xml, "[NUMERO]", vendedor.numero || "s/n");
  xml = rep(xml, "[BAIRRO]", vendedor.bairro || "___");
  xml = rep(xml, "[CIDADE]", vendedor.cidade || "Santarém");
  xml = rep(xml, "[ESTADO]", vendedor.estado || "PA");
  xml = rep(xml, "[VENDEDOR_TERMO]", vendedorTermo);

  // Comprador
  xml = rep(xml, "[GENEROC]", generoC);
  xml = rep(xml, "[TRATCOMPRADOR]", tratComp);
  xml = rep(xml, "[COMPRADOR]", cliente.nome.toUpperCase());
  xml = rep(xml, "[NACIONALIDADE1]", (cliente.nacionalidade || (isCompF ? "brasileira" : "brasileiro")).toLowerCase());
  xml = rep(xml, "[ESTADO_CIVIL1]", cliente.estadoCivil.toLowerCase());
  xml = rep(xml, "[RG1]", cliente.rg || "___");
  xml = rep(xml, "[EMISSAO1]", "");
  xml = rep(xml, "[CPF1]", cliente.cpf);
  xml = rep(xml, "[TELEFONE]", [cliente.telefone1, cliente.telefone2].filter(Boolean).join(" / ") || "___");
  xml = rep(xml, "[GENEROC2]", generoC2);
  xml = rep(xml, "[RUA1]", cliente.endereco || "___");
  xml = rep(xml, "[NUMERO1]", cliente.numero || "s/n");
  xml = rep(xml, "[BAIRRO1]", cliente.bairro || "___");
  xml = rep(xml, "[CEP]", cliente.cep || "___");
  xml = rep(xml, "[CIDADE1]", cliente.cidade || "___");
  xml = rep(xml, "[ESTADO1]", cliente.estado || "___");
  xml = rep(xml, "[COMPRADOR_TERMO]", compradorTermo);
  xml = rep(xml, "[GENEROC4]", generoC4);

  // Imóvel
  xml = rep(xml, "[QUANTTERRENO]", "um");
  xml = rep(xml, "[LOCALIDADE]", empreendimento.comunidade || empreendimento.cidade || "Santarém");
  xml = rep(xml, "[EMPREENDIMENTO]", empreendimento.nome.toUpperCase());
  // Tenta substituir o grupo junto primeiro
  xml = rep(xml, "[LOTE] da Quadra [QUADRA], [RUA_DO_LOTE]",
    `${venda.numeroLote} da Quadra ${venda.quadra}${venda.rua ? ", " + venda.rua : ""}`);
  // Fallback individual
  xml = rep(xml, "[LOTE]", venda.numeroLote);
  xml = rep(xml, "[QUADRA]", venda.quadra);
  xml = rep(xml, "[RUA_DO_LOTE]", venda.rua || "");
  xml = rep(xml, "[FRENTE]", dimFrente);
  xml = rep(xml, "[LATERAL_DIREITA]", dimLatDir);
  xml = rep(xml, "[LATERAL_ESQUERDA]", dimLatEsq);
  xml = rep(xml, "[FUNDOS]", dimFundos);
  xml = rep(xml, "[AREA_TOTAL]", dimArea);

  // Data
  xml = rep(xml, "[DIA]", dia);
  xml = rep(xml, "[MES_EXTENSO]", mesExtenso);
  xml = rep(xml, "[ANO]", ano);

  // ── Bloco do corretor (recebedor) ─────────────────────────────────────────
  const corretorXml = buildCorretorXml(params.corretor ?? {});
  if (corretorXml) {
    xml = xml.replace("<w:sectPr", corretorXml + "<w:sectPr");
  }

  // ── Reempacotar ───────────────────────────────────────────────────────────
  zip.updateFile("word/document.xml", Buffer.from(xml, "utf-8"));
  return zip.toBuffer();
}
