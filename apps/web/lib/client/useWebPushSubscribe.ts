'use client';

import { useCallback, useEffect, useState } from 'react';

export function useWebPushSubscribe() {
  const [supported, setSupported] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const isSupported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    setSupported(isSupported);
    void fetch('/api/v1/push/subscribe')
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => setConfigured(Boolean(d.configured)))
      .catch(() => setConfigured(false));

    /**
     * סנכרון מצב אמיתי: בודקים אם כבר קיים מנוי פעיל בדפדפן ואם ההרשאה
     * אושרה. בלי זה ה-UI תמיד מציג "אפשר דחיפה" גם למשתמש רשום, והמנוי
     * המאוחסן בשרת לא מתרענן אם הוא פג/הוחלף.
     */
    if (!isSupported) return;
    void (async () => {
      try {
        if (Notification.permission !== 'granted') return;
        const reg = await navigator.serviceWorker.getRegistration();
        const existing = await reg?.pushManager.getSubscription();
        if (existing) {
          setSubscribed(true);
          /** רענון שקט של המנוי בשרת — מטפל ב-endpoint שהתחלף. */
          void fetch('/api/v1/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(existing.toJSON()),
          }).catch(() => {});
        }
      } catch {
        /** ignore — לא חוסם את ה-UI */
      }
    })();
  }, []);

  const subscribe = useCallback(async () => {
    if (!supported || !configured) {
      setError('התראות דחיפה לא מוגדרות בשרת');
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setError('צריך לאשר התראות בדפדפן');
        return false;
      }

      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await reg.update();

      const keyRes = await fetch('/api/v1/push/subscribe');
      const { publicKey } = (await keyRes.json()) as { publicKey?: string };
      if (!publicKey) throw new Error('missing_vapid');

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const json = sub.toJSON();
      const res = await fetch('/api/v1/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });
      if (!res.ok) throw new Error('save_failed');
      setSubscribed(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בהרשמה');
      return false;
    } finally {
      setBusy(false);
    }
  }, [supported, configured]);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      await fetch('/api/v1/push/subscribe', { method: 'DELETE' });
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, []);

  return { supported, configured, subscribed, busy, error, subscribe, unsubscribe };
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}
