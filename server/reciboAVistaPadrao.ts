
function corrigirEspacosSimplesmente(texto: string): string {
  return String(texto || "")
    // Garantir sempre "simplesmente de PAPEL" — nunca remover o "de"
    .replace(/simplesmente\s+de\s+(VENDEDORA|VENDEDOR|COMPRADORA|COMPRADOR)/g, "simplesmente de $1")
    .replace(/simplesmente\s+(VENDEDORA|VENDEDOR|COMPRADORA|COMPRADOR)/g, "simplesmente de $1")
    .replace(/simplesmente(VENDEDORA|VENDEDOR|COMPRADORA|COMPRADOR)/g, "simplesmente de $1")
    .replace(/simplesmente  +(VENDEDORA|VENDEDOR|COMPRADORA|COMPRADOR)/g, "simplesmente de $1")
    // Corrigir duplo "de"
    .replace(/simplesmente de de (VENDEDORA|VENDEDOR|COMPRADORA|COMPRADOR)/g, "simplesmente de $1");
}

function corrigirSimplesmenteNoXml(xml: string): string {
  const papeis = "VENDEDORA|VENDEDOR|COMPRADORA|COMPRADOR";
  // Corrigir "simplesmente" e papel separados por tags XML — preserva "de"
  xml = xml.replace(
    new RegExp(`(simplesmente)(?:\s*de\s*)?</w:t>(?:</w:r>)?(?:<[^>]{0,200}>)*?<w:t(?:\s[^>]*)?>(?:de\s*)?(${papeis})`, "g"),
    "simplesmente de $2"
  );
  // Corrigir colado sem espaço: "simplesmenteVENDEDOR"
  xml = xml.replace(new RegExp(`simplesmente(${papeis})`, "g"), "simplesmente de $1");
  // Corrigir duplo "de": "simplesmente de de VENDEDOR"
  xml = xml.replace(new RegExp(`simplesmente de de (${papeis})`, "g"), "simplesmente de $1");
  return xml;
}

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

type GeneroBinario = "M" | "F";

function genderizeEstadoCivil(raw: string, genero: GeneroBinario): string {
  const base = (raw || "").toLowerCase().replace(/[()]/g, "").replace(/\ba\b/g, "").trim();
  const masc: Record<string, string> = { solteiro: "solteiro", solteira: "solteiro", casado: "casado", casada: "casado", divorciado: "divorciado", divorciada: "divorciado", "viúvo": "viúvo", viuvo: "viúvo", "viúva": "viúvo", viuva: "viúvo" };
  const fem: Record<string, string> = { solteiro: "solteira", solteira: "solteira", casado: "casada", casada: "casada", divorciado: "divorciada", divorciada: "divorciada", "viúvo": "viúva", viuvo: "viúva", "viúva": "viúva", viuva: "viúva" };
  const map = genero === "F" ? fem : masc;
  return map[base] || raw.toLowerCase();
}

function getGeneroPessoa(pessoa: any, papelBase: "VENDEDOR" | "COMPRADOR") {
  const genero: GeneroBinario = pessoa?.genero === "F" ? "F" : "M";
  const feminino = genero === "F";
  const papel = papelBase === "VENDEDOR" ? (feminino ? "VENDEDORA" : "VENDEDOR") : (feminino ? "COMPRADORA" : "COMPRADOR");
  return {
    genero,
    tratamento: feminino ? "Sra." : "Sr.",
    artigo: feminino ? "a" : "o",
    nacionalidade: feminino ? "brasileira" : "brasileiro",
    estadoCivil: genderizeEstadoCivil(pessoa?.estadoCivil || "", genero),
    portador: feminino ? "portadora" : "portador",
    domiciliado: feminino ? "domiciliada" : "domiciliado",
    chamado: feminino ? "chamada" : "chamado",
    papel,
    aoA: feminino ? "à" : "ao",
    peloPela: feminino ? "pela" : "pelo",
  };
}

// ─── XML replacement ──────────────────────────────────────────────────────────

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function rep(xml: string, search: string, replacement: string): string {
  if (!search) return corrigirEspacosSimplesmente(xml);
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
  return corrigirEspacosSimplesmente(xml);
}

export interface ReciboAVistaParams {
  corretor?: { nome?: string; creci?: string; telefone?: string };
  vendedor: {
    nome: string;
    genero?: "M" | "F";
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
  const generoVendedor = getGeneroPessoa(vendedor, "VENDEDOR");
  const generoComprador = getGeneroPessoa(cliente, "COMPRADOR");

  const generoV   = generoVendedor.artigo;
  const generoV2  = generoVendedor.genero === "F" ? "a" : "o";
  const tratVend  = generoVendedor.tratamento;

  const generoC   = generoComprador.artigo;
  const generoC2  = generoComprador.genero === "F" ? "a" : "o";
  const generoC4  = generoComprador.aoA;
  const tratComp  = generoComprador.tratamento;

  const vendedorTermo  = generoVendedor.papel;
  const compradorTermo = generoComprador.papel;

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
  xml = rep(xml, "[NACIONALIDADE]", generoVendedor.nacionalidade);
  xml = rep(xml, "[ESTADO_CIVIL]", generoVendedor.estadoCivil);
  xml = rep(xml, "[PORT] da carteira de identidade nº [RG] [EMISSAO] e do CPF nº [CPF]", `${generoVendedor.portador} da carteira de identidade nº ${vendedor.rg || "___"} e do CPF nº ${vendedor.cpf || "___"}`);
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
  xml = rep(xml, "[NACIONALIDADE1]", generoComprador.nacionalidade);
  xml = rep(xml, "[ESTADO_CIVIL1]", generoComprador.estadoCivil);
  xml = rep(xml, "[PORT] da carteira de identidade nº [RG1] [EMISSAO1] e do CPF nº [CPF1]", `${generoComprador.portador} da carteira de identidade nº ${cliente.rg || "___"} e do CPF nº ${cliente.cpf || "___"}`);
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

  // Correções obrigatórias de gênero no recibo à vista
  xml = rep(xml, "que a COMPRADORA pagou", `que ${generoComprador.artigo} ${generoComprador.papel} pagou`);
  xml = rep(xml, "que o COMPRADOR pagou", `que ${generoComprador.artigo} ${generoComprador.papel} pagou`);
  xml = rep(xml, "e a VENDEDORA recebeu", `e ${generoVendedor.artigo} ${generoVendedor.papel} recebeu`);
  xml = rep(xml, "e o VENDEDOR recebeu", `e ${generoVendedor.artigo} ${generoVendedor.papel} recebeu`);
  xml = rep(xml, "dá ao COMPRADOR pleno, geral e irrevogável quitação", `dando ${generoComprador.aoA} ${generoComprador.papel} plena, geral e irrevogável quitação`);
  xml = rep(xml, "dá à COMPRADORA pleno, geral e irrevogável quitação", `dando ${generoComprador.aoA} ${generoComprador.papel} plena, geral e irrevogável quitação`);
  xml = rep(xml, "ao COMPRADOR", `${generoComprador.aoA} ${generoComprador.papel}`);
  xml = rep(xml, "à COMPRADORA", `${generoComprador.aoA} ${generoComprador.papel}`);
  xml = rep(xml, "pelo COMPRADOR", `${generoComprador.peloPela} ${generoComprador.papel}`);
  xml = rep(xml, "pela COMPRADORA", `${generoComprador.peloPela} ${generoComprador.papel}`);
  xml = rep(xml, "simplesmenteVENDEDOR", `simplesmente de ${generoVendedor.papel}`);
  xml = rep(xml, "simplesmenteVENDEDORA", `simplesmente de ${generoVendedor.papel}`);
  xml = rep(xml, "simplesmenteCOMPRADOR", `simplesmente de ${generoComprador.papel}`);
  xml = rep(xml, "simplesmenteCOMPRADORA", `simplesmente de ${generoComprador.papel}`);
  xml = rep(xml, "[VENDEDOR_TERMO]- [VENDEDOR]", `${generoVendedor.papel} - ${vendedor.nome.toUpperCase()}`);
  xml = rep(xml, "[COMPRADOR_TERMO]- [COMPRADOR]", `${generoComprador.papel} - ${cliente.nome.toUpperCase()}`);
  xml = rep(xml, `${generoVendedor.papel}- ${vendedor.nome.toUpperCase()}`, `${generoVendedor.papel} - ${vendedor.nome.toUpperCase()}`);
  xml = rep(xml, `${generoComprador.papel}- ${cliente.nome.toUpperCase()}`, `${generoComprador.papel} - ${cliente.nome.toUpperCase()}`);

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

  // ── Corrigir "simplesmente de VENDEDOR/COMPRADOR" fragmentado ────────────
  xml = rep(xml, "simplesmente de VENDEDOR", `simplesmente de ${generoVendedor.papel}`);
  xml = rep(xml, "simplesmente de VENDEDORA", `simplesmente de ${generoVendedor.papel}`);
  xml = rep(xml, "simplesmente de COMPRADOR", `simplesmente de ${generoComprador.papel}`);
  xml = rep(xml, "simplesmente de COMPRADORA", `simplesmente de ${generoComprador.papel}`);
  xml = corrigirEspacosSimplesmente(xml);

  // ── Reempacotar ───────────────────────────────────────────────────────────
  // Correção final XML
  xml = xml.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  xml = xml.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;");
  xml = corrigirSimplesmenteNoXml(xml);
  xml = corrigirEspacosSimplesmente(xml);
  zip.updateFile("word/document.xml", Buffer.from(xml, "utf-8"));
  return zip.toBuffer();
}
