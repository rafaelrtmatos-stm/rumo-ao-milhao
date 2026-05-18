/**
 * dbService.ts  — versão offline-first
 *
 * Toda leitura vem do IndexedDB local (instantânea, funciona sem internet).
 * Toda escrita vai para o IndexedDB local E enfileira sync com o servidor.
 * O syncService processa a fila em background quando há internet.
 */

import { Empreendimento, Cliente, Venda, AppConfig } from './types';
import { db } from './offlineDb';
import { enqueue, pullFromServer, processSyncQueue } from './syncService';

export function setCurrentUser(_id: string) {}

// ── Empreendimentos ──────────────────────────────────────────────────────────

async function getEmpreendimentos(): Promise<Empreendimento[]> {
  const records = await db.empreendimentos
    .filter(r => r.syncStatus !== 'deleted')
    .toArray();
  return records.map(r => r.data);
}

async function saveEmpreendimentos(items: Empreendimento[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.empreendimentos, db.syncQueue, async () => {
    await db.empreendimentos.clear();
    for (const item of items) {
      await db.empreendimentos.put({ id: item.id, data: item, syncStatus: 'pending', updatedAt: now });
      await enqueue('empreendimento', 'upsert', item.id, item);
    }
  });
}

async function upsertEmpreendimento(item: Empreendimento): Promise<void> {
  const now = Date.now();
  await db.empreendimentos.put({ id: item.id, data: item, syncStatus: 'pending', updatedAt: now });
  await enqueue('empreendimento', 'upsert', item.id, item);
  processSyncQueue();
}

async function deleteEmpreendimento(id: string): Promise<void> {
  await db.empreendimentos.delete(id);
  await enqueue('empreendimento', 'delete', id);
  processSyncQueue();
}

// ── Clientes ─────────────────────────────────────────────────────────────────

async function getClientes(): Promise<Cliente[]> {
  const records = await db.clientes
    .filter(r => r.syncStatus !== 'deleted')
    .toArray();
  return records.map(r => r.data);
}

async function saveClientes(items: Cliente[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.clientes, db.syncQueue, async () => {
    await db.clientes.clear();
    for (const item of items) {
      await db.clientes.put({ id: item.id, data: item, syncStatus: 'pending', updatedAt: now });
      await enqueue('cliente', 'upsert', item.id, item);
    }
  });
}

async function upsertCliente(item: Cliente): Promise<void> {
  const now = Date.now();
  await db.clientes.put({ id: item.id, data: item, syncStatus: 'pending', updatedAt: now });
  await enqueue('cliente', 'upsert', item.id, item);
  processSyncQueue();
}

// ── Vendas ───────────────────────────────────────────────────────────────────

async function getVendas(): Promise<Venda[]> {
  const records = await db.vendas
    .filter(r => r.syncStatus !== 'deleted')
    .toArray();
  return records.map(r => r.data);
}

async function saveVendas(items: Venda[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.vendas, db.syncQueue, async () => {
    await db.vendas.clear();
    for (const item of items) {
      await db.vendas.put({ id: item.id, data: item, syncStatus: 'pending', updatedAt: now });
      await enqueue('venda', 'upsert', item.id, item);
    }
  });
}

async function upsertVenda(item: Venda): Promise<void> {
  const now = Date.now();
  await db.vendas.put({ id: item.id, data: item, syncStatus: 'pending', updatedAt: now });
  await enqueue('venda', 'upsert', item.id, item);
  processSyncQueue();
}

async function deleteVendaById(id: string): Promise<void> {
  await db.vendas.delete(id);
  await enqueue('venda', 'delete', id);
  processSyncQueue();
}

// ── Config ───────────────────────────────────────────────────────────────────

async function getAppConfig(): Promise<AppConfig> {
  const record = await db.config.get('main');
  if (record) return record.data;
  return {} as AppConfig;
}

async function saveAppConfig(config: AppConfig): Promise<void> {
  await db.config.put({ id: 'main', data: config, syncStatus: 'pending', updatedAt: Date.now() });
  await enqueue('config', 'upsert', 'main', config);
  processSyncQueue();
}

// ── Subscriptions (mantém compatibilidade com App.tsx) ───────────────────────

function subscribeToEmpreendimentos(_cb: (devs: Empreendimento[]) => void) {
  return { unsubscribe: () => {} };
}
function subscribeToClientes(_cb: (clientes: Cliente[]) => void) {
  return { unsubscribe: () => {} };
}
function subscribeToVendas(_cb: (vendas: Venda[]) => void) {
  return { unsubscribe: () => {} };
}

// ── Migração de localStorage ─────────────────────────────────────────────────

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
