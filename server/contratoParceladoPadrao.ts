
function corrigirEspacosSimplesmente(texto: string): string {
  return String(texto || "")
    // Caso 1: simplesmente + espaco(s) + papel (normal)
    .replace(/simplesmente\s+(VENDEDORA|VENDEDOR|COMPRADORA|COMPRADOR)/g, "simplesmente $1")
    // Caso 2: simplesmente + de + espaco(s) + papel
    .replace(/simplesmente\s+de\s+(VENDEDORA|VENDEDOR|COMPRADORA|COMPRADOR)/g, "simplesmente $1")
    // Caso 3: simplesmente colado ao papel (sem espaco — bug de fragmentacao)
    .replace(/simplesmente(VENDEDORA|VENDEDOR|COMPRADORA|COMPRADOR)/g, "simplesmente $1")
    // Caso 4: espaco duplo apos simplesmente
    .replace(/simplesmente  +(VENDEDORA|VENDEDOR|COMPRADORA|COMPRADOR)/g, "simplesmente $1");
}

/**
 * Corrige "simplesmente" fragmentado entre múltiplos runs XML.
 * O Word frequentemente parte "simplesmente VENDEDOR" em dois <w:r> separados,
 * resultando em "simplesmente</w:t></w:r><w:r>...<w:t>VENDEDOR" no XML.
 * Este regex unifica o texto dentro do mesmo run.
 */
function corrigirSimplesmenteNoXml(xml: string): string {
  const papeis = "VENDEDORA|VENDEDOR|COMPRADORA|COMPRADOR";
  
  // Passo 1: fragmentado entre runs — "simplesmente</w:t>...</w:t>VENDEDOR"
  xml = xml.replace(
    new RegExp(
      `(simplesmente)(?:\s*de\s*)?</w:t>(?:</w:r>)?(?:<[^>]{0,200}>)*?<w:t(?:\s[^>]*)?>(?:de\s*)?(${papeis})`,
      "g"
    ),
    "simplesmente $2"
  );
  
  // Passo 2: colado no mesmo run sem espaço — "simplesmenteVENDEDOR"
  xml = xml.replace(
    new RegExp(`simplesmente(?:de\s*)?(${papeis})`, "g"),
    "simplesmente $1"
  );

  // Passo 3: com "de " extra — "simplesmente de VENDEDOR"  
  xml = xml.replace(
    new RegExp(`simplesmente\s+de\s+(${papeis})`, "g"),
    "simplesmente $1"
  );

  // Passo 4: espaços duplos — "simplesmente  VENDEDOR"
  xml = xml.replace(
    new RegExp(`simplesmente\s{2,}(${papeis})`, "g"),
    "simplesmente $1"
  );

  return xml;
}

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

/**
 * Substitui texto que pode estar fragmentado em múltiplos <w:r> runs.
 * Cria um regex onde entre cada caractere pode haver tags XML arbitrárias.
 */
function sanitizeForXml(s: string): string {
  // Remove caracteres de controle inválidos em XML (exceto tab, LF, CR)
  // e garante que o resultado é XML válido
  return String(s || "")
    .normalize("NFC")  // normalizar Unicode
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uFFFD\uFFFE\uFFFF]/g, "") // ctrl + surrogates
    .replace(/[\uD800-\uDFFF]/g, "") // surrogates isolados
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/\r\n|\r|\n/g, " "); // quebras de linha
}

function rep(xml: string, search: string, replacement: string): string {
  if (!search) return corrigirEspacosSimplesmente(xml);
  // Sanitizar o valor de substituição para garantir XML válido
  const safe = sanitizeForXml(replacement);
  const chars = [...search].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = chars.join("(?:<[^>]*>\\s*)*");
  try {
    return xml.replace(new RegExp(pattern, "g"), safe);
  } catch {
    // Fallback: substituição literal escapada
    const escapedSearch = xmlEscape(search);
    return xml.split(escapedSearch).join(safe);
  }
}


function escapeRegExpLocal(texto: string): string {
  return String(texto || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aplicarNegritoDocx(xml: string, texto: string): string {
  const alvo = xmlEscape(String(texto || "").trim());
  if (!alvo) return xml;

  // Captura o run completo: <w:r>...<w:rPr>...</w:rPr>...<w:t ...>TEXTO</w:t></w:r>
  // Para não quebrar tags, só aplica negrito se o texto aparece isolado num <w:t>
  const pattern = new RegExp(
    `(<w:r(?:\\s[^>]*)?>)((?:<w:rPr>[^]*?</w:rPr>)?)((?:<[^>]+>)*?)` +
    `(<w:t(?:\\s+[^>]*)?>)(${escapeRegExpLocal(alvo)})(</w:t>)` +
    `((?:<[^>]+>)*?)(</w:r>)`,
    "g"
  );

  return xml.replace(pattern, (match, rOpen, rPr, preT, tOpen, txt, tClose, postT, rClose) => {
    // Extrair rPr existente (sem o <w:b/> se já tiver)
    const rPrInner = rPr ? rPr.replace(/<w:rPr>|<\/w:rPr>/g, "").replace(/<w:b\s*\/>|<w:bCs\s*\/>/g, "") : "";
    const newRPr = `<w:rPr>${rPrInner}<w:b/><w:bCs/></w:rPr>`;
    return `${rOpen}${newRPr}${preT}${tOpen}${txt}${tClose}${postT}${rClose}`;
  });
}

function aplicarNegritosContratoParcelado(xml: string, vendedorNome: string, compradorNome: string, vendedorPapel: string, compradorPapel: string): string {
  const nomesCompradores = String(compradorNome || "").split(/\s*\/\s*/).map((v) => v.trim()).filter(Boolean);
  const nomesVendedores = String(vendedorNome || "").split(/\s*\/\s*/).map((v) => v.trim()).filter(Boolean);
  [...nomesVendedores, ...nomesCompradores, vendedorPapel, compradorPapel, "VENDEDOR", "VENDEDORA", "COMPRADOR", "COMPRADORA", "COMPRADOR(A)"]
    .filter(Boolean)
    .forEach((texto) => {
      xml = aplicarNegritoDocx(xml, texto.toUpperCase());
      xml = aplicarNegritoDocx(xml, texto);
    });
  return xml;
}

// ─── Valores do template original ────────────────────────────────────────────
// (contrato_template.docx = contrato da Monique / DEUS DA PAZ)

const T = {
  // Vendedor
  VEND_NOME:   "GENILSON PEREIRA MOREIRA",
  VEND_NAC:    "brasileiro",
  VEND_CIVIL:  "solteiro",
  VEND_RG:     "3215776",
  VEND_CPF:    "63293900291",
  // Endereço vendedor - contexto completo para evitar matches errados
  VEND_ADDR:   "Travessa Maranhão, n° 353, Aeroporto Velho, Santarém, PA, CEP 68020-070",

  // Comprador
  COMP_INTRO:  "a Sra. ",
  COMP_NOME:   "ANA BÁRBARA COSTA SANTOS",
  COMP_NAC:    "brasileiro",
  COMP_CIVIL:  "solteiro",
  COMP_RG:     "5746450",
  COMP_CPF:    "031.044.532-92",
  COMP_FONES:  "(93) 99238-6266",
  // Endereço comprador - contexto completo
  COMP_ADDR:   "Beco Basílio Antunes, n° 68, Santa Clara, Santarém, PA, CEP 68005-630",

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
  return corrigirEspacosSimplesmente(xml);
}

export interface ContratoParams {
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
  const generoVendedor = getGeneroPessoa(vendedor, "VENDEDOR");
  const generoComprador = getGeneroPessoa(cliente, "COMPRADOR");
  const isF         = generoComprador.genero === "F";
  const compLabel   = generoComprador.papel;
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
  const vendAddr = `${vendedor.endereco}, n° ${vendedor.numero}, ${vendedor.bairro}, ${vendedor.cidade}, ${vendedor.estado}, CEP ${vendedor.cep}`;
  const vendIntroOriginal = `o Sr. ${T.VEND_NOME}, ${T.VEND_NAC}, ${T.VEND_CIVIL}, portador da carteira de identidade nº ${T.VEND_RG} e do CPF nº ${T.VEND_CPF}, residente e domiciliado na ${T.VEND_ADDR}, nesta cidade, ora em diante chamado simplesmente de VENDEDOR`;
  const vendIntroNovo = `${generoVendedor.artigo} ${generoVendedor.tratamento} ${vendedor.nome.toUpperCase()}, ${generoVendedor.nacionalidade}, ${generoVendedor.estadoCivil}, ${generoVendedor.portador} da carteira de identidade nº ${vendedor.rg || "___"} e do CPF nº ${vendedor.cpf || "___"}, residente e ${generoVendedor.domiciliado} na ${vendAddr}, nesta cidade, ora em diante ${generoVendedor.chamado} simplesmente ${generoVendedor.papel}`;
  xml = rep(xml, vendIntroOriginal, vendIntroNovo);
  xml = rep(xml, T.VEND_NOME,  vendedor.nome.toUpperCase());
  // Nacionalidade e estado civil do vendedor já são tratados no bloco completo acima.
  xml = rep(xml, T.VEND_RG,    vendedor.rg);
  xml = rep(xml, T.VEND_CPF, vendedor.cpf);
  xml = rep(xml, T.VEND_ADDR, vendAddr);

  // ── 2. Comprador ────────────────────────────────────────────────────────────
  const compIntroOriginal = `de outro o Sr. ${T.COMP_NOME} , ${T.COMP_NAC}, ${T.COMP_CIVIL}, portador da carteira de identidade nº ${T.COMP_RG} e do CPF nº ${T.COMP_CPF}, Telefone ${T.COMP_FONES}, residente e domiciliado na ${T.COMP_ADDR}, ora em diante chamado simplesmente de COMPRADOR`;
  const compAddr = `${cliente.endereco}, n° ${cliente.numero}, ${cliente.bairro}, ${cliente.cidade}, ${cliente.estado}, CEP ${cliente.cep}`;
  const compIntroNovo = `de outro ${generoComprador.artigo} ${generoComprador.tratamento} ${cliente.nome.toUpperCase()}, ${generoComprador.nacionalidade}, ${generoComprador.estadoCivil}, ${generoComprador.portador} da carteira de identidade nº ${cliente.rg || "___"} e do CPF nº ${cliente.cpf || "___"}${phones ? `, Telefone ${phones}` : ""}, residente e ${generoComprador.domiciliado} na ${compAddr}, ora em diante ${generoComprador.chamado} simplesmente ${generoComprador.papel}`;
  xml = rep(xml, compIntroOriginal, compIntroNovo);
  xml = rep(xml, T.COMP_INTRO, `${generoComprador.artigo} ${generoComprador.tratamento} `);
  xml = rep(xml, T.COMP_NOME,  cliente.nome.toUpperCase());
  xml = rep(xml, T.COMP_NAC,   generoComprador.nacionalidade);
  xml = rep(xml, T.COMP_CIVIL, generoComprador.estadoCivil);
  xml = rep(xml, T.COMP_RG,    cliente.rg);
  xml = rep(xml, T.COMP_CPF, cliente.cpf);

  // Telefones: substitui os dois juntos, ou remove "Telefone ..." se não houver
  if (phones) {
    xml = rep(xml, T.COMP_FONES, phones);
  } else {
    xml = rep(xml, `Telefone ${T.COMP_FONES}, `, "");
  }

  // Endereço completo
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

  // Correções obrigatórias de gênero no corpo do contrato e assinaturas
  xml = rep(xml, "ao COMPRADOR", `${generoComprador.aoA} ${generoComprador.papel}`);
  xml = rep(xml, "à COMPRADORA", `${generoComprador.aoA} ${generoComprador.papel}`);
  xml = rep(xml, "pelo COMPRADOR", `${generoComprador.peloPela} ${generoComprador.papel}`);
  xml = rep(xml, "pela COMPRADORA", `${generoComprador.peloPela} ${generoComprador.papel}`);
  xml = rep(xml, "o VENDEDOR", `${generoVendedor.artigo} ${generoVendedor.papel}`);
  xml = rep(xml, "a VENDEDORA", `${generoVendedor.artigo} ${generoVendedor.papel}`);
  xml = rep(xml, "o COMPRADOR", `${generoComprador.artigo} ${generoComprador.papel}`);
  xml = rep(xml, "a COMPRADORA", `${generoComprador.artigo} ${generoComprador.papel}`);
  xml = rep(xml, "simplesmenteVENDEDOR", `simplesmente ${generoVendedor.papel}`);
  xml = rep(xml, "simplesmenteVENDEDORA", `simplesmente ${generoVendedor.papel}`);
  xml = rep(xml, "simplesmenteCOMPRADOR", `simplesmente ${generoComprador.papel}`);
  xml = rep(xml, "simplesmenteCOMPRADORA", `simplesmente ${generoComprador.papel}`);
  xml = rep(xml, "VENDEDOR -", `${generoVendedor.papel} -`);
  xml = rep(xml, "VENDEDOR-", `${generoVendedor.papel} -`);
  xml = rep(xml, "VENDEDOR –", `${generoVendedor.papel} -`);
  xml = rep(xml, "COMPRADOR -", `${generoComprador.papel} -`);
  xml = rep(xml, "COMPRADOR-", `${generoComprador.papel} -`);
  xml = rep(xml, "COMPRADOR –", `${generoComprador.papel} -`);

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


  // ── Negrito obrigatório em nomes e papéis ───────────────────────────────────
  xml = aplicarNegritosContratoParcelado(
    xml,
    vendedor.nome,
    cliente.nome,
    generoVendedor.papel,
    generoComprador.papel
  );

  // ── Correção final de fragmentacao no XML (entre runs diferentes) ──────────
  xml = corrigirSimplesmenteNoXml(xml);

  // ── Correção final de fragmentacao do Word: "simplesmente de VENDEDOR/COMPRADOR" ──
  xml = rep(xml, `simplesmente de ${generoVendedor.papel}`, `simplesmente ${generoVendedor.papel}`);
  xml = rep(xml, `simplesmente de ${generoComprador.papel}`, `simplesmente ${generoComprador.papel}`);
  xml = rep(xml, "simplesmente de VENDEDOR", `simplesmente ${generoVendedor.papel}`);
  xml = rep(xml, "simplesmente de VENDEDORA", `simplesmente ${generoVendedor.papel}`);
  xml = rep(xml, "simplesmente de COMPRADOR", `simplesmente ${generoComprador.papel}`);
  xml = rep(xml, "simplesmente de COMPRADORA", `simplesmente ${generoComprador.papel}`);

  // ── Correção final de espaços grudados no texto plano ───────────────────────
  xml = corrigirEspacosSimplesmente(xml);
  // Segunda passagem no XML para pegar casos residuais entre runs
  xml = corrigirSimplesmenteNoXml(xml);

  // ── Gravar XML modificado e retornar buffer ──────────────────────────────────
  // Validação final: remover caracteres de controle inválidos em XML
  xml = xml.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  // Corrigir & solto que não é entidade XML (causa "O nome na marca de fim do elemento...")
  xml = xml.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;");
  // Última passagem simplesmente
  xml = corrigirSimplesmenteNoXml(xml);
  xml = corrigirEspacosSimplesmente(xml);
  zip.updateFile("word/document.xml", Buffer.from(xml, "utf-8"));
  return zip.toBuffer();
}
