import { createClient } from '@supabase/supabase-js';
import { Empreendimento, Cliente, Venda, AppConfig } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const DEFAULT_UUID = '00000000-0000-0000-0000-000000000001';
let currentUserId = DEFAULT_UUID;

export function setCurrentUser(_id: string) {
  currentUserId = DEFAULT_UUID;
}

function rowToItem<T>(row: { id: string; data: unknown }): T {
  return { ...(row.data as object), id: row.id } as T;
}

async function throwIfError<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

let _suppressEmpreendimentosCallback = false;

async function getEmpreendimentos(): Promise<Empreendimento[]> {
  const rows = await throwIfError(
    supabase.from('empreendimentos').select('id, data').eq('user_id', currentUserId)
  );
  return (rows as { id: string; data: unknown }[]).map(r => rowToItem<Empreendimento>(r));
}

async function saveEmpreendimentos(items: Empreendimento[]): Promise<void> {
  _suppressEmpreendimentosCallback = true;
  try {
    if (items.length > 0) {
      const rows = items.map(item => ({ id: item.id, user_id: currentUserId, data: item }));
      const { error } = await supabase.from('empreendimentos').upsert(rows);
      if (error) throw error;
    }
    const existing = await throwIfError(
      supabase.from('empreendimentos').select('id').eq('user_id', currentUserId)
    ) as { id: string }[];
    const ids = new Set(items.map(i => i.id));
    if (toDelete.length > 0) {
      const { error } = await supabase.from('empreendimentos').delete().in('id', toDelete);
      if (error) throw error;
    }
  } finally {
    setTimeout(() => { _suppressEmpreendimentosCallback = false; }, 1500);
  }
}

async function deleteEmpreendimento(id: string): Promise<void> {
  const { error } = await supabase.from('empreendimentos').delete().eq('id', id).eq('user_id', currentUserId);
  if (error) throw error;
}

async function getClientes(): Promise<Cliente[]> {
  const rows = await throwIfError(
    supabase.from('clientes').select('id, data').eq('user_id', currentUserId)
  );
  return (rows as { id: string; data: unknown }[]).map(r => rowToItem<Cliente>(r));
}

async function saveClientes(items: Cliente[]): Promise<void> {
  if (items.length > 0) {
    const rows = items.map(item => ({ id: item.id, user_id: currentUserId, data: item }));
    const { error } = await supabase.from('clientes').upsert(rows);
    if (error) throw error;
  }
  const existing = await throwIfError(
    supabase.from('clientes').select('id').eq('user_id', currentUserId)
  ) as { id: string }[];
  const ids = new Set(items.map(i => i.id));
  if (toDelete.length > 0) {
    const { error } = await supabase.from('clientes').delete().in('id', toDelete);
    if (error) throw error;
  }
}

async function getVendas(): Promise<Venda[]> {
  const rows = await throwIfError(
    supabase.from('vendas').select('id, data').eq('user_id', currentUserId)
  );
  return (rows as { id: string; data: unknown }[]).map(r => rowToItem<Venda>(r));
}

async function saveVendas(items: Venda[]): Promise<void> {
  if (items.length > 0) {
    const rows = items.map(item => ({ id: item.id, user_id: currentUserId, data: item }));
    const { error } = await supabase.from('vendas').upsert(rows);
    if (error) throw error;
  }
  const existing = await throwIfError(
    supabase.from('vendas').select('id').eq('user_id', currentUserId)
  ) as { id: string }[];
  const ids = new Set(items.map(i => i.id));
  if (toDelete.length > 0) {
    const { error } = await supabase.from('vendas').delete().in('id', toDelete);
    if (error) throw error;
  }
}

async function getAppConfig(): Promise<AppConfig> {
  const { data, error } = await supabase
    .from('app_config')
    .select('data')
    .eq('user_id', currentUserId)
    .maybeSingle();
  if (error) throw error;
  return (data?.data as AppConfig) ?? { theme: 'standard', vendedores: [] };
}

async function saveAppConfig(config: AppConfig): Promise<void> {
  const { error } = await supabase
    .from('app_config')
    .upsert({ user_id: currentUserId, data: config });
  if (error) throw error;
}

function subscribeToEmpreendimentos(callback: (devs: Empreendimento[]) => void): { unsubscribe: () => void } {
  const channel = supabase
    .channel(`empreendimentos:${currentUserId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'empreendimentos', filter: `user_id=eq.${currentUserId}` },
      async () => {
        if (_suppressEmpreendimentosCallback) return;
        await new Promise(r => setTimeout(r, 600));
        if (_suppressEmpreendimentosCallback) return;
        try { callback(await getEmpreendimentos()); } catch (e) { console.error('Realtime empreendimentos:', e); }
      }
    ).subscribe();
  return { unsubscribe: () => { supabase.removeChannel(channel); } };
}

function subscribeToClientes(callback: (clientes: Cliente[]) => void): { unsubscribe: () => void } {
  const channel = supabase
    .channel(`clientes:${currentUserId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'clientes', filter: `user_id=eq.${currentUserId}` },
      async () => {
        try { callback(await getClientes()); } catch (e) { console.error('Realtime clientes:', e); }
      }
    ).subscribe();
  return { unsubscribe: () => { supabase.removeChannel(channel); } };
}

function subscribeToVendas(callback: (vendas: Venda[]) => void): { unsubscribe: () => void } {
  const channel = supabase
    .channel(`vendas:${currentUserId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'vendas', filter: `user_id=eq.${currentUserId}` },
      async () => {
        try { callback(await getVendas()); } catch (e) { console.error('Realtime vendas:', e); }
      }
    ).subscribe();
  return { unsubscribe: () => { supabase.removeChannel(channel); } };
}

async function migrateFromLocalStorage(): Promise<{ ok: boolean; msg: string }> {
  try {
    const rawDevs = localStorage.getItem('lotes_empreendimentos');
    const rawClientes = localStorage.getItem('lotes_clientes');
    const rawVendas = localStorage.getItem('lotes_vendas');
    const devs: Empreendimento[] = rawDevs ? JSON.parse(rawDevs) : [];
    const cls: Cliente[] = rawClientes ? JSON.parse(rawClientes) : [];
    const vds: Venda[] = rawVendas ? JSON.parse(rawVendas) : [];
      return { ok: false, msg: 'Nenhum dado encontrado no localStorage para migrar.' };
    if (devs.length) await saveEmpreendimentos(devs);
    if (cls.length) await saveClientes(cls);
    if (vds.length) await saveVendas(vds);
    localStorage.removeItem('lotes_empreendimentos');
    localStorage.removeItem('lotes_clientes');
    localStorage.removeItem('lotes_vendas');
    localStorage.removeItem('lotes_config');
    return { ok: true, msg: `Migração concluída! ${devs.length} empreendimento(s), ${cls.length} cliente(s) e ${vds.length} venda(s) migrados.` };
  } catch (err) {
    return { ok: false, msg: 'Erro durante a migração.' };
  }
}

export const dbService = {
  getEmpreendimentos, saveEmpreendimentos, deleteEmpreendimento,
  getClientes, saveClientes, getVendas, saveVendas,
  getAppConfig, saveAppConfig,
  subscribeToEmpreendimentos, subscribeToClientes, subscribeToVendas,
  migrateFromLocalStorage,
};