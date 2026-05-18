/**
 * dbService.ts — online-first com fallback offline
 *
 * Quando há internet:
 *   - leitura vai direto para a API (authFetch, com token)
 *   - resultado é salvo no IndexedDB como cache
 *
 * Quando offline:
 *   - leitura vem do IndexedDB local
 *   - escrita vai para IndexedDB + fila de sync
 */

import { Empreendimento, Cliente, Venda, AppConfig } from './types';
import { authFetch } from './lib/authFetch';
import { db } from './offlineDb';
import { enqueue, processSyncQueue } from './syncService';

export function setCurrentUser(_id: string) {}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiGet<T>(path: string): Promise<T> {
  const res = await authFetch(path);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error || `Erro ${res.status}`);
  }
  return res.json();
}

async function apiPut(path: string, body: unknown): Promise<void> {
  const res = await authFetch(path, { method: 'PUT', body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error || `Erro ${res.status}`);
  }
}

async function apiPost(path: string, body: unknown): Promise<void> {
  const res = await authFetch(path, { method: 'POST', body: JSON.stringify(body) });
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

// ── Empreendimentos ───────────────────────────────────────────────────────────

async function getEmpreendimentos(): Promise<Empreendimento[]> {
  if (navigator.onLine) {
    try {
      const items = await apiGet<Empreendimento[]>('/api/empreendimentos');
      // Atualiza cache local (sem sobrescrever pendentes)
      const now = Date.now();
      for (const item of items) {
        const local = await db.empreendimentos.get(item.id);
        if (!local || local.syncStatus === 'synced') {
          await db.empreendimentos.put({ id: item.id, data: item, syncStatus: 'synced', updatedAt: now });
        }
      }
      return items;
    } catch (err) {
      console.warn('[db] getEmpreendimentos API falhou, usando cache:', err);
    }
  }
  // Fallback offline
  const records = await db.empreendimentos.filter(r => r.syncStatus !== 'deleted').toArray();
  return records.map(r => r.data);
}

async function saveEmpreendimentos(items: Empreendimento[]): Promise<void> {
  if (navigator.onLine) {
    await apiPost('/api/empreendimentos', items);
    const now = Date.now();
    for (const item of items) {
      await db.empreendimentos.put({ id: item.id, data: item, syncStatus: 'synced', updatedAt: now });
    }
    return;
  }
  const now = Date.now();
  for (const item of items) {
    await db.empreendimentos.put({ id: item.id, data: item, syncStatus: 'pending', updatedAt: now });
    await enqueue('empreendimento', 'upsert', item.id, item);
  }
}

async function upsertEmpreendimento(item: Empreendimento): Promise<void> {
  // Salva local imediatamente (UX responsiva)
  await db.empreendimentos.put({ id: item.id, data: item, syncStatus: 'pending', updatedAt: Date.now() });

  if (navigator.onLine) {
    try {
      await apiPut(`/api/empreendimentos/${item.id}`, item);
      await db.empreendimentos.update(item.id, { syncStatus: 'synced' });
      return;
    } catch (err) {
      console.warn('[db] upsertEmpreendimento API falhou, enfileirando:', err);
    }
  }
  await enqueue('empreendimento', 'upsert', item.id, item);
  processSyncQueue();
}

async function deleteEmpreendimento(id: string): Promise<void> {
  await db.empreendimentos.delete(id);
  if (navigator.onLine) {
    try {
      await apiDelete(`/api/empreendimentos/${id}`);
      return;
    } catch (err) {
      console.warn('[db] deleteEmpreendimento API falhou, enfileirando:', err);
    }
  }
  await enqueue('empreendimento', 'delete', id);
  processSyncQueue();
}

// ── Clientes ──────────────────────────────────────────────────────────────────

async function getClientes(): Promise<Cliente[]> {
  if (navigator.onLine) {
    try {
      const items = await apiGet<Cliente[]>('/api/clientes');
      const now = Date.now();
      for (const item of items) {
        const local = await db.clientes.get(item.id);
        if (!local || local.syncStatus === 'synced') {
          await db.clientes.put({ id: item.id, data: item, syncStatus: 'synced', updatedAt: now });
        }
      }
      return items;
    } catch (err) {
      console.warn('[db] getClientes API falhou, usando cache:', err);
    }
  }
  const records = await db.clientes.filter(r => r.syncStatus !== 'deleted').toArray();
  return records.map(r => r.data);
}

async function saveClientes(items: Cliente[]): Promise<void> {
  if (navigator.onLine) {
    await apiPost('/api/clientes', items);
    const now = Date.now();
    for (const item of items) {
      await db.clientes.put({ id: item.id, data: item, syncStatus: 'synced', updatedAt: now });
    }
    return;
  }
  const now = Date.now();
  for (const item of items) {
    await db.clientes.put({ id: item.id, data: item, syncStatus: 'pending', updatedAt: now });
    await enqueue('cliente', 'upsert', item.id, item);
  }
}

async function upsertCliente(item: Cliente): Promise<void> {
  await db.clientes.put({ id: item.id, data: item, syncStatus: 'pending', updatedAt: Date.now() });
  if (navigator.onLine) {
    try {
      await apiPut(`/api/clientes/${item.id}`, item);
      await db.clientes.update(item.id, { syncStatus: 'synced' });
      return;
    } catch (err) {
      console.warn('[db] upsertCliente API falhou, enfileirando:', err);
    }
  }
  await enqueue('cliente', 'upsert', item.id, item);
  processSyncQueue();
}

// ── Vendas ────────────────────────────────────────────────────────────────────

async function getVendas(): Promise<Venda[]> {
  if (navigator.onLine) {
    try {
      const items = await apiGet<Venda[]>('/api/vendas');
      const now = Date.now();
      for (const item of items) {
        const local = await db.vendas.get(item.id);
        if (!local || local.syncStatus === 'synced') {
          await db.vendas.put({ id: item.id, data: item, syncStatus: 'synced', updatedAt: now });
        }
      }
      return items;
    } catch (err) {
      console.warn('[db] getVendas API falhou, usando cache:', err);
    }
  }
  const records = await db.vendas.filter(r => r.syncStatus !== 'deleted').toArray();
  return records.map(r => r.data);
}

async function saveVendas(items: Venda[]): Promise<void> {
  if (navigator.onLine) {
    await apiPost('/api/vendas', items);
    const now = Date.now();
    for (const item of items) {
      await db.vendas.put({ id: item.id, data: item, syncStatus: 'synced', updatedAt: now });
    }
    return;
  }
  const now = Date.now();
  for (const item of items) {
    await db.vendas.put({ id: item.id, data: item, syncStatus: 'pending', updatedAt: now });
    await enqueue('venda', 'upsert', item.id, item);
  }
}

async function upsertVenda(item: Venda): Promise<void> {
  await db.vendas.put({ id: item.id, data: item, syncStatus: 'pending', updatedAt: Date.now() });
  if (navigator.onLine) {
    try {
      await apiPut(`/api/vendas/${item.id}`, item);
      await db.vendas.update(item.id, { syncStatus: 'synced' });
      return;
    } catch (err) {
      console.warn('[db] upsertVenda API falhou, enfileirando:', err);
    }
  }
  await enqueue('venda', 'upsert', item.id, item);
  processSyncQueue();
}

async function deleteVendaById(id: string): Promise<void> {
  await db.vendas.delete(id);
  if (navigator.onLine) {
    try {
      await apiDelete(`/api/vendas/${id}`);
      return;
    } catch (err) {
      console.warn('[db] deleteVendaById API falhou, enfileirando:', err);
    }
  }
  await enqueue('venda', 'delete', id);
  processSyncQueue();
}

// ── Config ────────────────────────────────────────────────────────────────────

async function getAppConfig(): Promise<AppConfig> {
  if (navigator.onLine) {
    try {
      const config = await apiGet<AppConfig>('/api/config');
      await db.config.put({ id: 'main', data: config, syncStatus: 'synced', updatedAt: Date.now() });
      return config;
    } catch (err) {
      console.warn('[db] getAppConfig API falhou, usando cache:', err);
    }
  }
  const record = await db.config.get('main');
  return record?.data ?? ({} as AppConfig);
}

async function saveAppConfig(config: AppConfig): Promise<void> {
  await db.config.put({ id: 'main', data: config, syncStatus: 'pending', updatedAt: Date.now() });
  if (navigator.onLine) {
    try {
      await apiPost('/api/config', config);
      await db.config.update('main', { syncStatus: 'synced' });
      return;
    } catch (err) {
      console.warn('[db] saveAppConfig API falhou, enfileirando:', err);
    }
  }
  await enqueue('config', 'upsert', 'main', config);
  processSyncQueue();
}

// ── Subscriptions (compatibilidade) ───────────────────────────────────────────

function subscribeToEmpreendimentos(_cb: (devs: Empreendimento[]) => void) {
  return { unsubscribe: () => {} };
}
function subscribeToClientes(_cb: (clientes: Cliente[]) => void) {
  return { unsubscribe: () => {} };
}
function subscribeToVendas(_cb: (vendas: Venda[]) => void) {
  return { unsubscribe: () => {} };
}

// ── Migração de localStorage ───────────────────────────────────────────────────

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

export async function forcSync(): Promise<{ synced: number; errors: number }> {
  const { pullFromServer } = await import('./syncService');
  await pullFromServer();
  return processSyncQueue();
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
  forcSync,
};
