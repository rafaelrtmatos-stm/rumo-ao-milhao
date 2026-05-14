import { createClient } from '@supabase/supabase-js';
import { Empreendimento, Cliente, Venda, AppConfig } from './types';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

// ─── Converters ───────────────────────────────────────────────────────────────

function rowToEmpreendimento(r: any): Empreendimento {
  return {
    id: r.id,
    nome: r.nome,
    endereco: r.endereco ?? '',
    cidade: r.cidade ?? '',
    estado: r.estado ?? '',
    totalLotes: r.total_lotes ?? 0,
    descricao: r.descricao ?? '',
    lotesVendidos: r.lotes_vendidos ?? 0,
    comunidade: r.comunidade,
    quadras: r.quadras,
    ruas: r.ruas,
    lotesInfo: r.lotes_info ?? {},
  };
}

function empreendimentoToRow(d: Empreendimento) {
  return {
    id: d.id,
    nome: d.nome,
    endereco: d.endereco,
    cidade: d.cidade,
    estado: d.estado,
    total_lotes: d.totalLotes,
    descricao: d.descricao,
    lotes_vendidos: d.lotesVendidos,
    comunidade: d.comunidade,
    quadras: d.quadras,
    ruas: d.ruas,
    lotes_info: d.lotesInfo ?? {},
  };
}

function rowToCliente(r: any): Cliente {
  return {
    id: r.id,
    nome: r.nome,
    nacionalidade: r.nacionalidade ?? 'Brasileira',
    genero: r.genero ?? 'M',
    rg: r.rg ?? '',
    cpf: r.cpf ?? '',
    estadoCivil: r.estado_civil ?? '',
    profissao: r.profissao ?? '',
    nascimento: r.nascimento ?? '',
    cep: r.cep ?? '',
    endereco: r.endereco ?? '',
    numero: r.numero ?? '',
    bairro: r.bairro ?? '',
    cidade: r.cidade ?? '',
    estado: r.estado ?? '',
    telefone1: r.telefone1 ?? '',
    telefone2: r.telefone2,
    dataCadastro: r.data_cadastro ?? '',
  };
}

function clienteToRow(c: Cliente) {
  return {
    id: c.id,
    nome: c.nome,
    nacionalidade: c.nacionalidade,
    genero: c.genero,
    rg: c.rg,
    cpf: c.cpf,
    estado_civil: c.estadoCivil,
    profissao: c.profissao,
    nascimento: c.nascimento,
    cep: c.cep,
    endereco: c.endereco,
    numero: c.numero,
    bairro: c.bairro,
    cidade: c.cidade,
    estado: c.estado,
    telefone1: c.telefone1,
    telefone2: c.telefone2,
    data_cadastro: c.dataCadastro,
  };
}

function rowToVenda(r: any): Venda {
  return {
    id: r.id,
    numeroContrato: r.numero_contrato ?? '',
    clienteId: r.cliente_id ?? '',
    clienteNome: r.cliente_nome ?? '',
    empreendimentoId: r.empreendimento_id ?? '',
    empreendimentoNome: r.empreendimento_nome ?? '',
    numeroLote: r.numero_lote ?? '',
    quadra: r.quadra ?? '',
    rua: r.rua ?? '',
    valorLote: r.valor_lote ?? 0,
    valorEntrada: r.valor_entrada ?? 0,
    quantidadeParcelas: r.quantidade_parcelas ?? 0,
    valorParcela: r.valor_parcela ?? 0,
    dataVencimento: r.data_vencimento ?? '',
    vendedor: r.vendedor ?? '',
    dataVenda: r.data_venda ?? '',
    custo: r.custo ?? 0,
    comissao: r.comissao ?? 0,
    formaPagamento: r.forma_pagamento ?? '',
    status: r.status ?? 'pendente',
    comprador2: r.comprador2,
  };
}

function vendaToRow(v: Venda) {
  return {
    id: v.id,
    numero_contrato: v.numeroContrato,
    cliente_id: v.clienteId,
    cliente_nome: v.clienteNome,
    empreendimento_id: v.empreendimentoId,
    empreendimento_nome: v.empreendimentoNome,
    numero_lote: v.numeroLote,
    quadra: v.quadra,
    rua: v.rua,
    valor_lote: v.valorLote,
    valor_entrada: v.valorEntrada,
    quantidade_parcelas: v.quantidadeParcelas,
    valor_parcela: v.valorParcela,
    data_vencimento: v.dataVencimento,
    vendedor: v.vendedor,
    data_venda: v.dataVenda,
    custo: v.custo,
    comissao: v.comissao,
    forma_pagamento: v.formaPagamento,
    status: v.status ?? 'pendente',
    comprador2: v.comprador2 ?? null,
  };
}

// ─── dbService ────────────────────────────────────────────────────────────────

export const dbService = {

  // ── Empreendimentos ──────────────────────────────────────────────────────────

  async getEmpreendimentos(): Promise<Empreendimento[]> {
    const { data, error } = await supabase
      .from('empreendimentos')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToEmpreendimento);
  },

  async saveEmpreendimentos(items: Empreendimento[]): Promise<void> {
    for (const item of items) {
      const { error } = await supabase
        .from('empreendimentos')
        .upsert(empreendimentoToRow(item), { onConflict: 'id' });
      if (error) throw error;
    }
  },

  async deleteEmpreendimento(id: string): Promise<void> {
    const { error } = await supabase
      .from('empreendimentos')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // ── Clientes ─────────────────────────────────────────────────────────────────

  async getClientes(): Promise<Cliente[]> {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToCliente);
  },

  async saveClientes(items: Cliente[]): Promise<void> {
    for (const item of items) {
      const { error } = await supabase
        .from('clientes')
        .upsert(clienteToRow(item), { onConflict: 'id' });
      if (error) throw error;
    }
  },

  // ── Vendas ───────────────────────────────────────────────────────────────────

  async getVendas(): Promise<Venda[]> {
    const { data, error } = await supabase
      .from('vendas')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToVenda);
  },

  async saveVendas(items: Venda[]): Promise<void> {
    for (const item of items) {
      const { error } = await supabase
        .from('vendas')
        .upsert(vendaToRow(item), { onConflict: 'id' });
      if (error) throw error;
    }
  },

  // ── AppConfig ────────────────────────────────────────────────────────────────

  async getAppConfig(): Promise<AppConfig> {
    const { data, error } = await supabase
      .from('app_config')
      .select('*')
      .eq('id', 1)
      .single();
    if (error || !data) return { theme: 'standard' };
    return { theme: data.theme ?? 'standard' };
  },

  async saveAppConfig(config: AppConfig): Promise<void> {
    const { error } = await supabase
      .from('app_config')
      .upsert({ id: 1, theme: config.theme, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;
  },

  // ── Realtime ─────────────────────────────────────────────────────────────────

  subscribeToVendas(callback: (vendas: Venda[]) => void) {
    return supabase
      .channel('realtime-vendas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendas' }, async () => {
        const vendas = await dbService.getVendas();
        callback(vendas);
      })
      .subscribe();
  },

  subscribeToEmpreendimentos(callback: (devs: Empreendimento[]) => void) {
    return supabase
      .channel('realtime-empreendimentos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'empreendimentos' }, async () => {
        const devs = await dbService.getEmpreendimentos();
        callback(devs);
      })
      .subscribe();
  },

  subscribeToClientes(callback: (clientes: Cliente[]) => void) {
    return supabase
      .channel('realtime-clientes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, async () => {
        const clientes = await dbService.getClientes();
        callback(clientes);
      })
      .subscribe();
  },

  // ── Migração localStorage → Supabase ─────────────────────────────────────────

  async migrateFromLocalStorage(): Promise<{ ok: boolean; msg: string }> {
    try {
      const rawDevs = localStorage.getItem('lotes_empreendimentos');
      const rawClientes = localStorage.getItem('lotes_clientes');
      const rawVendas = localStorage.getItem('lotes_vendas');

      const devs: Empreendimento[] = rawDevs ? JSON.parse(rawDevs) : [];
      const clientes: Cliente[] = rawClientes ? JSON.parse(rawClientes) : [];
      const vendas: Venda[] = rawVendas ? JSON.parse(rawVendas) : [];

      if (!devs.length && !clientes.length && !vendas.length) {
        return { ok: false, msg: 'Nenhum dado encontrado no localStorage para migrar.' };
      }

      if (devs.length) await dbService.saveEmpreendimentos(devs);
      if (clientes.length) await dbService.saveClientes(clientes);
      if (vendas.length) await dbService.saveVendas(vendas);

      localStorage.removeItem('lotes_empreendimentos');
      localStorage.removeItem('lotes_clientes');
      localStorage.removeItem('lotes_vendas');
      localStorage.removeItem('lotes_config');

      return {
        ok: true,
        msg: `Migração concluída! ${devs.length} empreendimento(s), ${clientes.length} cliente(s) e ${vendas.length} venda(s) migrados para o Supabase.`,
      };
    } catch (err) {
      console.error('migrateFromLocalStorage:', err);
      return { ok: false, msg: 'Erro durante a migração. Verifique o console.' };
    }
  },
};
