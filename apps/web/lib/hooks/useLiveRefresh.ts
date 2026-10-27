'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Keeps an admin panel live without a page refresh: re-runs `refresh` every `intervalMs`
 * while the tab is visible, and immediately when the tab regains focus or comes back online.
 * Data still flows through the admin-guarded API routes (no client DB access, no RLS bypass).
 */
export function useLiveRefresh(refresh: () => unknown, intervalMs: number, enabled = true) {
  const fn = useRef(refresh);
  useEffect(() => { fn.current = refresh; }, [refresh]);
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    let last = Date.now();
    const run = () => { if (document.visibilityState !== 'visible') return; last = Date.now(); void fn.current(); };
    const id = window.setInterval(run, intervalMs);
    const onWake = () => { if (Date.now() - last > 2000) run(); };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onWake); window.removeEventListener('focus', onWake); window.removeEventListener('online', onWake); };
  }, [intervalMs, enabled]);
}


/**
 * perf(cpu): event-driven refresh instead of interval polling.
 * Listens on a PRIVATE Supabase Realtime broadcast topic (browser ↔ Supabase directly, 0 Vercel CPU).
 * DB triggers (migration 000220) send an EMPTY "changed" ping; `onPing` then does the normal,
 * fully-authorized API fetch — Realtime never carries data, and RLS on realtime.messages limits who may listen.
 * `topic` may contain `{uid}` (replaced with the signed-in user id). Also fires once on mount, on
 * (re)subscribe, and on focus/visible/online (throttled) as a fallback if the socket was down.
 * `fallbackMs`: safety net for security-relevant UIs — while the channel is NOT subscribed (blocked socket,
 * expired token, Realtime outage) and the tab is visible, keep the old interval so alerts never get slower.
 */
export function useRealtimePing(topic: string | null, onPing: () => void, fallbackMs?: number) {
  const cb = useRef(onPing);
  cb.current = onPing;

  useEffect(() => {
    if (!topic) return;
    let alive = true;
    let last = 0;
    let live = false;
    const fire = (force = false) => {
      if (!alive) return;
      if (!force && Date.now() - last < 2000) return;
      last = Date.now();
      cb.current();
    };
    fire(true);

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!alive || (topic.includes('{uid}') && !uid)) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      if (!alive) return;
      channel = supabase
        .channel(topic.replace('{uid}', uid ?? ''), { config: { private: true } })
        .on('broadcast', { event: 'changed' }, () => fire(true))
        .subscribe((status) => { live = status === 'SUBSCRIBED'; if (live) fire(); });
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { void supabase.realtime.setAuth(s?.access_token ?? null); });

    const safety = fallbackMs
      ? setInterval(() => { if (!live && document.visibilityState === 'visible') fire(true); }, fallbackMs)
      : null;
    const onWake = () => { if (document.visibilityState === 'visible') fire(); };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);
    return () => {
      alive = false;
      if (safety) clearInterval(safety);
      sub.subscription.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
    };
  }, [topic, fallbackMs]);
}
