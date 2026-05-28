'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '../supabase/client';

/**
 * use-progress-live-refresh
 * --------------------------
 * Realtime listener שמפעיל callback ברגע שיש שינוי בנתוני המסע של המשתמש:
 *   - journey_progress         (קבלה/דחייה של משימות, השלמת צעד, סיכום)
 *   - journey_task_executions  (סימון ביצוע יומי / סלוט)
 *
 * שתי הטבלאות כבר נכללות ב-publication `supabase_realtime` (מיגרציות 000022/000023),
 * כך ש-RLS מבטיח שהמשתמש מקבל רק את האירועים של עצמו (filter `user_id=eq.${userId}`).
 *
 * השימוש: מסכי `/progress` ו-`/progress/history` קוראים ל-`router.refresh()` או
 * fetch של ה-API לאחר שמתקבל אירוע. ה-callback מקבל `'progress' | 'execution'`
 * כדי שניתן לבחור התנהגות שונה (דיבאונס, רענון מלא וכו').
 *
 * הגנה מ-storms: `cooldownMs` (ברירת מחדל 800ms) — מבטיח שאם המשתמש סימן מספר
 * סלוטים ברצף, נריץ רענון אחד בלבד בסיום, לא 3-5.
 */
export type ProgressLiveSource = 'progress' | 'execution';

export function useProgressLiveRefresh(
  userId: string,
  onChange: (source: ProgressLiveSource) => void,
  cooldownMs = 800
): void {
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    let pending: ProgressLiveSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (source: ProgressLiveSource) => {
      pending = pending === 'progress' || source === 'progress' ? 'progress' : source;
      if (timer) return;
      timer = setTimeout(() => {
        const src = pending ?? 'execution';
        pending = null;
        timer = null;
        cbRef.current(src);
      }, cooldownMs);
    };

    const channel = supabase
      .channel(`progress-live-refresh-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'journey_progress',
          filter: `user_id=eq.${userId}`,
        },
        () => schedule('progress')
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'journey_task_executions',
          filter: `user_id=eq.${userId}`,
        },
        () => schedule('execution')
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [userId, cooldownMs]);
}
