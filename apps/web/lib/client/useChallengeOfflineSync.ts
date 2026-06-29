'use client';

import { useCallback, useEffect, useState } from 'react';
import { listPendingCompletions, syncPendingCompletions } from '@/lib/challenge/offline-queue';

export function useChallengeOfflineSync(onSynced?: () => void) {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => {
    setPending(listPendingCompletions().length);
  }, []);

  const sync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await syncPendingCompletions();
      refresh();
      if (result.synced > 0) onSynced?.();
    } finally {
      setSyncing(false);
    }
  }, [syncing, refresh, onSynced]);

  useEffect(() => {
    refresh();
    void syncPendingCompletions().then((result) => {
      refresh();
      if (result.synced > 0) onSynced?.();
    });
    const onOnline = () => {
      void syncPendingCompletions().then((result) => {
        refresh();
        if (result.synced > 0) onSynced?.();
      });
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [refresh, onSynced]);

  return { pending, syncing, sync, refresh };
}
