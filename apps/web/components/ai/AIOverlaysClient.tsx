'use client';

import { useEffect } from 'react';
import { AIChatWidget } from './AIChatWidget';
import { AlmogReplyModal } from '../notifications/AlmogReplyModal';

type AIOverlaysClientProps = {
  userId: string;
};

const SYNC_THROTTLE_MS = 10 * 60 * 1000;
const SYNC_KEY = 'almog:lastReminderSync';

/**
 * רשת ביטחון לתזכורות: כשהמשתמש פעיל, מנקזים תזכורות שהגיע זמנן (גיבוי ל-CRON).
 * Throttle של 10 דק' כדי לא להעמיס, רץ ברקע בלי לחסום את ה-UI.
 */
function useReminderSelfHeal() {
  useEffect(() => {
    const run = () => {
      try {
        const last = Number(localStorage.getItem(SYNC_KEY) || '0');
        if (Date.now() - last < SYNC_THROTTLE_MS) return;
        localStorage.setItem(SYNC_KEY, String(Date.now()));
      } catch {
        /* localStorage חסום — ממשיכים בכל זאת */
      }
      fetch('/api/v1/ai/sync-reminders', {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
      }).catch(() => {});
    };

    const t = window.setTimeout(run, 1500);
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}

export function AIOverlaysClient({ userId }: AIOverlaysClientProps) {
  useReminderSelfHeal();
  return (
    <>
      <AIChatWidget userId={userId} />
      <AlmogReplyModal />
    </>
  );
}
