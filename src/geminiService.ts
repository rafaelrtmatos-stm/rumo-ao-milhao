import { GoogleGenAI } from "@google/genai";

function extractLocallyFromText(rawText: string) {
  const cpfMatch = rawText.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
  const cepMatch = rawText.match(/\d{5}-?\d{3}/);
  const rgMatch = rawText.match(/RG[:\s]*([0-9.\-\/]+)/i);
  const loteMatch = rawText.match(/lote[:\s]*(\w+)/i);
  const quadraMatch = rawText.match(/quadra[:\s]*(\w+)/i);
  const parcelasMatch = rawText.match(/(\d+)\s*parcelas?/i);
  const valorLoteMatch = rawText.match(/valor[^R$\d]*R?\$?\s*([\d.,]+)/i);
  const entradaMatch = rawText.match(/entrada[^R$\d]*R?\$?\s*([\d.,]+)/i);
  const vendedorMatch = rawText.match(/vendedor[:\s]+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);
  const nomeMatch = rawText.match(/(?:nome|comprador|cliente)[:\s]+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);
  const cidadeMatch = rawText.match(/(?:cidade|munic[íi]pio)[:\s]+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);
  const estadoMatch = rawText.match(/\b([A-Z]{2})\b(?=\s*[-,\s]*\d{5}|\s*$)/m);
  const enderecoMatch = rawText.match(/(?:endere[çc]o|rua|av\.?|avenida)[:\s]+([^\n,]+)/i);
  const bairroMatch = rawText.match(/bairro[:\s]+([^\n,]+)/i);
  const cpfClean = cpfMatch ? cpfMatch[0].replace(/[^\d]/g, '') : null;
  const parseValue = (s: string | undefined) => {
    if (!s) return null;
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  };
  return {
    nomeComprador: nomeMatch ? nomeMatch[1].trim() : null,
    cpf: cpfClean,
    rg: rgMatch ? rgMatch[1].trim() : null,
    cep: cepMatch ? cepMatch[0].replace(/[^\d]/g, '') : null,
    cidade: cidadeMatch ? cidadeMatch[1].trim() : null,
    estado: estadoMatch ? estadoMatch[1].trim() : null,
    endereco: enderecoMatch ? enderecoMatch[1].trim() : null,
    bairro: bairroMatch ? bairroMatch[1].trim() : null,
    numeroLote: loteMatch ? loteMatch[1].trim() : null,
    quadra: quadraMatch ? quadraMatch[1].trim() : null,
    quantidadeParcelas: parcelasMatch ? parseInt(parcelasMatch[1]) : null,
    valorLote: parseValue(valorLoteMatch?.[1]),
    valorEntrada: parseValue(entradaMatch?.[1]),
    vendedor: vendedorMatch ? vendedorMatch[1].trim() : null,
    nacionalidade: null,
    estadoCivil: null,
    profissao: null,
    numero: null,
  };
}

export const geminiService = {
  async analyzeMap(file: File) {
    const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("API Key do Gemini não configurada.");
    }

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
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Data,
                mimeType: file.type
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) throw new Error("IA não retornou resposta.");
    
    return JSON.parse(text);
  },

  async extractSaleData(rawText: string) {
    const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return extractLocallyFromText(rawText);
    }

    try {
      const genAI = new GoogleGenAI({ apiKey });
      const prompt = `
        Você é um assistente de extração de dados imobiliários.
        Extraia os dados de venda e comprador do seguinte texto bruto: "${rawText}"
        
        Retorne APENAS um JSON com os seguintes campos (use null se não encontrar):
        {
          "nomeComprador": string,
          "nacionalidade": string,
          "rg": string,
          "cpf": string,
          "estadoCivil": string,
          "profissao": string,
          "endereco": string,
          "numero": string,
          "bairro": string,
          "cidade": string,
          "estado": string,
          "cep": string,
          "numeroLote": string,
          "quadra": string,
          "valorLote": number,
          "valorEntrada": number,
          "quantidadeParcelas": number,
          "vendedor": string
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
