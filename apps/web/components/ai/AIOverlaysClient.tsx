'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import {
  OPEN_ALMOG_CHAT_EVENT,
  stashPendingOpenAlmogChat,
  type OpenAlmogChatDetail,
} from '../../lib/notifications/open-almog-chat';
import { runWhenIdle } from '../../lib/client/run-when-idle';

type AIOverlaysClientProps = {
  userId: string;
  firstName?: string;
};

const SYNC_THROTTLE_MS = 20 * 60 * 1000;
const SYNC_KEY = 'almog:lastReminderSync';

const AIChatWidgetLazy = dynamic(
  () => import('./AIChatWidget').then((m) => m.AIChatWidget),
  { ssr: false, loading: () => null }
);

const AlmogReplyModalLazy = dynamic(
  () => import('../notifications/AlmogReplyModal').then((m) => m.AlmogReplyModal),
  { ssr: false, loading: () => null }
);

/**
 * רשת ביטחון לתזכורות: כשהמשתמש פעיל, מנקזים תזכורות שהגיע זמנן (גיבוי ל-CRON).
 * Idle + throttle 20 דק' — לא על critical path של טעינת הדשבורד.
 */
function useReminderSelfHeal() {
  useEffect(() => {
    const run = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
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

    const cancelIdle = runWhenIdle(run, 4500);
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelIdle();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}

function ChatFabPlaceholder({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-label="שיחה עם אלמוג"
      onClick={onOpen}
      className="fixed z-[190] flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full text-white shadow-lg md:h-[3.5rem] md:w-[3.5rem]"
      style={{
        bottom: 'calc(7.25rem + env(safe-area-inset-bottom, 0px))',
        right: 'calc(1rem + env(safe-area-inset-right, 0px))',
        background: 'linear-gradient(145deg, #047857, #10b981)',
        boxShadow: '0 10px 28px rgba(16,185,129,0.35)',
      }}
    >
      <MessageCircle className="h-7 w-7 md:h-8 md:w-8" strokeWidth={2} />
    </button>
  );
}

export function AIOverlaysClient({ userId, firstName }: AIOverlaysClientProps) {
  useReminderSelfHeal();
  const [chatLoaded, setChatLoaded] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);

  useEffect(() => {
    const onOpenChat = (e: Event) => {
      const detail = (e as CustomEvent<OpenAlmogChatDetail>).detail;
      stashPendingOpenAlmogChat(detail ?? null);
      setAutoOpen(true);
      setChatLoaded(true);
    };
    window.addEventListener(OPEN_ALMOG_CHAT_EVENT, onOpenChat);
    return () => window.removeEventListener(OPEN_ALMOG_CHAT_EVENT, onOpenChat);
  }, []);

  return (
    <>
      {chatLoaded ? (
        <AIChatWidgetLazy userId={userId} firstName={firstName} autoOpen={autoOpen} />
      ) : (
        <ChatFabPlaceholder
          onOpen={() => {
            setAutoOpen(true);
            setChatLoaded(true);
          }}
        />
      )}
      <AlmogReplyModalLazy />
    </>
  );
}
