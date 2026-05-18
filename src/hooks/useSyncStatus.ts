/**
 * useSyncStatus.ts
 * Hook React que expõe o status de conectividade e sincronização.
 * Use no App.tsx para mostrar indicador de offline/sync.
 */

import { useState, useEffect } from 'react';
import { onSyncStatusChange, getPendingCount, processSyncQueue } from '../syncService';

export interface SyncStatus {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncAt: Date | null;
}

export function useSyncStatus(): SyncStatus & { triggerSync: () => Promise<void> } {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

  useEffect(() => {
    // Atualiza contagem de pendentes a cada 5 segundos
    const updatePending = async () => {
      const count = await getPendingCount();
      setPendingCount(count);
    };

    updatePending();
    const interval = setInterval(updatePending, 5000);

    // Listener de conectividade do syncService
    const unsub = onSyncStatusChange((online) => {
      setIsOnline(online);
      if (online) {
        setLastSyncAt(new Date());
        // Atualiza pendentes após sync
        setTimeout(updatePending, 1000);
      }
    });

    return () => {
      clearInterval(interval);
      unsub();
    };
  }, []);

  const triggerSync = async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);
    try {
      await processSyncQueue();
      const count = await getPendingCount();
      setPendingCount(count);
      setLastSyncAt(new Date());
    } finally {
      setIsSyncing(false);
    }
  };

  return { isOnline, pendingCount, isSyncing, lastSyncAt, triggerSync };
}
