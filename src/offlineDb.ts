/**
 * offlineDb.ts
 * Banco local usando IndexedDB via Dexie.js.
 * Armazena empreendimentos, clientes, vendas, config e fila de sync.
 */

import Dexie, { Table } from 'dexie';
import { Empreendimento, Cliente, Venda, AppConfig } from './types';

// Marca de sync em cada registro
export type SyncStatus = 'synced' | 'pending' | 'deleted';

export interface LocalRecord<T> {
  data: T;
  syncStatus: SyncStatus;
  updatedAt: number; // timestamp ms
}

export interface SyncQueueItem {
  id?: number; // auto-incremento
  entity: 'empreendimento' | 'cliente' | 'venda' | 'config';
  operation: 'upsert' | 'delete';
  entityId: string;
  payload?: unknown;
  createdAt: number;
  attempts: number;
}

class RumoDB extends Dexie {
  empreendimentos!: Table<LocalRecord<Empreendimento> & { id: string }>;
  clientes!: Table<LocalRecord<Cliente> & { id: string }>;
  vendas!: Table<LocalRecord<Venda> & { id: string }>;
  config!: Table<{ id: string; data: AppConfig; syncStatus: SyncStatus; updatedAt: number }>;
  syncQueue!: Table<SyncQueueItem>;

  constructor() {
    super('RumoDB');
    this.version(1).stores({
      empreendimentos: 'id, syncStatus, updatedAt',
      clientes: 'id, syncStatus, updatedAt',
      vendas: 'id, syncStatus, updatedAt',
      config: 'id',
      syncQueue: '++id, entity, entityId, createdAt, attempts',
    });
  }
}

export const db = new RumoDB();
