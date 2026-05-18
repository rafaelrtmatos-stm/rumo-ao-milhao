/**
 * syncService.ts
 * Gerencia sincronização entre IndexedDB local e API remota.
 *
 * Fluxo:
 * 1. Toda gravação vai PRIMEIRO para IndexedDB (imediato, offline-safe)
 * 2. Uma entrada é adicionada à fila de sync
 * 3. Quando há internet, a fila é processada em background
 * 4. Pull periódico traz dados novos do servidor (last-write-wins por updatedAt)
 */

import { db } from './offlineDb';
import { Empreendimento, Cliente, Venda, AppConfig } from './types';
import { getAuthToken } from './main';

const API_BASE = '';

// ── Helpers de fetch autenticado ────────────────────────────────────────────

function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiFetch(path: string, opts?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { ...authHeaders(), ...(opts?.headers ?? {}) },
  });
}

// ── Adiciona item à fila de sync ─────────────────────────────────────────────

export async function enqueue(
  entity: 'empreendimento' | 'cliente' | 'venda' | 'config',
  operation: 'upsert' | 'delete',
  entityId: string,
  payload?: unknown
) {
  // Remove entradas antigas do mesmo entity+id (substituir pela mais recente)
  await db.syncQueue
    .where('entityId').equals(entityId)
    .and(item => item.entity === entity)
    .delete();

  await db.syncQueue.add({
    entity,
    operation,
    entityId,
    payload,
    createdAt: Date.now(),
    attempts: 0,
  });
}

// ── Processa fila de sync ─────────────────────────────────────────────────────

let isSyncing = false;

export async function processSyncQueue(): Promise<{ synced: number; errors: number }> {
  if (isSyncing) return { synced: 0, errors: 0 };
  if (!navigator.onLine) return { synced: 0, errors: 0 };

  isSyncing = true;
  let synced = 0;
  let errors = 0;

  try {
    const items = await db.syncQueue.orderBy('createdAt').toArray();

    for (const item of items) {
      try {
        let res: Response;

        if (item.entity === 'config') {
          res = await apiFetch('/api/config', {
            method: 'POST',
            body: JSON.stringify(item.payload),
          });
        } else {
          const endpoint = entityEndpoint(item.entity);

          if (item.operation === 'delete') {
            res = await apiFetch(`${endpoint}/${item.entityId}`, { method: 'DELETE' });
          } else {
            res = await apiFetch(`${endpoint}/${item.entityId}`, {
              method: 'PUT',
              body: JSON.stringify(item.payload),
            });
          }
        }

        if (res.ok) {
          await db.syncQueue.delete(item.id!);

          // Marca como synced no banco local
          await markSynced(item.entity, item.entityId);
          synced++;
        } else {
          await db.syncQueue.update(item.id!, { attempts: item.attempts + 1 });
          errors++;
        }
      } catch {
        await db.syncQueue.update(item.id!, { attempts: item.attempts + 1 });
        errors++;
      }
    }
  } finally {
    isSyncing = false;
  }

  return { synced, errors };
}

function entityEndpoint(entity: string): string {
  if (entity === 'empreendimento') return '/api/empreendimentos';
  if (entity === 'cliente') return '/api/clientes';
  if (entity === 'venda') return '/api/vendas';
  return '/api/config';
}

async function markSynced(entity: string, id: string) {
  const now = Date.now();
  if (entity === 'empreendimento') {
    await db.empreendimentos.where('id').equals(id).modify({ syncStatus: 'synced', updatedAt: now });
  } else if (entity === 'cliente') {
    await db.clientes.where('id').equals(id).modify({ syncStatus: 'synced', updatedAt: now });
  } else if (entity === 'venda') {
    await db.vendas.where('id').equals(id).modify({ syncStatus: 'synced', updatedAt: now });
  }
}

// ── Pull do servidor → IndexedDB (last-write-wins) ───────────────────────────

export async function pullFromServer(): Promise<void> {
  if (!navigator.onLine) return;

  try {
    const [empsRes, clsRes, vendasRes, cfgRes] = await Promise.all([
      apiFetch('/api/empreendimentos'),
      apiFetch('/api/clientes'),
      apiFetch('/api/vendas'),
      apiFetch('/api/config'),
    ]);

    if (empsRes.ok) {
      const emps: Empreendimento[] = await empsRes.json();
      const now = Date.now();
      await db.transaction('rw', db.empreendimentos, async () => {
        for (const emp of emps) {
          const local = await db.empreendimentos.get(emp.id);
          // Só atualiza se não tem alteração pendente local
          if (!local || local.syncStatus === 'synced') {
            await db.empreendimentos.put({ id: emp.id, data: emp, syncStatus: 'synced', updatedAt: now });
          }
        }
      });
    }

    if (clsRes.ok) {
      const cls: Cliente[] = await clsRes.json();
      const now = Date.now();
      await db.transaction('rw', db.clientes, async () => {
        for (const cl of cls) {
          const local = await db.clientes.get(cl.id);
          if (!local || local.syncStatus === 'synced') {
            await db.clientes.put({ id: cl.id, data: cl, syncStatus: 'synced', updatedAt: now });
          }
        }
      });
    }

    if (vendasRes.ok) {
      const vendas: Venda[] = await vendasRes.json();
      const now = Date.now();
      await db.transaction('rw', db.vendas, async () => {
        for (const venda of vendas) {
          const local = await db.vendas.get(venda.id);
          if (!local || local.syncStatus === 'synced') {
            await db.vendas.put({ id: venda.id, data: venda, syncStatus: 'synced', updatedAt: now });
          }
        }
      });
    }

    if (cfgRes.ok) {
      const config: AppConfig = await cfgRes.json();
      await db.config.put({ id: 'main', data: config, syncStatus: 'synced', updatedAt: Date.now() });
    }
  } catch (err) {
    console.warn('[syncService] pullFromServer falhou:', err);
  }
}

// ── Listener de conectividade ────────────────────────────────────────────────

let syncListeners: Array<(online: boolean) => void> = [];

export function onSyncStatusChange(cb: (online: boolean) => void) {
  syncListeners.push(cb);
  return () => { syncListeners = syncListeners.filter(l => l !== cb); };
}

export function getPendingCount(): Promise<number> {
  return db.syncQueue.count();
}

// Inicia listeners de conectividade
export function initSyncListeners() {
  const handleOnline = async () => {
    syncListeners.forEach(cb => cb(true));
    await pullFromServer();
    await processSyncQueue();
    syncListeners.forEach(cb => cb(true));
  };

  const handleOffline = () => {
    syncListeners.forEach(cb => cb(false));
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Sync periódico a cada 2 minutos quando online
  setInterval(async () => {
    if (navigator.onLine) {
      await processSyncQueue();
    }
  }, 2 * 60 * 1000);

  // Pull inicial se online
  if (navigator.onLine) {
    pullFromServer().then(() => processSyncQueue());
  }
}
