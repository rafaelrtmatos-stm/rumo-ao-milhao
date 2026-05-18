/**
 * syncService.ts — usa authFetch em TODAS as chamadas de API
 */

import { db } from './offlineDb';
import { Empreendimento, Cliente, Venda, AppConfig } from './types';
import { authFetch } from './lib/authFetch';

// ── Fila de sync ─────────────────────────────────────────────────────────────

export async function enqueue(
  entity: 'empreendimento' | 'cliente' | 'venda' | 'config',
  operation: 'upsert' | 'delete',
  entityId: string,
  payload?: unknown
) {
  // Remove entrada anterior do mesmo item (só mantém a mais recente)
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

// ── Processa fila → envia para API com authFetch ──────────────────────────────

let isSyncing = false;

export async function processSyncQueue(): Promise<{ synced: number; errors: number }> {
  if (isSyncing || !navigator.onLine) return { synced: 0, errors: 0 };

  isSyncing = true;
  let synced = 0;
  let errors = 0;

  try {
    const items = await db.syncQueue.orderBy('createdAt').toArray();

    for (const item of items) {
      try {
        let res: Response;

        if (item.entity === 'config') {
          res = await authFetch('/api/config', {
            method: 'POST',
            body: JSON.stringify(item.payload),
          });
        } else {
          const endpoint = entityEndpoint(item.entity);
          if (item.operation === 'delete') {
            res = await authFetch(`${endpoint}/${item.entityId}`, { method: 'DELETE' });
          } else {
            res = await authFetch(`${endpoint}/${item.entityId}`, {
              method: 'PUT',
              body: JSON.stringify(item.payload),
            });
          }
        }

        if (res.status === 401) {
          // Token inválido — para o sync, não apaga dados locais
          console.warn('[sync] 401 — token expirado, sync pausado');
          errors++;
          break;
        }

        if (res.ok) {
          await db.syncQueue.delete(item.id!);
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

// ── Pull do servidor → IndexedDB (com authFetch) ─────────────────────────────

export async function pullFromServer(): Promise<void> {
  if (!navigator.onLine) return;

  try {
    const [empsRes, clsRes, vendasRes, cfgRes] = await Promise.all([
      authFetch('/api/empreendimentos'),
      authFetch('/api/clientes'),
      authFetch('/api/vendas'),
      authFetch('/api/config'),
    ]);

    // 401 em qualquer rota = token inválido, não apaga nada
    if (empsRes.status === 401 || clsRes.status === 401 || vendasRes.status === 401) {
      console.warn('[sync] 401 no pull — token expirado');
      return;
    }

    const now = Date.now();

    if (empsRes.ok) {
      const emps: Empreendimento[] = await empsRes.json();
      await db.transaction('rw', db.empreendimentos, async () => {
        for (const emp of emps) {
          const local = await db.empreendimentos.get(emp.id);
          // Só sobrescreve se não tem alteração pendente local
          if (!local || local.syncStatus === 'synced') {
            await db.empreendimentos.put({ id: emp.id, data: emp, syncStatus: 'synced', updatedAt: now });
          }
        }
      });
    }

    if (clsRes.ok) {
      const cls: Cliente[] = await clsRes.json();
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
      await db.config.put({ id: 'main', data: config, syncStatus: 'synced', updatedAt: now });
    }
  } catch (err) {
    console.warn('[sync] pullFromServer erro de rede:', err);
  }
}

// ── Listeners de conectividade ────────────────────────────────────────────────

let syncListeners: Array<(online: boolean) => void> = [];

export function onSyncStatusChange(cb: (online: boolean) => void) {
  syncListeners.push(cb);
  return () => { syncListeners = syncListeners.filter(l => l !== cb); };
}

export function getPendingCount(): Promise<number> {
  return db.syncQueue.count();
}

export function initSyncListeners() {
  window.addEventListener('online', async () => {
    syncListeners.forEach(cb => cb(true));
    await pullFromServer();
    await processSyncQueue();
    syncListeners.forEach(cb => cb(true));
  });

  window.addEventListener('offline', () => {
    syncListeners.forEach(cb => cb(false));
  });

  // Sync periódico a cada 2 minutos quando online
  setInterval(async () => {
    if (navigator.onLine) await processSyncQueue();
  }, 2 * 60 * 1000);
}
