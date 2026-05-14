import { Empreendimento, Cliente, Venda, AppConfig } from './types';
import { supabase } from './lib/supabase';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toRows<T extends { id: string }>(items: T[], userId: string) {
  return items.map((item) => ({ id: item.id, user_id: userId, data: item }));
}

async function getUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Unauthorized');
  return data.user.id;
}

// ---------------------------------------------------------------------------
// Realtime subscriptions (substitui o polling de 15s)
// ---------------------------------------------------------------------------

function subscribeTable<T>(
  table: string,
  fetchFn: () => Promise<T>,
  callback: (data: T) => void,
) {
  // Busca imediata ao assinar
  fetchFn().then(callback).catch(() => {});

  const channel = supabase
    .channel(`realtime:${table}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
      fetchFn().then(callback).catch(() => {});
    })
    .subscribe();

  return { unsubscribe: () => supabase.removeChannel(channel) };
}

// ---------------------------------------------------------------------------
// dbService
// ---------------------------------------------------------------------------

export const dbService = {

  // ---- Empreendimentos ----

  async getEmpreendimentos(): Promise<Empreendimento[]> {
    const { data, error } = await supabase
      .from('empreendimentos')
      .select('data')
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.data as Empreendimento);
  },

  async saveEmpreendimentos(items: Empreendimento[]): Promise<void> {
    const userId = await getUserId();
    const rows = toRows(items, userId);

    // Apaga tudo do usuário e reinsepe (comportamento original do servidor)
    const { error: delErr } = await supabase
      .from('empreendimentos')
      .delete()
      .eq('user_id', userId);
    if (delErr) throw new Error(delErr.message);

    if (rows.length === 0) return;

    const { error: insErr } = await supabase
      .from('empreendimentos')
      .insert(rows);
    if (insErr) throw new Error(insErr.message);
  },

  async deleteEmpreendimento(id: string): Promise<void> {
    const { error } = await supabase
      .from('empreendimentos')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ---- Clientes ----

  async getClientes(): Promise<Cliente[]> {
    const { data, error } = await supabase
      .from('clientes')
      .select('data')
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.data as Cliente);
  },

  async saveClientes(items: Cliente[]): Promise<void> {
    const userId = await getUserId();
    const rows = toRows(items, userId);

    const { error: delErr } = await supabase
      .from('clientes')
      .delete()
      .eq('user_id', userId);
    if (delErr) throw new Error(delErr.message);

    if (rows.length === 0) return;

    const { error: insErr } = await supabase
      .from('clientes')
      .insert(rows);
    if (insErr) throw new Error(insErr.message);
  },

  // ---- Vendas ----

  async getVendas(): Promise<Venda[]> {
    const { data, error } = await supabase
      .from('vendas')
      .select('data')
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.data as Venda);
  },

  async saveVendas(items: Venda[]): Promise<void> {
    const userId = await getUserId();
    const rows = toRows(items, userId);

    const { error: delErr } = await supabase
      .from('vendas')
      .delete()
      .eq('user_id', userId);
    if (delErr) throw new Error(delErr.message);

    if (rows.length === 0) return;

    const { error: insErr } = await supabase
      .from('vendas')
      .insert(rows);
    if (insErr) throw new Error(insErr.message);
  },

  // ---- Config ----

  async getAppConfig(): Promise<AppConfig> {
    const { data, error } = await supabase
      .from('app_config')
      .select('data')
      .maybeSingle();
    if (error) return { theme: 'standard' };
    return (data?.data as AppConfig) ?? { theme: 'standard' };
  },

  async saveAppConfig(config: AppConfig): Promise<void> {
    const userId = await getUserId();
    const { error } = await supabase
      .from('app_config')
      .upsert({ user_id: userId, data: config }, { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
  },

  // ---- Subscriptions (agora com Realtime de verdade) ----

  subscribeToVendas(callback: (vendas: Venda[]) => void) {
    return subscribeTable('vendas', () => dbService.getVendas(), callback);
  },

  subscribeToEmpreendimentos(callback: (devs: Empreendimento[]) => void) {
    return subscribeTable('empreendimentos', () => dbService.getEmpreendimentos(), callback);
  },

  subscribeToClientes(callback: (clientes: Cliente[]) => void) {
    return subscribeTable('clientes', () => dbService.getClientes(), callback);
  },

  // ---- Migração do localStorage ----

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
        msg: `Migração concluída! ${devs.length} empreendimento(s), ${clientes.length} cliente(s) e ${vendas.length} venda(s) migrados.`,
      };
    } catch (err) {
      console.error('migrateFromLocalStorage:', err);
      return { ok: false, msg: 'Erro durante a migração. Verifique o console.' };
    }
  },
};
