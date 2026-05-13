import React, { useState, useRef } from 'react';
import { Sparkles, RefreshCw, ClipboardPaste, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

export interface ExtractedData {
  nome?: string;
  cpf?: string;
  rg?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  lote?: string;
  quadra?: string;
  valorTotal?: number;
  entrada?: number;
  parcelas?: number;
  vencimento?: number;
}

interface AIExtractorProps {
  onExtract: (data: ExtractedData) => void;
}

type Status = 'idle' | 'loading' | 'success' | 'error';

const SYSTEM_PROMPT = `Você é um assistente especializado em extrair dados de textos relacionados a vendas de lotes imobiliários.

Analise o texto fornecido e extraia os dados disponíveis. Retorne APENAS um objeto JSON válido, sem markdown, sem texto antes ou depois, sem explicações.

Formato exato:
{"nome":null,"cpf":null,"rg":null,"telefone":null,"email":null,"endereco":null,"bairro":null,"cidade":null,"estado":null,"cep":null,"lote":null,"quadra":null,"valorTotal":0,"entrada":0,"parcelas":0,"vencimento":0}

Regras:
- valorTotal e entrada: número em reais sem formatação (ex: 25500)
- parcelas: quantidade inteira (ex: 80)
- vencimento: dia do mês 1-31 (ex: 10)
- Strings não encontradas: null
- Números não encontrados: 0
- cpf: apenas dígitos, sem pontos ou traços
- telefone: apenas dígitos`;

async function callClaudeAPI(text: string): Promise<ExtractedData> {
  const apiKey =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_ANTHROPIC_API_KEY) ||
    (typeof window !== 'undefined' && (window as any).__ANTHROPIC_KEY__) ||
    '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };

  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Texto para extração:\n\n${text}` }],
      }),
    });
  } catch (networkErr: any) {
    throw new Error(
      `Erro de rede: ${networkErr?.message || networkErr}. Verifique se a API key está configurada nos Secrets do Replit como VITE_ANTHROPIC_API_KEY.`
    );
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      detail = errBody?.error?.message || JSON.stringify(errBody);
    } catch {}
    throw new Error(`API retornou erro ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const rawText: string = data.content
    .map((item: any) => (item.type === 'text' ? item.text : ''))
    .join('')
    .trim();

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Resposta sem JSON válido: "${rawText.slice(0, 200)}"`);
  }

  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error(`Falha no parse do JSON: ${jsonMatch[0].slice(0, 200)}`);
  }

  const result: ExtractedData = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v !== null && v !== '' && v !== 0) {
      (result as any)[k] = v;
    }
  }
  return result;
}

const FieldBadge = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-start gap-2 py-1.5 border-b border-slate-100 last:border-0">
    <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 w-20 shrink-0 mt-0.5">
      {label}
    </span>
    <span className="text-xs font-semibold text-slate-700 break-all">{value}</span>
  </div>
);

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export const AIExtractor: React.FC<AIExtractorProps> = ({ onExtract }) => {
  const [rawText, setRawText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setRawText(text);
    } catch {}
    textareaRef.current?.focus();
  };

  const handleExtract = async () => {
    if (!rawText.trim()) return;
    setStatus('loading');
    setErrorMsg('');
    setExtracted(null);
    setShowPreview(false);

    try {
      const data = await callClaudeAPI(rawText);
      setExtracted(data);
      setStatus('success');
      setShowPreview(true);
      onExtract(data);
    } catch (err: any) {
      console.error('[AIExtractor] Erro:', err);
      setErrorMsg(err?.message ?? 'Erro desconhecido.');
      setStatus('error');
    }
  };

  const handleReset = () => {
    setRawText('');
    setStatus('idle');
    setErrorMsg('');
    setExtracted(null);
    setShowPreview(false);
  };

  const previewFields: { label: string; value: string }[] = extracted
    ? ([
        extracted.nome && { label: 'Nome', value: extracted.nome },
        extracted.cpf && { label: 'CPF', value: extracted.cpf },
        extracted.rg && { label: 'RG', value: extracted.rg },
        extracted.telefone && { label: 'Tel.', value: extracted.telefone },
        extracted.email && { label: 'E-mail', value: extracted.email },
        extracted.cep && { label: 'CEP', value: extracted.cep },
        extracted.endereco && { label: 'Endereço', value: extracted.endereco },
        extracted.bairro && { label: 'Bairro', value: extracted.bairro },
        (extracted.cidade || extracted.estado) && {
          label: 'Cidade',
          value: [extracted.cidade, extracted.estado].filter(Boolean).join(' / '),
        },
        extracted.quadra && { label: 'Quadra', value: extracted.quadra },
        extracted.lote && { label: 'Lote', value: extracted.lote },
        extracted.valorTotal && { label: 'Total', value: fmt(extracted.valorTotal) },
        extracted.entrada && { label: 'Entrada', value: fmt(extracted.entrada) },
        extracted.parcelas && { label: 'Parcelas', value: `${extracted.parcelas}x` },
        extracted.vencimento && { label: 'Venc.', value: `Dia ${extracted.vencimento}` },
      ].filter(Boolean) as { label: string; value: string }[])
    : [];

  return (
    <div className="card-premium bg-gradient-to-br from-primary-main/[0.03] to-transparent border-primary-main/10 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary-main text-primary-contrast rounded-2xl shadow-lg shadow-primary-main/20">
          <Sparkles size={20} />
        </div>
        <div>
          <h3 className="text-lg font-display font-bold text-slate-800">
            Auto-preenchimento Inteligente
          </h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
            Cole texto bruto — WhatsApp, e-mail, ficha preenchida
          </p>
        </div>
      </div>

      <div className="relative">
        <textarea
          ref={textareaRef}
          className="input-field min-h-[120px] resize-none pr-28 font-mono text-xs leading-relaxed"
          placeholder="Cole aqui os dados do comprador ou da venda (nome, CPF, lote, valores, parcelas...)"
          value={rawText}
          onChange={(e) => {
            setRawText(e.target.value);
            if (status !== 'idle') handleReset();
          }}
          disabled={status === 'loading'}
        />
        <button
          type="button"
          onClick={handlePaste}
          className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl transition-colors text-[10px] font-bold uppercase tracking-widest"
        >
          <ClipboardPaste size={13} />
          Colar
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <button
          type="button"
          disabled={status === 'loading' || !rawText.trim()}
          onClick={handleExtract}
          className="btn-primary px-8 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'loading' ? (
            <>
              <RefreshCw size={18} className="animate-spin" />
              <span>Analisando com IA...</span>
            </>
          ) : (
            <>
              <Sparkles size={18} />
              <span>Preencher Automaticamente</span>
            </>
          )}
        </button>

        {(status === 'success' || status === 'error') && (
          <button type="button" onClick={handleReset} className="btn-ghost px-6 w-full sm:w-auto text-slate-400">
            Limpar
          </button>
        )}

        {status === 'success' && previewFields.length > 0 && (
          <span className="flex items-center gap-1.5 text-[10px] font-extrabold text-success-main uppercase tracking-widest ml-auto">
            <CheckCircle2 size={14} />
            {previewFields.length} campo{previewFields.length !== 1 ? 's' : ''} preenchido{previewFields.length !== 1 ? 's' : ''}
          </span>
        )}

        {status === 'error' && (
          <span className="flex items-center gap-1.5 text-[10px] font-extrabold text-red-500 uppercase tracking-widest ml-auto">
            <XCircle size={14} />
            Falha na extração
          </span>
        )}
      </div>

      {status === 'error' && errorMsg && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl space-y-2">
          <p className="text-[10px] font-extrabold text-red-600 uppercase tracking-widest">Detalhes do erro:</p>
          <p className="text-xs text-red-600 font-medium break-words">{errorMsg}</p>
          <p className="text-[10px] text-red-400 font-bold pt-1 border-t border-red-100">
            💡 No Replit: vá em <strong>Secrets</strong> (cadeado na barra lateral) e adicione a variável{' '}
            <code className="bg-red-100 px-1 rounded font-mono">VITE_ANTHROPIC_API_KEY</code> com sua chave da Anthropic.
          </p>
        </div>
      )}

      {status === 'success' && previewFields.length > 0 && (
        <div className="border border-primary-main/10 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 bg-primary-main/5 hover:bg-primary-main/10 transition-colors"
          >
            <span className="text-[10px] font-extrabold text-primary-main uppercase tracking-widest">
              Dados extraídos — {showPreview ? 'ocultar' : 'conferir'}
            </span>
            {showPreview ? <ChevronUp size={16} className="text-primary-main" /> : <ChevronDown size={16} className="text-primary-main" />}
          </button>

          {showPreview && (
            <div className="px-5 py-4 bg-white grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              {previewFields.map((f) => (
                <FieldBadge key={f.label} label={f.label} value={f.value} />
              ))}
            </div>
          )}
        </div>
      )}

      {status === 'success' && previewFields.length === 0 && (
        <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-xs text-amber-700 font-semibold">
          A IA não encontrou dados reconhecíveis. Tente com um texto mais detalhado.
        </div>
      )}
    </div>
  );
};
