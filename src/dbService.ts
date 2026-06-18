/**
 * dbService.ts — online-first com fallback offline
 *
 * Correção 413: mapaImagemBase64 é enviado em rota separada
 * PUT /api/empreendimentos/:id       → dados sem a imagem base64
 * PUT /api/empreendimentos/:id/mapa  → apenas { mapaImagemBase64 }
 */

import { Empreendimento, Cliente, Venda, AppConfig } from './types';
import { authFetch } from './lib/authFetch';
import { db } from './offlineDb';
import { enqueue, processSyncQueue } from './syncService';

export function setCurrentUser(_id: string) {}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function extrairCoordenadasDoLink(url?: string) {
  if (!url) return null;
  const s = url.trim();

  // 1. Padrão @lat,lng (link longo Google Maps)
  const m1 = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m1) return { lat: parseFloat(m1[1]), lng: parseFloat(m1[2]) };

  // 2. Coordenadas decimais diretas: -2.4474, -54.8058 ou -2.4474,-54.8058
  const m2 = s.match(/^\s*(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)\s*$/);
  if (m2) return { lat: parseFloat(m2[1]), lng: parseFloat(m2[2]) };

  // 3. DMS: 2°26'50.2"S 54°48'18.1"W ou 2°26'50.2''S 54°48'18.1''W
  const dms = s.match(/(\d+)[°\s](\d+)['′\s](\d+(?:\.\d+)?)["″\s]?([NSns])[,\s]+(\d+)[°\s](\d+)['′\s](\d+(?:\.\d+)?)["″\s]?([EWew])/);
  if (dms) {
    const lat = (parseInt(dms[1]) + parseInt(dms[2])/60 + parseFloat(dms[3])/3600) * (/[Ss]/.test(dms[4]) ? -1 : 1);
    const lng = (parseInt(dms[5]) + parseInt(dms[6])/60 + parseFloat(dms[7])/3600) * (/[Ww]/.test(dms[8]) ? -1 : 1);
    return { lat, lng };
  }

  // 4. Google Maps com 3d= e 4d= (link com pin) 
  const m4 = s.match(/[?&!]3d(-?\d+\.\d+).*?[!&]4d(-?\d+\.\d+)/);
  if (m4) return { lat: parseFloat(m4[1]), lng: parseFloat(m4[2]) };

  // 5. q=lat,lng ou query=lat,lng
  const m5 = s.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m5) return { lat: parseFloat(m5[1]), lng: parseFloat(m5[2]) };

  // 6. ll=lat,lng
  const m6 = s.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m6) return { lat: parseFloat(m6[1]), lng: parseFloat(m6[2]) };

  return null;
}

function injectCoordenadas(dev: Empreendimento): Empreendimento {
  const link = (dev as any).googleMapsUrl || (dev as any).linkGoogleMaps || (dev as any).mapaLocalizacaoUrl;
  
  if (link && (!dev.lat || !dev.lng || dev.lat === 0)) {
    const coords = extrairCoordenadasDoLink(link);
    if (coords) {
      return { ...dev, lat: coords.lat, lng: coords.lng };
    }
  }
  return dev;
}

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
      // Timeout de 8s para evitar pending infinito
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch('/api/empreendimentos', {
        headers: (() => { const t = localStorage.getItem('rumo_auth_token'); return t ? { Authorization: `Bearer ${t}` } : {}; })(),
        signal: controller.signal,
        cache: 'no-store',
      }).finally(() => clearTimeout(timer));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items: Empreendimento[] = await res.json();
      const now = Date.now();
      for (const item of items) {
        const local = await db.empreendimentos.get(item.id);
        if (!local || local.syncStatus === 'synced') {
          const base64 = (local?.data as any)?.mapaImagemBase64;
          const merged = base64 ? { ...item, mapaImagemBase64: base64 } : item;
          await db.empreendimentos.put({ id: item.id, data: merged, syncStatus: 'synced', updatedAt: now });
        }
      }
      const records = await db.empreendimentos.filter(r => r.syncStatus !== 'deleted').toArray();
      return records.map(r => injectCoordenadas(r.data));
    } catch (err) {
      console.warn('[db] getEmpreendimentos API falhou, usando cache:', err);
    }
  }
  const records = await db.empreendimentos.filter(r => r.syncStatus !== 'deleted').toArray();
  return records.map(r => injectCoordenadas(r.data));
}

async function saveEmpreendimentos(items: Empreendimento[]): Promise<void> {
  if (navigator.onLine) {
    const itemsSemImagem = items.map(stripBase64);
    await apiPost('/api/empreendimentos', itemsSemImagem);
    const now = Date.now();
    for (const item of items) {
      await db.empreendimentos.put({ id: item.id, data: item, syncStatus: 'synced', updatedAt: now });
      if ((item as any).mapaImagemBase64) {
        await apiPut(`/api/empreendimentos/${item.id}/mapa`, {
          mapaImagemBase64: (item as any).mapaImagemBase64,
        }).catch(e => console.warn('[db] upload mapa imagem falhou:', e));
      }
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
  await db.empreendimentos.put({ id: item.id, data: item, syncStatus: 'pending', updatedAt: Date.now() });

  if (navigator.onLine) {
    try {
      // 1. Dados básicos sem campos pesados
      const base = stripHeavy(item);
      console.log('[db] upsertEmpreendimento base size:', JSON.stringify(base).length, 'bytes');
      await apiPut(`/api/empreendimentos/${item.id}`, base);

      // 2. mapaPontos separado (pode ser grande com muitas bolinhas)
      if ((item as any).mapaPontos !== undefined) {
        await apiPut(`/api/empreendimentos/${item.id}/pontos`, {
          mapaPontos: (item as any).mapaPontos ?? [],
        });
      }

      // 3. lotesInfo separado
      if ((item as any).lotesInfo !== undefined) {
        await apiPut(`/api/empreendimentos/${item.id}/lotes`, {
          lotesInfo: (item as any).lotesInfo ?? {},
        });
      }

      // 4. Imagem do mapa — NUNCA enviar Base64 pelo servidor (limite Vercel 4.5MB)
      // O upload de imagem vai direto para o Supabase via uploadMapaImagem()
      // Aqui só limpamos o Base64 do servidor se ainda existir
      const base64Val = (item as any).mapaImagemBase64 || '';
      if (base64Val) {
        // Limpar Base64 do servidor — já foi ou será enviado ao Supabase
        await apiPut(`/api/empreendimentos/${item.id}/mapa`, {
          mapaImagemBase64: null,
        });
      }

      await db.empreendimentos.update(item.id, { syncStatus: 'synced' });
      return;
    } catch (err) {
      console.error('[db] upsertEmpreendimento FALHOU:', err);
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

function stripBase64(item: Empreendimento): Empreendimento {
  const {
    mapaImagemBase64,
    mapaImagemLeveBase64,
    mapaImagemMedResBase64,
    mapaImagemHighResBase64,
    mapaPdfOriginalBase64,
    ...rest
  } = item as any;
  return rest as Empreendimento;
}

// Remove tudo pesado — só dados básicos do empreendimento
function stripHeavy(item: Empreendimento): Empreendimento {
  const {
    mapaImagemBase64,
    mapaImagemLeveBase64,
    mapaImagemMedResBase64,
    mapaImagemHighResBase64,
    mapaPdfOriginalBase64,
    mapaPontos,
    lotesInfo,
    ...rest
  } = item as any;
  return rest as Empreendimento;
}

// ── Clientes ──────────────────────────────────────────────────────────────────

async function getClientes(): Promise<Cliente[]> {
  if (navigator.onLine) {
    try {
      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), 8000);
      const res2 = await fetch('/api/clientes', {
        headers: (() => { const t = localStorage.getItem('rumo_auth_token'); return t ? { Authorization: `Bearer ${t}` } : {}; })(),
        signal: controller2.signal,
        cache: 'no-store',
      }).finally(() => clearTimeout(timer2));
      if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
      const items: Cliente[] = await res2.json();
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

async function deleteClienteById(id: string): Promise<void> {
  await db.clientes.delete(id);
  if (navigator.onLine) {
    try {
      await apiDelete(`/api/clientes/${id}`);
      return;
    } catch (err) {
      console.warn('[db] deleteClienteById API falhou, enfileirando:', err);
    }
  }
  await enqueue('cliente', 'delete', id);
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
  deleteClienteById,
  deleteVendaById,
  getAppConfig,
  saveAppConfig,
  subscribeToEmpreendimentos,
  subscribeToClientes,
  subscribeToVendas,
  migrateFromLocalStorage,
  forcSync,
};
