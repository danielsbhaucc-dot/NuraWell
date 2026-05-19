'use client';

import { Bell } from 'lucide-react';
import { useWebPushSubscribe } from '../../lib/client/useWebPushSubscribe';

export function WebPushEnableCard() {
  const webPush = useWebPushSubscribe();
  if (!webPush.supported) return null;

  return (
    <div className="rounded-2xl border border-sky-100 bg-sky-50/80 p-4 space-y-2">
      <p className="flex items-center gap-2 text-sm font-bold text-sky-900">
        <Bell className="h-4 w-4" aria-hidden />
        התראות למכשיר
      </p>
      {!webPush.configured ? (
        <p className="text-xs text-slate-500">דורש WEB_PUSH_VAPID_* בשרת.</p>
      ) : (
        <button
          type="button"
          disabled={webPush.busy}
          onClick={() => void (webPush.subscribed ? webPush.unsubscribe() : webPush.subscribe())}
          className="w-full rounded-xl bg-sky-600 py-2.5 text-sm font-bold text-white"
        >
          {webPush.subscribed ? 'בטל דחיפה' : 'אפשר דחיפה — כמו הודעה מאלמוג'}
        </button>
      )}
      {webPush.error ? <p className="text-xs text-red-600">{webPush.error}</p> : null}
    </div>
  );
}
