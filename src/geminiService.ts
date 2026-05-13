import { GoogleGenAI } from "@google/genai";

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
    if (!apiKey) throw new Error("API Key do Gemini não configurada.");

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
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" }
    });

    const text = response.text;
    if (!text) throw new Error("IA não retornou resposta.");
    return JSON.parse(text);
  }
};
