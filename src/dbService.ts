import { Empreendimento, Cliente, Venda, AppConfig } from './types';

let _authToken: string | null = null;

export function setCurrentUser(_id: string) {
}

export function setAuthToken(token: string | null) {
  _authToken = token;
}

function getHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (_authToken) {
    (headers as any)['Authorization'] = `Bearer ${_authToken}`;
  }
  return headers;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Erro ${res.status}`);
  }
  return res.json();
}

async function getEmpreendimentos(): Promise<Empreendimento[]> {
  return apiFetch<Empreendimento[]>('/api/empreendimentos');
}

async function saveEmpreendimentos(items: Empreendimento[]): Promise<void> {
<<<<<<< HEAD
  await apiFetch('/api/empreendimentos', {
    method: 'POST',
    body: JSON.stringify(items),
  });
=======
  _suppressEmpreendimentosCallback = true;
  try {
    const toDelete = existing.filter(e => !ids.has(e.id)).map(e => e.id);
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
>>>>>>> cd91ad8caf63df90180a184e9b6770eb977a1796
}

async function deleteEmpreendimento(id: string): Promise<void> {
  await apiFetch(`/api/empreendimentos/${id}`, { method: 'DELETE' });
}

async function getClientes(): Promise<Cliente[]> {
  return apiFetch<Cliente[]>('/api/clientes');
}

async function saveClientes(items: Cliente[]): Promise<void> {
  await apiFetch('/api/clientes', {
    method: 'POST',
    body: JSON.stringify(items),
  });
}

async function getVendas(): Promise<Venda[]> {
  return apiFetch<Venda[]>('/api/vendas');
}

async function saveVendas(items: Venda[]): Promise<void> {
  await apiFetch('/api/vendas', {
    method: 'POST',
    body: JSON.stringify(items),
  });
}

async function getAppConfig(): Promise<AppConfig> {
  return apiFetch<AppConfig>('/api/config');
}

async function saveAppConfig(config: AppConfig): Promise<void> {
  await apiFetch('/api/config', {
    method: 'POST',
    body: JSON.stringify(config),
  });
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
