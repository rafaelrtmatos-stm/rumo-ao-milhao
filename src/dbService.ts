import { Empreendimento, Cliente, Venda, AppConfig } from './types';

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function setCurrentUser(_id: string) {
  // No-op: user context is managed server-side via session
}

// ─── Empreendimentos ───────────────────────────────────────────────────────────

async function getEmpreendimentos(): Promise<Empreendimento[]> {
  return apiFetch<Empreendimento[]>('/api/empreendimentos');
}

async function saveEmpreendimentos(items: Empreendimento[]): Promise<void> {
  await apiFetch('/api/empreendimentos', {
    method: 'POST',
    body: JSON.stringify(items),
  });
}

async function deleteEmpreendimento(id: string): Promise<void> {
  await apiFetch(`/api/empreendimentos/${id}`, { method: 'DELETE' });
}

// ─── Clientes ─────────────────────────────────────────────────────────────────

async function getClientes(): Promise<Cliente[]> {
  return apiFetch<Cliente[]>('/api/clientes');
}

async function saveClientes(items: Cliente[]): Promise<void> {
  await apiFetch('/api/clientes', {
    method: 'POST',
    body: JSON.stringify(items),
  });
}

// ─── Vendas ───────────────────────────────────────────────────────────────────

async function getVendas(): Promise<Venda[]> {
  return apiFetch<Venda[]>('/api/vendas');
}

async function saveVendas(items: Venda[]): Promise<void> {
  await apiFetch('/api/vendas', {
    method: 'POST',
    body: JSON.stringify(items),
  });
}

// ─── AppConfig ────────────────────────────────────────────────────────────────

async function getAppConfig(): Promise<AppConfig> {
  return apiFetch<AppConfig>('/api/config');
}

async function saveAppConfig(config: AppConfig): Promise<void> {
  await apiFetch('/api/config', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

// ─── Realtime subscriptions (polling fallback — no Supabase realtime) ─────────

function subscribeToEmpreendimentos(callback: (devs: Empreendimento[]) => void): { unsubscribe: () => void } {
  const interval = setInterval(async () => {
    try { callback(await getEmpreendimentos()); } catch (e) { console.error('poll empreendimentos:', e); }
  }, 15000);
  return { unsubscribe: () => clearInterval(interval) };
}

function subscribeToClientes(callback: (clientes: Cliente[]) => void): { unsubscribe: () => void } {
  const interval = setInterval(async () => {
    try { callback(await getClientes()); } catch (e) { console.error('poll clientes:', e); }
  }, 15000);
  return { unsubscribe: () => clearInterval(interval) };
}

function subscribeToVendas(callback: (vendas: Venda[]) => void): { unsubscribe: () => void } {
  const interval = setInterval(async () => {
    try { callback(await getVendas()); } catch (e) { console.error('poll vendas:', e); }
  }, 15000);
  return { unsubscribe: () => clearInterval(interval) };
}

// ─── Migrate from localStorage ────────────────────────────────────────────────

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

// ─── Export ───────────────────────────────────────────────────────────────────

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
