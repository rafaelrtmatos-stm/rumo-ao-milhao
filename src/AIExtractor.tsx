import React, { useState } from 'react';
import { ClipboardPaste, Copy, CheckCircle2, ChevronDown, ChevronUp, X, RefreshCw } from 'lucide-react';

export interface ExtractedData {
  nome?: string;
  cpf?: string;
  rg?: string;
  estadoCivil?: string;
  nascimento?: string;
  telefone?: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  lote?: string;
  quadra?: string;
  empreendimento?: string;
  valorTotal?: number;
  entrada?: number;
  parcelas?: number;
  valorParcela?: number;
  vencimento?: number;
  vendedor?: string;
}

interface AIExtractorProps {
  onExtract: (data: ExtractedData) => void;
}

// ─── Parser: texto → objeto ───────────────────────────────────────────────────
function parseText(text: string): ExtractedData {
  const get = (label: string) => {
    const regex = new RegExp(`${label}[:\\s]+([^\\n]+)`, 'i');
    const m = text.match(regex);
    return m ? m[1].trim() : undefined;
  };

  const nome = get('NOME');
  const rg = get('RG');
  const cpf = get('CPF');
  const estadoCivil = get('ESTADO CIVIL');
  const nascimentoRaw = get('DATA DE ANIVERSÁRIO') || get('NASCIMENTO') || get('DATA NASC');
  const enderecoRaw = get('ENDEREÇO') || get('ENDERECO');
  const numero = get('Nº') || get('NUMERO') || get('NUM');
  const bairro = get('BAIRRO');
  const cepRaw = get('CEP');
  const contatoRaw = get('CONTATO') || get('TELEFONE') || get('FONE');
  const lote = get('LOTE');
  const quadra = get('QUADRA');
  const empreendimento = get('EMPREENDIMENTO');
  const vendedor = get('VENDEDOR');

  // Valor total
  const valorTotalRaw = get('VALOR TOTAL');
  const valorTotal = valorTotalRaw
    ? parseFloat(valorTotalRaw.replace(/[^\d,]/g, '').replace(',', '.'))
    : undefined;

  // Entrada
  const entradaRaw = get('ENTRADA');
  const entrada = entradaRaw
    ? parseFloat(entradaRaw.replace(/[^\d,]/g, '').replace(',', '.'))
    : undefined;

  // Parcelas e valor da parcela
  const parcelasRaw = get('QUANTIDADE DE PARCELAS') || get('PARCELAS');
  let parcelas: number | undefined;
  let valorParcela: number | undefined;
  if (parcelasRaw) {
    const mP = parcelasRaw.match(/(\d+)[xX]/);
    if (mP) parcelas = parseInt(mP[1]);
    const mV = parcelasRaw.match(/R\$\s?([\d.,]+)/i);
    if (mV) valorParcela = parseFloat(mV[1].replace(/\./g, '').replace(',', '.'));
  }

  // Vencimento
  const vencimentoRaw = get('DATA DE VENCIMENTO') || get('VENCIMENTO');
  const vencimento = vencimentoRaw ? parseInt(vencimentoRaw.replace(/\D/g, '')) : undefined;

  // CEP
  const cepMatch = (cepRaw || text).match(/\d{5}-?\d{3}/);
  const cep = cepMatch ? cepMatch[0].replace('-', '') : undefined;

  // Telefone (pega o primeiro número)
  const telMatch = (contatoRaw || text).match(/\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}/);
  const telefone = telMatch ? telMatch[0].replace(/\D/g, '') : undefined;

  // Nascimento → YYYY-MM-DD
  let nascimento: string | undefined;
  if (nascimentoRaw) {
    const mN = nascimentoRaw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (mN) nascimento = `${mN[3]}-${mN[2]}-${mN[1]}`;
  }

  return {
    nome, rg, cpf, estadoCivil, nascimento, telefone,
    endereco: enderecoRaw, numero, bairro, cep,
    lote, quadra, empreendimento, vendedor,
    valorTotal, entrada, parcelas, valorParcela, vencimento,
  };
}

// ─── Formatter: objeto → texto ────────────────────────────────────────────────
function formatText(f: ExtractedData): string {
  const fmtBRL = (v?: number) =>
    v ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '';

  const nascFormatted = f.nascimento
    ? f.nascimento.split('-').reverse().join('/')
    : '';

  const parcelasLine =
    f.parcelas && f.valorParcela
      ? `${f.parcelas}X DE ${fmtBRL(f.valorParcela)}`
      : f.parcelas
      ? `${f.parcelas}X`
      : '';

  const lines = [
    'CADASTRO DO COMPRADOR',
    f.nome        ? `NOME: ${f.nome.toUpperCase()}` : '',
    f.rg          ? `RG: ${f.rg}` : '',
    f.cpf         ? `CPF: ${f.cpf}` : '',
    f.estadoCivil ? `ESTADO CIVIL: ${f.estadoCivil.toUpperCase()}` : '',
    nascFormatted ? `DATA DE ANIVERSÁRIO: ${nascFormatted}` : '',
    f.endereco    ? `ENDEREÇO: ${f.endereco.toUpperCase()}` : '',
    f.numero      ? `Nº: ${f.numero}` : '',
    f.bairro      ? `BAIRRO: ${f.bairro.toUpperCase()}` : '',
    f.cep         ? `CEP: ${f.cep.replace(/^(\d{5})(\d{3})$/, '$1-$2')}` : '',
    f.telefone    ? `CONTATO: ${f.telefone}` : '',
    f.lote        ? `LOTE: ${f.lote}` : '',
    f.quadra      ? `QUADRA: ${f.quadra}` : '',
    f.empreendimento ? `EMPREENDIMENTO: ${f.empreendimento.toUpperCase()}` : '',
    f.valorTotal  ? `VALOR TOTAL: ${fmtBRL(f.valorTotal)}` : '',
    f.entrada     ? `ENTRADA: ${fmtBRL(f.entrada)}` : '',
    parcelasLine  ? `QUANTIDADE DE PARCELAS: ${parcelasLine}` : '',
    f.vencimento  ? `DATA DE VENCIMENTO: ${f.vencimento}` : '',
    f.vendedor    ? `VENDEDOR: ${f.vendedor}` : '',
  ].filter(Boolean);

  return lines.join('\n');
}

// ─── Component ────────────────────────────────────────────────────────────────
export const AIExtractor: React.FC<AIExtractorProps> = ({ onExtract }) => {
  const [form, setForm] = useState<ExtractedData>({});
  const [showForm, setShowForm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const set = (key: keyof ExtractedData, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value === '' ? undefined : value }));

  // Lê do clipboard e popula o form
  const handleReadClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        const parsed = parseText(text);
        setForm(parsed);
        setShowForm(true);
        setPasteMode(false);
      }
    } catch {
      setPasteMode(true);
      setShowForm(false);
    }
  };

  // Lê do textarea de paste manual
  const handleParsePaste = () => {
    const parsed = parseText(pasteText);
    setForm(parsed);
    setShowForm(true);
    setPasteMode(false);
    setPasteText('');
  };

  // Copia o texto gerado
  const handleCopy = async () => {
    const text = formatText(form);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  // Aplica no formulário principal
  const handleApply = () => {
    const clean: ExtractedData = {};
    for (const [k, v] of Object.entries(form)) {
      if (v !== undefined && v !== '') (clean as any)[k] = v;
    }
    onExtract(clean);
  };

  const fmtBRL = (v?: number) =>
    v ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '';

  const previewText = formatText(form);
  const hasData = Object.values(form).some((v) => v !== undefined && v !== '');

  return (
    <div className="card-premium border-slate-200 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-slate-100 text-slate-600 rounded-2xl">
            <ClipboardPaste size={20} />
          </div>
          <div>
            <h3 className="text-lg font-display font-bold text-slate-800">Ficha do Comprador</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              Cole, preencha e gere o texto formatado
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={handleReadClipboard} className="btn-primary px-4 py-2.5 text-sm">
            <ClipboardPaste size={15} />
            Ler Clipboard
          </button>
          <button
            type="button"
            onClick={() => { setPasteMode((v) => !v); setShowForm(false); }}
            className="btn-ghost px-4 py-2.5 text-sm"
          >
            <RefreshCw size={15} />
            Colar Texto
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="btn-ghost px-4 py-2.5 text-sm"
          >
            {showForm ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            Manual
          </button>
        </div>
      </div>

      {/* Modo: colar texto para parsear */}
      {pasteMode && (
        <div className="space-y-3">
          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
            Cole o texto da ficha abaixo:
          </p>
          <textarea
            autoFocus
            className="input-field min-h-[160px] resize-none font-mono text-xs leading-relaxed"
            placeholder={"NOME: FULANO DE TAL\nCPF: 000.000.000-00\nLOTE: 8\nQUADRA: 7\n..."}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setPasteMode(false)} className="btn-ghost px-5">
              <X size={15} /> Cancelar
            </button>
            <button
              type="button"
              onClick={handleParsePaste}
              disabled={!pasteText.trim()}
              className="btn-primary px-6 disabled:opacity-40"
            >
              <CheckCircle2 size={15} /> Ler e Preencher
            </button>
          </div>
        </div>
      )}

      {/* Formulário manual */}
      {showForm && (
        <div className="space-y-6 pt-1">
          {/* Comprador */}
          <div>
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">Comprador</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="sm:col-span-2 md:col-span-3">
                <label className="label">Nome Completo</label>
                <input className="input-field" placeholder="NOME COMPLETO" value={form.nome ?? ''} onChange={(e) => set('nome', e.target.value)} />
              </div>
              <div>
                <label className="label">CPF</label>
                <input className="input-field font-mono" placeholder="000.000.000-00" value={form.cpf ?? ''} onChange={(e) => set('cpf', e.target.value)} />
              </div>
              <div>
                <label className="label">RG</label>
                <input className="input-field font-mono" placeholder="RG" value={form.rg ?? ''} onChange={(e) => set('rg', e.target.value)} />
              </div>
              <div>
                <label className="label">Estado Civil</label>
                <select className="input-field font-semibold" value={form.estadoCivil ?? ''} onChange={(e) => set('estadoCivil', e.target.value)}>
                  <option value="">--</option>
                  <option>SOLTEIRO</option><option>SOLTEIRA</option>
                  <option>CASADO</option><option>CASADA</option>
                  <option>DIVORCIADO</option><option>DIVORCIADA</option>
                  <option>VIÚVO</option><option>VIÚVA</option>
                  <option>UNIÃO ESTÁVEL</option>
                </select>
              </div>
              <div>
                <label className="label">Data de Nascimento</label>
                <input type="date" className="input-field font-semibold" value={form.nascimento ?? ''} onChange={(e) => set('nascimento', e.target.value)} />
              </div>
              <div>
                <label className="label">Telefone</label>
                <input className="input-field font-mono" placeholder="93 99999-9999" value={form.telefone ?? ''} onChange={(e) => set('telefone', e.target.value)} />
              </div>
              <div>
                <label className="label">CEP</label>
                <input className="input-field font-mono" placeholder="00000-000" value={form.cep ?? ''} onChange={(e) => set('cep', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Endereço</label>
                <input className="input-field" placeholder="Rua / Comunidade" value={form.endereco ?? ''} onChange={(e) => set('endereco', e.target.value)} />
              </div>
              <div>
                <label className="label">Número</label>
                <input className="input-field" placeholder="S/N" value={form.numero ?? ''} onChange={(e) => set('numero', e.target.value)} />
              </div>
              <div>
                <label className="label">Bairro</label>
                <input className="input-field" placeholder="Bairro" value={form.bairro ?? ''} onChange={(e) => set('bairro', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Venda */}
          <div className="pt-4 border-t border-slate-100">
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">Venda</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              <div>
                <label className="label">Empreendimento</label>
                <input className="input-field" placeholder="Nome do loteamento" value={form.empreendimento ?? ''} onChange={(e) => set('empreendimento', e.target.value)} />
              </div>
              <div>
                <label className="label">Lote</label>
                <input className="input-field font-mono font-bold" placeholder="0" value={form.lote ?? ''} onChange={(e) => set('lote', e.target.value)} />
              </div>
              <div>
                <label className="label">Quadra</label>
                <input className="input-field font-mono font-bold" placeholder="A" value={form.quadra ?? ''} onChange={(e) => set('quadra', e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className="label">Valor Total (R$)</label>
                <input type="number" className="input-field font-bold" placeholder="0" value={form.valorTotal ?? ''} onChange={(e) => set('valorTotal', Number(e.target.value))} />
              </div>
              <div>
                <label className="label">Entrada (R$)</label>
                <input type="number" className="input-field font-bold" placeholder="0" value={form.entrada ?? ''} onChange={(e) => set('entrada', Number(e.target.value))} />
              </div>
              <div>
                <label className="label">Parcelas</label>
                <input type="number" className="input-field font-bold" placeholder="0" value={form.parcelas ?? ''} onChange={(e) => set('parcelas', Number(e.target.value))} />
              </div>
              <div>
                <label className="label">Valor Parcela (R$)</label>
                <input type="number" className="input-field font-bold" placeholder="0" value={form.valorParcela ?? ''} onChange={(e) => set('valorParcela', Number(e.target.value))} />
              </div>
              <div>
                <label className="label">Dia Vencimento</label>
                <input type="number" min={1} max={31} className="input-field font-bold" placeholder="10" value={form.vencimento ?? ''} onChange={(e) => set('vencimento', Number(e.target.value))} />
              </div>
              <div className="col-span-2">
                <label className="label">Vendedor(es)</label>
                <input className="input-field" placeholder="Nome do vendedor" value={form.vendedor ?? ''} onChange={(e) => set('vendedor', e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview do texto gerado + ações */}
      {hasData && (
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
              Texto gerado
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all border ${
                  copied
                    ? 'bg-success-main/10 text-success-main border-success-main/20'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                {copied ? 'Copiado!' : 'Copiar Texto'}
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="btn-primary px-5 py-2 text-sm"
              >
                <CheckCircle2 size={15} />
                Aplicar no Formulário
              </button>
              <button
                type="button"
                onClick={() => { setForm({}); setShowForm(false); }}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors border border-slate-200"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          <pre className="w-full bg-slate-900 text-green-400 text-[11px] font-mono leading-relaxed p-5 rounded-2xl overflow-x-auto whitespace-pre-wrap select-all border border-slate-800">
            {previewText}
          </pre>
        </div>
      )}
    </div>
  );
};
