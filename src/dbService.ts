import { supabase } from './auth';
import { Empreendimento, Cliente, Venda, AppConfig } from './types';

async function getAll<T>(table: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('data').order('created_at' as any, { ascending: true });
  if (error) throw error;
  return (data || []).map((r: any) => r.data as T);
}

async function upsertRecord(table: string, id: string, record: any) {
  const { error } = await supabase.from(table).upsert({ id, data: record });
  if (error) throw error;
}

async function deleteRecord(table: string, id: string) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

async function syncAll<T extends { id: string }>(table: string, items: T[]) {
  const existing = await getAll<T>(table);
  const existingIds = new Set(existing.map((e: any) => e.id));
  const newIds = new Set(items.map(e => e.id));
  for (const id of existingIds) {
    if (!newIds.has(id)) await deleteRecord(table, id);
  }
  for (const item of items) {
    await upsertRecord(table, item.id, item);
  }
}

export const dbService = {
  async getEmpreendimentos(): Promise<Empreendimento[]> {
    return getAll<Empreendimento>('empreendimentos');
  },
  async saveEmpreendimentos(items: Empreendimento[]) {
    await syncAll('empreendimentos', items);
  },

  async getClientes(): Promise<Cliente[]> {
    return getAll<Cliente>('clientes');
  },
  async saveClientes(items: Cliente[]) {
    await syncAll('clientes', items);
  },

  async getVendas(): Promise<Venda[]> {
    return getAll<Venda>('vendas');
  },
  async saveVendas(items: Venda[]) {
    await syncAll('vendas', items);
  },

  async getAppConfig(): Promise<AppConfig> {
    const { data, error } = await supabase.from('app_config').select('data').maybeSingle();
    if (error || !data) return { theme: 'standard' };
    return data.data as AppConfig;
  },
  async saveAppConfig(config: AppConfig) {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { error } = await supabase
      .from('app_config')
      .upsert({ user_id: userData.user.id, data: config });
    if (error) throw error;
  },
};
