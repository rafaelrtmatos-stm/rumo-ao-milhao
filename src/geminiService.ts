async function apiFetch(path: string, body: object): Promise<any> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Erro ${res.status}`);
  }
  return res.json();
}

function parseValue(s: string | undefined | null): number | null {
  if (!s) return null;
  const clean = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function extractLocallyFromText(rawText: string) {
  const text = rawText;
  const cpfMatch = text.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
  const cpf = cpfMatch ? cpfMatch[0].replace(/[^\d]/g, '') : null;
  const cepMatch = text.match(/\b\d{5}-?\d{3}\b/);
  const cep = cepMatch ? cepMatch[0].replace(/[^\d]/g, '') : null;
  const rgMatch = text.match(/\bRG[:\s#]*([0-9.\-\/]{5,15})/i);
  const rg = rgMatch ? rgMatch[1].trim() : null;
  const nascimentoMatch = text.match(/(?:nascimento|data\s*de\s*nasc\.?|aniversário|nasc\.?)[:\s]*(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})/i);
  const nascimento = nascimentoMatch
    ? (() => {
        const [, d, m, y] = nascimentoMatch;
        const year = y.length === 2 ? `19${y}` : y;
        return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      })()
    : null;
  const nomeMatch = text.match(/(?:nome|comprador|cliente)[:\s]+([A-ZÀ-Ú][a-zà-úA-ZÀ-Ú ]+?)(?=\s*(?:cpf|rg|fone|tel|cep|rua|av\.|nascimento|estado|solteiro|casado|,|\n|$))/i);
  const nomeComprador = nomeMatch ? nomeMatch[1].trim() : null;
  const estadoCivilMatch = text.match(/\b(solteiro|solteira|casado|casada|divorciado|divorciada|vi[uú]vo|vi[uú]va|separado|separada|uni[aã]o est[aá]vel)\b/i);
  const estadoCivil = estadoCivilMatch ? estadoCivilMatch[1].toLowerCase()
    .replace(/solteira/, 'solteiro').replace(/casada/, 'casado')
    .replace(/divorciada/, 'divorciado').replace(/vi[uú]va/, 'viúvo')
    .replace(/vi[uú]vo/, 'viúvo').replace(/separada/, 'separado') : null;
  const allPhones = [...text.matchAll(/(?:(?:fone|tel\.?|celular|whatsapp|contato)[\s:]*)?(?:\+55[\s-]?)?\(?\d{2}\)?[\s]?\d{4,5}[-\s]?\d{4}/gi)];
  const telefone1 = allPhones[0] ? allPhones[0][0].replace(/[^\d]/g, '') : null;
  const telefone2 = allPhones[1] ? allPhones[1][0].replace(/[^\d]/g, '') : null;
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
  const bairroCidadeMatch = text.match(/bairro[:\s]+([^,\n]+?)[,\s]+(?:cidade[:\s]+)?([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);
  const bairroMatch = text.match(/bairro[:\s]+([^,\n\-–]+)/i);
  const cidadeMatch = text.match(/(?:cidade|munic[íi]pio)[:\s]+([^,\n\-–]+)/i);
  const bairro = bairroCidadeMatch ? bairroCidadeMatch[1].trim() : (bairroMatch ? bairroMatch[1].trim() : null);
  const cidade = bairroCidadeMatch ? bairroCidadeMatch[2].trim() : (cidadeMatch ? cidadeMatch[1].trim() : null);
  const estadoMatch = text.match(/\b([A-Z]{2})\b(?=[\s,\-]*(?:\d{5}|$))/m);
  const estado = estadoMatch ? estadoMatch[1] : null;
  const loteMatch = text.match(/\blote[:\s#]*(\w+)/i);
  const quadraMatch = text.match(/\bquadra[:\s#]*(\w+)/i);
  const numeroLote = loteMatch ? loteMatch[1].trim() : null;
  const quadra = quadraMatch ? quadraMatch[1].trim() : null;
  const empMatch = text.match(/(?:empreendimento|loteamento|terreno|residencial|fazenda|parque)[:\s]+([^\n,;]+)/i);
  const empreendimentoNome = empMatch ? empMatch[1].trim() : null;
  const pagamentoMatch = text.match(/entrada\s*R?\$?\s*([\d.,]+)\s+(\d+)\s*[xX]\s*R?\$?\s*([\d.,]+)/i);
  const parcelasMatch = text.match(/(\d+)\s*[xX]\s*R?\$?\s*([\d.,]+)/i);
  const entradaMatch = text.match(/entrada\s*(?:de\s*)?R?\$?\s*([\d.,]+)/i);
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
    if (parcelasMatch) { quantidadeParcelas = parseInt(parcelasMatch[1]); valorParcela = parseValue(parcelasMatch[2]); }
  }
  if (valorEntrada !== null && quantidadeParcelas !== null && valorParcela !== null) {
    valorLote = valorEntrada + quantidadeParcelas * valorParcela;
  } else if (valorTotalMatch) {
    valorLote = parseValue(valorTotalMatch[1]);
  }
  const vencimentoMatch = text.match(/vencimento[:\s]*(\d{1,2})/i);
  let dataVencimento: string | null = null;
  if (vencimentoMatch) {
    const dia = parseInt(vencimentoMatch[1]);
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1;
    if (dia <= now.getDate()) { month += 1; if (month > 12) { month = 1; year += 1; } }
    dataVencimento = `${year}-${String(month).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }
  const vendedorMatch = text.match(/vendedor[:\s]+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);
  const vendedor = vendedorMatch ? vendedorMatch[1].trim() : null;
  const nacionalidadeMatch = text.match(/(?:nacionalidade|naturalidade)[:\s]+([a-zà-úA-ZÀ-Ú]+)/i);
  const nacionalidade = nacionalidadeMatch ? nacionalidadeMatch[1].trim() : null;
  const profissaoMatch = text.match(/(?:profiss[aã]o|ocupa[çc][aã]o)[:\s]+([^\n,;]+)/i);
  const profissao = profissaoMatch ? profissaoMatch[1].trim() : null;
  return { nomeComprador, cpf, rg, nascimento, cep, estadoCivil, telefone1, telefone2, endereco, numero, bairro, cidade, estado, numeroLote, quadra, empreendimentoNome, valorEntrada, valorParcela, quantidadeParcelas, valorLote, dataVencimento, vendedor, nacionalidade, profissao };
}

export const geminiService = {

  async analyzeMap(file: File) {
    const base64Data = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    try {
      return await apiFetch('/api/gemini/analyze-map', { base64Data, mimeType: file.type });
    } catch {
      return { quadras: [], resumo: '' };
    }
  },

  async extractFromFiles(files: File[]) {
    const fileData = await Promise.all(files.map(async (file) => {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });
      return { base64, mimeType: file.type };
    }));
    try {
      return await apiFetch('/api/gemini/extract-files', { files: fileData });
    } catch {
      return extractLocallyFromText('');
    }
  },

  async extractSaleData(rawText: string) {
    try {
      return await apiFetch('/api/gemini/extract-sale', { rawText });
    } catch {
      return extractLocallyFromText(rawText);
    }
  },
};
