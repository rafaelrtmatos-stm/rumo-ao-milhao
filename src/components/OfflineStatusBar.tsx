/**
 * OfflineStatusBar.tsx
 * Barra de status de conectividade/sync para o topo do app.
 *
 * Uso no App.tsx:
 *   import { OfflineStatusBar } from './components/OfflineStatusBar';
 *   // Coloca logo antes ou depois do header principal
 *   <OfflineStatusBar />
 */

import React from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSyncStatus } from '../hooks/useSyncStatus';

export function OfflineStatusBar() {
  const { isOnline, pendingCount, isSyncing, lastSyncAt, triggerSync } = useSyncStatus();

  // Online e sem pendentes: não mostra nada (não atrapalha a UI)
  if (isOnline && pendingCount === 0 && !isSyncing) {
    return null;
  }

  const bgColor = !isOnline
    ? 'bg-red-900/80 border-red-700'
    : pendingCount > 0
    ? 'bg-yellow-900/80 border-yellow-700'
    : 'bg-green-900/80 border-green-700';

  const textColor = !isOnline
    ? 'text-red-200'
    : pendingCount > 0
    ? 'text-yellow-200'
    : 'text-green-200';

  return (
    <div
      className={`flex items-center justify-between px-4 py-2 text-xs border-b ${bgColor} ${textColor} backdrop-blur-sm`}
      style={{ minHeight: 36 }}
    >
      <div className="flex items-center gap-2">
        {!isOnline ? (
          <WifiOff size={14} className="shrink-0" />
        ) : isSyncing ? (
          <RefreshCw size={14} className="shrink-0 animate-spin" />
        ) : pendingCount > 0 ? (
          <AlertCircle size={14} className="shrink-0" />
        ) : (
          <CheckCircle2 size={14} className="shrink-0" />
        )}

        <span className="font-medium">
          {!isOnline
            ? 'Sem internet — dados salvos localmente'
            : isSyncing
            ? 'Sincronizando...'
            : pendingCount > 0
            ? `${pendingCount} alteração${pendingCount > 1 ? 'ões' : ''} aguardando sync`
            : 'Sincronizado'}
        </span>

        {lastSyncAt && !isSyncing && (
          <span className="opacity-60">
            · último sync {lastSyncAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {isOnline && pendingCount > 0 && !isSyncing && (
        <button
          onClick={triggerSync}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-white/10 hover:bg-white/20 transition-colors"
        >
          <RefreshCw size={12} />
          Sincronizar
        </button>
      )}
    </div>
  );
}
