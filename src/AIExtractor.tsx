import React, { useState, useRef } from 'react';
import { Sparkles, RefreshCw, ClipboardPaste, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExtractedData {
  // Cliente
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
  // Venda
  lote?: string;
  quadra?: string;
  valorTotal?: number;
  entrada?: number;
  parcelas?: number;
  vencimento?: number; // dia do mês
}

interface AIExtractorProps {
  onExtract: (data: ExtractedData) => void;
}

// ─── Status Types ────────────────────────────────────────────────────────────

type Status = 'idle' | 'loading' | 'success' | 'error';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Você é um assistente especializado em extrair dados de textos relacionados a vendas de lotes imobiliários.

Analise o texto fornecido e extraia os dados disponíveis no formato JSON abaixo. Use null para campos não encontrados. Retorne APENAS o JSON, sem markdown, sem explicações.

{
  "nome": "Nome completo do comprador",
  "cpf": "CPF apenas dígitos",
  "rg": "RG como está no texto",
  "telefone": "Telefone apenas dígitos",
  "email": "Email se houver",
  "endereco": "Logradouro (rua, av, travessa)",
  "bairro": "Bairro",
  "cidade": "Cidade",
  "estado": "UF com 2 letras",
  "cep": "CEP apenas dígitos",
  "lote": "Número do lote como string",
  "quadra": "Identificador da quadra",
  "valorTotal": 0,
  "entrada": 0,
  "parcelas": 0,
  "vencimento": 0
}

Regras:
- valorTotal, entrada: valores numéricos em reais (ex: 45000.00)
- parcelas: quantidade de parcelas (número inteiro)
- vencimento: dia do mês para vencimento (1-31)
- Para campos numéricos sem dados, use 0 (não null)
- Para campos texto sem dados, use null`;

async function callClaudeAPI(text: string): Promise<ExtractedData> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Extraia os dados deste texto:\n\n${text}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any)?.error?.message || `Erro HTTP ${response.status}`);
  }

  const data = await response.json();
  const raw = data.content
    .map((item: any) => (item.type === 'text' ? item.text : ''))
    .join('');

  const cleaned = raw.replace(/```json|```/g, '').trim();
  const parsed: Record<string, any> = JSON.parse(cleaned);

  // Sanitize: remove null values so existing data isn't overwritten
  const result: ExtractedData = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v !== null && v !== '' && v !== 0) {
      (result as any)[k] = v;
    }
  }
  return result;
}

// ─── Preview badge ────────────────────────────────────────────────────────────

const FieldBadge = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-start gap-2 py-1.5 border-b border-slate-100 last:border-0">
    <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 w-20 shrink-0 mt-0.5">
      {label}
    </span>
    <span className="text-xs font-semibold text-slate-700 break-all">{value}</span>
  </div>
);

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

// ─── Component ────────────────────────────────────────────────────────────────

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
      setRawText(text);
      textareaRef.current?.focus();
    } catch {
      textareaRef.current?.focus();
    }
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
      console.error('[AIExtractor]', err);
      setErrorMsg(err?.message || 'Erro desconhecido. Tente novamente.');
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

  // Build preview fields from extracted data
  const previewFields: { label: string; value: string }[] = extracted
    ? [
        extracted.nome && { label: 'Nome', value: extracted.nome },
        extracted.cpf && { label: 'CPF', value: extracted.cpf },
        extracted.rg && { label: 'RG', value: extracted.rg },
        extracted.telefone && { label: 'Telefone', value: extracted.telefone },
        extracted.email && { label: 'E-mail', value: extracted.email },
        extracted.cep && { label: 'CEP', value: extracted.cep },
        extracted.endereco && { label: 'Endereço', value: extracted.endereco },
        extracted.bairro && { label: 'Bairro', value: extracted.bairro },
        extracted.cidade && { label: 'Cidade', value: `${extracted.cidade}${extracted.estado ? ` / ${extracted.estado}` : ''}` },
        extracted.quadra && { label: 'Quadra', value: extracted.quadra },
        extracted.lote && { label: 'Lote', value: extracted.lote },
        extracted.valorTotal && { label: 'Valor Total', value: formatCurrency(extracted.valorTotal) },
        extracted.entrada && { label: 'Entrada', value: formatCurrency(extracted.entrada) },
        extracted.parcelas && { label: 'Parcelas', value: `${extracted.parcelas}x` },
        extracted.vencimento && { label: 'Vencimento', value: `Dia ${extracted.vencimento}` },
      ].filter(Boolean) as { label: string; value: string }[]
    : [];

  return (
    <div className="card-premium bg-gradient-to-br from-primary-main/[0.03] to-transparent border-primary-main/10 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary-main text-primary-contrast rounded-2xl shadow-lg shadow-primary-main/20">
          <Sparkles size={20} />
        </div>
        <div>
          <h3 className="text-lg font-display font-bold text-slate-800">
            Auto-preenchimento Inteligente
          </h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
            Cole qualquer texto com dados do comprador ou da venda
          </p>
        </div>
      </div>

      {/* Textarea */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          className="input-field min-h-[120px] resize-none pr-28 font-mono text-xs leading-relaxed"
          placeholder="Cole aqui um print de conversa de WhatsApp, e-mail, ficha preenchida, dados brutos..."
          value={rawText}
          onChange={(e) => {
            setRawText(e.target.value);
            if (status !== 'idle') {
              setStatus('idle');
              setExtracted(null);
            }
          }}
          disabled={status === 'loading'}
        />
        {/* Paste shortcut */}
        <button
          type="button"
          onClick={handlePaste}
          title="Colar da área de transferência"
          className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl transition-colors text-[10px] font-bold uppercase tracking-widest"
        >
          <ClipboardPaste size={13} />
          Colar
        </button>
      </div>

      {/* Actions row */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <button
          type="button"
          disabled={status === 'loading' || !rawText.trim()}
          onClick={handleExtract}
          className="btn-primary px-8 w-full sm:w-auto"
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
          <button
            type="button"
            onClick={handleReset}
            className="btn-ghost px-6 w-full sm:w-auto text-slate-400"
          >
            <span>Limpar</span>
          </button>
        )}

        {/* Status badge */}
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

      {/* Error message */}
      {status === 'error' && errorMsg && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-xs text-red-600 font-semibold">
          <span className="font-bold uppercase tracking-wider">Erro: </span>
          {errorMsg}
        </div>
      )}

      {/* Preview accordion */}
      {status === 'success' && previewFields.length > 0 && (
        <div className="border border-primary-main/10 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 bg-primary-main/5 hover:bg-primary-main/10 transition-colors"
          >
            <span className="text-[10px] font-extrabold text-primary-main uppercase tracking-widest">
              Dados extraídos — clique para {showPreview ? 'ocultar' : 'conferir'}
            </span>
            {showPreview ? (
              <ChevronUp size={16} className="text-primary-main" />
            ) : (
              <ChevronDown size={16} className="text-primary-main" />
            )}
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

      {/* Empty extraction notice */}
      {status === 'success' && previewFields.length === 0 && (
        <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-xs text-amber-700 font-semibold">
          A IA não encontrou dados reconhecíveis no texto. Tente com um texto mais detalhado.
        </div>
      )}
    </div>
  );
};
