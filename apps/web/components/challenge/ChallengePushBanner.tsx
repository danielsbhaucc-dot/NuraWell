'use client';

import { Bell } from 'lucide-react';
import { useWebPushSubscribe } from '@/lib/client/useWebPushSubscribe';

export function ChallengePushBanner() {
  const { supported, configured, subscribed, busy, error, subscribe } = useWebPushSubscribe();

  if (!supported || !configured || subscribed) return null;

  return (
    <div className="mb-4 rounded-2xl border border-secondary-400/30 bg-secondary-500/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 h-5 w-5 shrink-0 text-secondary-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-secondary-100">תזכורות לאתגר</p>
          <p className="mt-0.5 text-xs text-on-dark/50">
            קבלו התראות על משימות בוקר, סגירת חלון אכילה וסיום האתגר.
          </p>
          {error ? <p className="mt-1 text-xs text-coral-300">{error}</p> : null}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void subscribe()}
          className="shrink-0 rounded-xl bg-secondary-500 px-3 py-1.5 text-xs font-bold text-on-dark disabled:opacity-60"
        >
          {busy ? '...' : 'הפעל'}
        </button>
      </div>
    </div>
  );
}
