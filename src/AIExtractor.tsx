import { useState } from "react";
import { Upload, FileText, Sparkles } from "lucide-react";

interface ExtractedData {
  nome?: string;
  cpf?: string;
  rg?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  lote?: string;
  quadra?: string;
  bairro?: string;
  tamanho?: string;
  dimensoes?: string;
  valorTotal?: number;
  entrada?: number;
  parcelas?: number;
  vencimento?: number;
}

export function AIExtractor({
  onExtract,
}: {
  onExtract: (data: ExtractedData) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const processWithAI = async (content: string, isImage: boolean = false) => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY || "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: isImage
                ? [
                    {
                      type: "image",
                      source: {
                        type: "base64",
                        media_type: "image/jpeg",
                        data: content,
                      },
                    },
                    {
                      type: "text",
                      text: "Extraia todos os dados de cliente e imóvel desta imagem. Retorne APENAS um JSON válido com os campos: nome, cpf, rg, telefone, email, endereco, lote, quadra, bairro, tamanho, dimensoes, valorTotal, entrada, parcelas, vencimento. Se não encontrar algum campo, omita.",
                    },
                  ]
                : [
                    {
                      type: "text",
                      text: `Extraia todos os dados de cliente e imóvel deste texto:\n\n${content}\n\nRetorne APENAS um JSON válido com os campos: nome, cpf, rg, telefone, email, endereco, lote, quadra, bairro, tamanho, dimensoes, valorTotal, entrada, parcelas, vencimento. Se não encontrar algum campo, omita.`,
                    },
                  ],
            },
          ],
        }),
      });

      if (!response.ok) throw new Error("Erro ao processar com IA");

      const data = await response.json();
      const textContent = data.content[0].text;
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);

      if (!jsonMatch) throw new Error("IA não retornou JSON válido");

      const extracted = JSON.parse(jsonMatch[0]);
      onExtract(extracted);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      processWithAI(base64, true);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-6 rounded-2xl border-2 border-emerald-200 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
          <Sparkles className="text-white" size={20} />
        </div>
        <div>
          <h3 className="font-bold text-emerald-900">
            Extração Inteligente com IA
          </h3>
          <p className="text-sm text-emerald-700">
            Envie foto ou cole os dados
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-emerald-800 mb-2">
            📸 Tirar foto ou escolher arquivo
          </label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileUpload}
            disabled={loading}
            className="w-full p-3 border-2 border-emerald-300 rounded-xl bg-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:font-bold hover:file:bg-emerald-700 cursor-pointer"
          />
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t-2 border-emerald-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-700 font-bold">
              OU
            </span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-emerald-800 mb-2">
            📝 Cole os dados brutos aqui
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={loading}
            placeholder="Cole aqui os dados do cliente e imóvel..."
            className="w-full p-4 border-2 border-emerald-300 rounded-xl bg-white min-h-[120px] focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        {error && (
          <div className="bg-red-50 border-2 border-red-200 text-red-700 p-3 rounded-xl text-sm font-bold">
            ⚠️ {error}
          </div>
        )}

        <button
          onClick={() => processWithAI(text)}
          disabled={loading || !text}
          className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold text-sm uppercase tracking-wider hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
              Processando com IA...
            </>
          ) : (
            <>
              <Sparkles size={18} />
              Extrair com IA
            </>
          )}
        </button>
      </div>
    </div>
  );
}
