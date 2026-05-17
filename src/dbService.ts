import { Empreendimento, Cliente, Venda, AppConfig } from './types';
import { authFetch } from './lib/authFetch';

export function setCurrentUser(_id: string) {}

async function apiGet<T>(path: string): Promise<T> {
  const res = await authFetch(path);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error || `Erro ${res.status}`);
  }
  return res.json();
}

async function apiPost(path: string, body: unknown): Promise<void> {
  const res = await authFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error || `Erro ${res.status}`);
  }
}

async function apiPut(path: string, body: unknown): Promise<void> {
  const res = await authFetch(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error || `Erro ${res.status}`);
  }
}

async function apiDelete(path: string): Promise<void> {
  const res = await authFetch(path, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error || `Erro ${res.status}`);
  }
}

async function getEmpreendimentos(): Promise<Empreendimento[]> {
  return apiGet<Empreendimento[]>('/api/empreendimentos');
}

async function saveEmpreendimentos(items: Empreendimento[]): Promise<void> {
  return apiPost('/api/empreendimentos', items);
}

// Upsert atômico — não sobrescreve outros registros do banco
async function upsertEmpreendimento(item: Empreendimento): Promise<void> {
  return apiPut(`/api/empreendimentos/${item.id}`, item);
}

async function deleteEmpreendimento(id: string): Promise<void> {
  return apiDelete(`/api/empreendimentos/${id}`);
}

async function getClientes(): Promise<Cliente[]> {
  return apiGet<Cliente[]>('/api/clientes');
}

async function saveClientes(items: Cliente[]): Promise<void> {
  return apiPost('/api/clientes', items);
}

// Upsert atômico — não sobrescreve outros clientes
async function upsertCliente(item: Cliente): Promise<void> {
  return apiPut(`/api/clientes/${item.id}`, item);
}

async function getVendas(): Promise<Venda[]> {
  return apiGet<Venda[]>('/api/vendas');
}

async function saveVendas(items: Venda[]): Promise<void> {
  return apiPost('/api/vendas', items);
}

// Upsert atômico — salva apenas esta venda, sem tocar nas outras
async function upsertVenda(item: Venda): Promise<void> {
  return apiPut(`/api/vendas/${item.id}`, item);
}

// Delete atômico de uma venda
async function deleteVendaById(id: string): Promise<void> {
  return apiDelete(`/api/vendas/${id}`);
}

async function getAppConfig(): Promise<AppConfig> {
  return apiGet<AppConfig>('/api/config');
}

async function saveAppConfig(config: AppConfig): Promise<void> {
  return apiPost('/api/config', config);
}

function subscribeToEmpreendimentos(_callback: (devs: Empreendimento[]) => void): { unsubscribe: () => void } {
  return { unsubscribe: () => {} };
}

function subscribeToClientes(_callback: (clientes: Cliente[]) => void): { unsubscribe: () => void } {
  return { unsubscribe: () => {} };
}

function subscribeToVendas(_callback: (vendas: Venda[]) => void): { unsubscribe: () => void } {
  return { unsubscribe: () => {} };
}

async function migrateFromLocalStorage(): Promise<{ ok: boolean; msg: string }> {
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

    if (devs.length) await saveEmpreendimentos(devs);
    if (cls.length) await saveClientes(cls);
    if (vds.length) await saveVendas(vds);

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
}

export const supabase = null;

export const dbService = {
  getEmpreendimentos,
  saveEmpreendimentos,
  upsertEmpreendimento,
  deleteEmpreendimento,
  getClientes,
  saveClientes,
  upsertCliente,
  getVendas,
  saveVendas,
  upsertVenda,
  deleteVendaById,
  getAppConfig,
  saveAppConfig,
  subscribeToEmpreendimentos,
  subscribeToClientes,
  subscribeToVendas,
  migrateFromLocalStorage,
};
