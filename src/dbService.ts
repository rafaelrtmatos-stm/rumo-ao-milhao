import { supabase } from './supabaseClient';
import { Empreendimento, Cliente, Venda, AppConfig } from './types';

let currentUserId = '';

export function setCurrentUser(id: string) {
  currentUserId = id;
}

function assertUser() {
  if (!currentUserId) throw new Error('Usuário não autenticado.');
}

export const dbService = {

  async getEmpreendimentos(): Promise<Empreendimento[]> {
    assertUser();
    const { data, error } = await supabase
      .from('empreendimentos')
      .select('data')
      .eq('user_id', currentUserId);
    if (error) throw new Error(error.message);
    return (data || []).map((r: any) => r.data);
  },

  async saveEmpreendimentos(items: Empreendimento[]): Promise<void> {
    assertUser();
    const { data: existing } = await supabase
      .from('empreendimentos')
      .select('id')
      .eq('user_id', currentUserId);
    const existingIds = (existing || []).map((r: any) => r.id as string);
    const newIds = items.map((i) => i.id);
    const toDelete = existingIds.filter((id) => !newIds.includes(id));
    if (toDelete.length > 0) {
      await supabase.from('empreendimentos').delete().in('id', toDelete).eq('user_id', currentUserId);
    }
    if (items.length > 0) {
      const rows = items.map((item) => ({ id: item.id, user_id: currentUserId, data: item }));
      const { error } = await supabase.from('empreendimentos').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }
  },

  async deleteEmpreendimento(id: string): Promise<void> {
    assertUser();
    await supabase.from('empreendimentos').delete().eq('id', id).eq('user_id', currentUserId);
  },

  async getClientes(): Promise<Cliente[]> {
    assertUser();
    const { data, error } = await supabase
      .from('clientes')
      .select('data')
      .eq('user_id', currentUserId);
    if (error) throw new Error(error.message);
    return (data || []).map((r: any) => r.data);
  },

  async saveClientes(items: Cliente[]): Promise<void> {
    assertUser();
    const { data: existing } = await supabase
      .from('clientes')
      .select('id')
      .eq('user_id', currentUserId);
    const existingIds = (existing || []).map((r: any) => r.id as string);
    const newIds = items.map((i) => i.id);
    const toDelete = existingIds.filter((id) => !newIds.includes(id));
    if (toDelete.length > 0) {
      await supabase.from('clientes').delete().in('id', toDelete).eq('user_id', currentUserId);
    }
    if (items.length > 0) {
      const rows = items.map((item) => ({ id: item.id, user_id: currentUserId, data: item }));
      const { error } = await supabase.from('clientes').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }
  },

  async getVendas(): Promise<Venda[]> {
    assertUser();
    const { data, error } = await supabase
      .from('vendas')
      .select('data')
      .eq('user_id', currentUserId);
    if (error) throw new Error(error.message);
    return (data || []).map((r: any) => r.data);
  },

  async saveVendas(items: Venda[]): Promise<void> {
    assertUser();
    const { data: existing } = await supabase
      .from('vendas')
      .select('id')
      .eq('user_id', currentUserId);
    const existingIds = (existing || []).map((r: any) => r.id as string);
    const newIds = items.map((i) => i.id);
    const toDelete = existingIds.filter((id) => !newIds.includes(id));
    if (toDelete.length > 0) {
      await supabase.from('vendas').delete().in('id', toDelete).eq('user_id', currentUserId);
    }
    if (items.length > 0) {
      const rows = items.map((item) => ({ id: item.id, user_id: currentUserId, data: item }));
      const { error } = await supabase.from('vendas').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }
  },

  async getAppConfig(): Promise<AppConfig> {
    if (!currentUserId) return { theme: 'standard' };
    const { data, error } = await supabase
      .from('app_config')
      .select('data')
      .eq('user_id', currentUserId)
      .maybeSingle();
    if (error) return { theme: 'standard' };
    return data?.data ?? { theme: 'standard' };
  },

  async saveAppConfig(config: AppConfig): Promise<void> {
    assertUser();
    const { error } = await supabase
      .from('app_config')
      .upsert({ user_id: currentUserId, data: config }, { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
  },

  subscribeToVendas(callback: (vendas: Venda[]) => void) {
    const channel = supabase
      .channel('vendas-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendas' }, () => {
        dbService.getVendas().then(callback).catch(console.error);
      })
      .subscribe();
    return { unsubscribe: () => { supabase.removeChannel(channel); } };
  },

  subscribeToEmpreendimentos(callback: (devs: Empreendimento[]) => void) {
    const channel = supabase
      .channel('empreendimentos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'empreendimentos' }, () => {
        dbService.getEmpreendimentos().then(callback).catch(console.error);
      })
      .subscribe();
    return { unsubscribe: () => { supabase.removeChannel(channel); } };
  },

  subscribeToClientes(callback: (clientes: Cliente[]) => void) {
    const channel = supabase
      .channel('clientes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => {
        dbService.getClientes().then(callback).catch(console.error);
      })
      .subscribe();
    return { unsubscribe: () => { supabase.removeChannel(channel); } };
  },

  async migrateFromLocalStorage(): Promise<{ ok: boolean; msg: string }> {
    try {
      const rawDevs = localStorage.getItem('lotes_empreendimentos');
      const rawClientes = localStorage.getItem('lotes_clientes');
      const rawVendas = localStorage.getItem('lotes_vendas');

      const devs: Empreendimento[] = rawDevs ? JSON.parse(rawDevs) : [];
      const cls: Cliente[] = rawClientes ? JSON.parse(rawClientes) : [];
      const vds: Venda[] = rawVendas ? JSON.parse(rawVendas) : [];

      if (!devs.length && !cls.length && !vds.length) {
        return { ok: false, msg: 'Nenhum dado encontrado no localStorage para migrar.' };
      }

      if (devs.length) await dbService.saveEmpreendimentos(devs);
      if (cls.length) await dbService.saveClientes(cls);
      if (vds.length) await dbService.saveVendas(vds);

      localStorage.removeItem('lotes_empreendimentos');
      localStorage.removeItem('lotes_clientes');
      localStorage.removeItem('lotes_vendas');
      localStorage.removeItem('lotes_config');

      return {
        ok: true,
        msg: `Migração concluída! ${devs.length} empreendimento(s), ${cls.length} cliente(s) e ${vds.length} venda(s) migrados.`,
      };
    } catch (err) {
      console.error('migrateFromLocalStorage:', err);
      return { ok: false, msg: 'Erro durante a migração. Verifique o console.' };
    }
  },
};
