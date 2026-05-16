import { Empreendimento, Cliente, Venda, AppConfig } from './types';
import { authFetch } from './lib/authFetch';

export function setCurrentUser(_id: string) {}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Erro ${res.status}`);
  }
  return res.json();
}

async function getEmpreendimentos(): Promise<Empreendimento[]> {
  const res = await authFetch('/api/empreendimentos');
  return handleResponse<Empreendimento[]>(res);
}

async function saveEmpreendimentos(items: Empreendimento[]): Promise<void> {
  const res = await authFetch('/api/empreendimentos', {
    method: 'POST',
    body: JSON.stringify(items),
  });
  await handleResponse(res);
}

async function deleteEmpreendimento(id: string): Promise<void> {
  const res = await authFetch(`/api/empreendimentos/${id}`, { method: 'DELETE' });
  await handleResponse(res);
}

async function getClientes(): Promise<Cliente[]> {
  const res = await authFetch('/api/clientes');
  return handleResponse<Cliente[]>(res);
}

async function saveClientes(items: Cliente[]): Promise<void> {
  const res = await authFetch('/api/clientes', {
    method: 'POST',
    body: JSON.stringify(items),
  });
  await handleResponse(res);
}

async function getVendas(): Promise<Venda[]> {
  const res = await authFetch('/api/vendas');
  return handleResponse<Venda[]>(res);
}

async function saveVendas(items: Venda[]): Promise<void> {
  const res = await authFetch('/api/vendas', {
    method: 'POST',
    body: JSON.stringify(items),
  });
  await handleResponse(res);
}

async function getAppConfig(): Promise<AppConfig> {
  const res = await authFetch('/api/config');
  return handleResponse<AppConfig>(res);
}

async function saveAppConfig(config: AppConfig): Promise<void> {
  const res = await authFetch('/api/config', {
    method: 'POST',
    body: JSON.stringify(config),
  });
  await handleResponse(res);
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

export const dbService = {
  getEmpreendimentos,
  saveEmpreendimentos,
  deleteEmpreendimento,
  getClientes,
  saveClientes,
  getVendas,
  saveVendas,
  getAppConfig,
  saveAppConfig,
  subscribeToEmpreendimentos,
  subscribeToClientes,
  subscribeToVendas,
  migrateFromLocalStorage,
};
