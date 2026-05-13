import { GoogleGenAI } from "@google/genai";

function parseValue(s: string | undefined | null): number | null {
  if (!s) return null;
  const clean = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function extractLocallyFromText(rawText: string) {
  const text = rawText;

  // CPF: 000.000.000-00
  const cpfMatch = text.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
  const cpf = cpfMatch ? cpfMatch[0].replace(/[^\d]/g, '') : null;

  // CEP: 00000-000
  const cepMatch = text.match(/\b\d{5}-?\d{3}\b/);
  const cep = cepMatch ? cepMatch[0].replace(/[^\d]/g, '') : null;

  // RG
  const rgMatch = text.match(/\bRG[:\s#]*([0-9.\-\/]{5,15})/i);
  const rg = rgMatch ? rgMatch[1].trim() : null;

  // Nome do comprador
  const nomeMatch = text.match(/(?:nome|comprador|cliente)[:\s]+([A-ZÀ-Ú][a-zà-úA-ZÀ-Ú ]+?)(?=\s*(?:cpf|rg|fone|tel|cep|rua|av\.|nascimento|estado|solteiro|casado|,|\n|$))/i);
  const nomeComprador = nomeMatch ? nomeMatch[1].trim() : null;

  // Estado civil — keywords diretos
  const estadoCivilMatch = text.match(/\b(solteiro|solteira|casado|casada|divorciado|divorciada|vi[uú]vo|vi[uú]va|separado|separada|uni[aã]o est[aá]vel)\b/i);
  const estadoCivil = estadoCivilMatch ? estadoCivilMatch[1].toLowerCase()
    .replace(/solteira/, 'solteiro')
    .replace(/casada/, 'casado')
    .replace(/divorciada/, 'divorciado')
    .replace(/vi[uú]va/, 'viúvo')
    .replace(/vi[uú]vo/, 'viúvo')
    .replace(/separada/, 'separado') : null;

  // Telefone: 10 ou 11 dígitos (com ou sem formatação)
  const telMatch = text.match(/(?:fone|tel\.?|celular|whatsapp|contato)?[\s:]*\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/i);
  const telefone1 = telMatch ? telMatch[0].replace(/[^\d]/g, '') : null;

  // Endereço: rua/av/travessa + nome + numero separados
  const enderecoFullMatch = text.match(/\b(rua|r\.|av\.?|avenida|travessa|trav\.?|alameda|al\.?)\s+([^,\n\d]+?),?\s*n[º°.]?\s*(\d+)/i);
  let endereco: string | null = null;
  let numero: string | null = null;
  if (enderecoFullMatch) {
    endereco = (enderecoFullMatch[1] + ' ' + enderecoFullMatch[2]).trim().replace(/,$/, '');
    numero = enderecoFullMatch[3];
  } else {
    const endMatch = text.match(/\b(rua|r\.|av\.?|avenida|travessa|trav\.?)\s+([^,\n]+)/i);
    if (endMatch) endereco = (endMatch[1] + ' ' + endMatch[2]).trim();
  }

  // Bairro e cidade — separar
  const bairroCidadeMatch = text.match(/bairro[:\s]+([^,\n]+?)[,\s]+(?:cidade[:\s]+)?([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);
  const bairroMatch = text.match(/bairro[:\s]+([^,\n\-–]+)/i);
  const cidadeMatch = text.match(/(?:cidade|munic[íi]pio)[:\s]+([^,\n\-–]+)/i);
  const bairro = bairroCidadeMatch ? bairroCidadeMatch[1].trim() : (bairroMatch ? bairroMatch[1].trim() : null);
  const cidade = bairroCidadeMatch ? bairroCidadeMatch[2].trim() : (cidadeMatch ? cidadeMatch[1].trim() : null);

  // Estado (UF de 2 letras)
  const estadoMatch = text.match(/\b([A-Z]{2})\b(?=[\s,\-]*(?:\d{5}|$))/m);
  const estado = estadoMatch ? estadoMatch[1] : null;

  // Lote e Quadra
  const loteMatch = text.match(/\blote[:\s#]*(\w+)/i);
  const quadraMatch = text.match(/\bquadra[:\s#]*(\w+)/i);
  const numeroLote = loteMatch ? loteMatch[1].trim() : null;
  const quadra = quadraMatch ? quadraMatch[1].trim() : null;

  // Empreendimento / nome do terreno
  const empMatch = text.match(/(?:empreendimento|loteamento|terreno|residencial|fazenda|parque)[:\s]+([^\n,;]+)/i);
  const empreendimentoNome = empMatch ? empMatch[1].trim() : null;

  // Pagamento: padrão "entrada R$X NxR$Y" ou "12x1000"
  // Tenta capturar entrada + NxValor junto
  const pagamentoMatch = text.match(/entrada\s*R?\$?\s*([\d.,]+)\s+(\d+)\s*[xX]\s*R?\$?\s*([\d.,]+)/i);
  // Tenta só NxValor
  const parcelasMatch = text.match(/(\d+)\s*[xX]\s*R?\$?\s*([\d.,]+)/i);
  // Tenta entrada separada
  const entradaMatch = text.match(/entrada\s*(?:de\s*)?R?\$?\s*([\d.,]+)/i);
  // Tenta valor total
  const valorTotalMatch = text.match(/(?:valor\s*(?:do\s*)?(?:lote|total|imóvel))\s*[:\s]*R?\$?\s*([\d.,]+)/i);

  let valorEntrada: number | null = null;
  let quantidadeParcelas: number | null = null;
  let valorParcela: number | null = null;
  let valorLote: number | null = null;

  if (pagamentoMatch) {
    valorEntrada = parseValue(pagamentoMatch[1]);
    quantidadeParcelas = parseInt(pagamentoMatch[2]);
    valorParcela = parseValue(pagamentoMatch[3]);
  } else {
    if (entradaMatch) valorEntrada = parseValue(entradaMatch[1]);
    if (parcelasMatch) {
      quantidadeParcelas = parseInt(parcelasMatch[1]);
      valorParcela = parseValue(parcelasMatch[2]);
    }
  }

  // Calcula valor total: entrada + (parcelas * valorParcela)
  if (valorEntrada !== null && quantidadeParcelas !== null && valorParcela !== null) {
    valorLote = valorEntrada + quantidadeParcelas * valorParcela;
  } else if (valorTotalMatch) {
    valorLote = parseValue(valorTotalMatch[1]);
  }

  // Vencimento: "vencimento 15" → próxima data com esse dia
  const vencimentoMatch = text.match(/vencimento[:\s]*(\d{1,2})/i);
  let dataVencimento: string | null = null;
  if (vencimentoMatch) {
    const dia = parseInt(vencimentoMatch[1]);
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1;
    if (dia <= now.getDate()) {
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }
    dataVencimento = `${year}-${String(month).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }

  // Vendedor
  const vendedorMatch = text.match(/vendedor[:\s]+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);
  const vendedor = vendedorMatch ? vendedorMatch[1].trim() : null;

  // Nacionalidade
  const nacionalidadeMatch = text.match(/(?:nacionalidade|naturalidade)[:\s]+([a-zà-úA-ZÀ-Ú]+)/i);
  const nacionalidade = nacionalidadeMatch ? nacionalidadeMatch[1].trim() : null;

  // Profissão
  const profissaoMatch = text.match(/(?:profiss[aã]o|ocupa[çc][aã]o)[:\s]+([^\n,;]+)/i);
  const profissao = profissaoMatch ? profissaoMatch[1].trim() : null;

  return {
    nomeComprador,
    cpf,
    rg,
    cep,
    estadoCivil,
    telefone1,
    endereco,
    numero,
    bairro,
    cidade,
    estado,
    numeroLote,
    quadra,
    empreendimentoNome,
    valorEntrada,
    valorParcela,
    quantidadeParcelas,
    valorLote,
    dataVencimento,
    vendedor,
    nacionalidade,
    profissao,
  };
}

const EXTRACTION_RULES = `
Regras de extração:
- endereco: "rua/avenida/travessa + nome + numero" → separar "endereco" (tipo + nome da via) e "numero" (só o número)
- bairro_cidade: separar bairro e cidade em campos distintos
- estado_civil: identificar solteiro/casado/divorciado/viuvo/separado
- telefone1: números com 10 ou 11 dígitos = contato principal
- lote_quadra: número após "lote" = numeroLote; número/letra após "quadra" = quadra
- empreendimentoNome: nome do empreendimento/loteamento/terreno
- pagamento: padrão "entrada R$X NxR$Y" → valorEntrada, quantidadeParcelas, valorParcela
- valorLote: calcular como entrada + (parcelas * valorParcela) se não informado diretamente
- dataVencimento: número após "vencimento" = dia do mês, formato YYYY-MM-DD
`;

export const geminiService = {
  async analyzeMap(file: File) {
    const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("API Key do Gemini não configurada.");

    const genAI = new GoogleGenAI({ apiKey });

    const base64Data = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });

    const prompt = `
      Analise este mapa de loteamento (imagem ou PDF).
      Extraia uma lista de lotes, quadras e suas respectivas ruas.
      Retorne APENAS um JSON no formato:
      {
        "lotes": [
          {"quadra": "A", "lote": "01", "rua": "Nome da Rua"},
          ...
        ],
        "totalLotes": 0,
        "ruasEncontradas": ["Rua 1", "Rua 2"]
      }
    `;

    const response = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { data: base64Data, mimeType: file.type } }
          ]
        }
      ],
      config: { responseMimeType: "application/json" }
    });

    const text = response.text;
    if (!text) throw new Error("IA não retornou resposta.");
    return JSON.parse(text);
  },

  async extractSaleData(rawText: string) {
    const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) return extractLocallyFromText(rawText);

    try {
      const genAI = new GoogleGenAI({ apiKey });
      const prompt = `
Você é um assistente de extração de dados imobiliários brasileiros.
${EXTRACTION_RULES}

Texto bruto para extrair:
"""
${rawText}
"""

Retorne APENAS um JSON com os campos abaixo (use null se não encontrar).
Para valorLote: calcule entrada + (parcelas * valorParcela) se não estiver explícito.
Para dataVencimento: formato YYYY-MM-DD usando o dia informado no texto e o próximo mês válido.

{
  "nomeComprador": string | null,
  "nacionalidade": string | null,
  "rg": string | null,
  "cpf": string | null,
  "estadoCivil": string | null,
  "profissao": string | null,
  "telefone1": string | null,
  "endereco": string | null,
  "numero": string | null,
  "bairro": string | null,
  "cidade": string | null,
  "estado": string | null,
  "cep": string | null,
  "numeroLote": string | null,
  "quadra": string | null,
  "empreendimentoNome": string | null,
  "valorLote": number | null,
  "valorEntrada": number | null,
  "valorParcela": number | null,
  "quantidadeParcelas": number | null,
  "dataVencimento": string | null,
  "vendedor": string | null
}
      `;

      const response = await genAI.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });

      const text = response.text;
      if (!text) throw new Error("IA não retornou resposta.");
      return JSON.parse(text);
    } catch {
      return extractLocallyFromText(rawText);
    }
  }
};
