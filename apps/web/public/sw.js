/* Service worker — התראות Web Push מאלמוג
 *
 * שתי התנהגויות לפי מצב האפליקציה:
 *  1. כשהאפליקציה ב-foreground (יש client visible): שולחים postMessage
 *     לחלון, **לא** מציגים system notification. ה-`NotificationsProvider`
 *     קולט את ההודעה ומציג toast יפה ב-app.
 *  2. כשאין client visible (PWA סגור / רקע / טאב מאחור): מציגים
 *     notification רגיל של מערכת ההפעלה. זו ה-PWA push הקלאסית.
 *
 * כך המשתמש לעולם לא רואה כפילות (toast + system notification ביחד),
 * וכך התראה מורגשת מיד גם כשהמסך פתוח.
 */

self.addEventListener('push', (event) => {
  let payload = { title: 'אלמוג', body: 'יש לי משהו בשבילך' };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    /* ignore */
  }

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // foreground = יש לפחות חלון visible פוקוסד
      const visibleClient = allClients.find(
        (c) => c.visibilityState === 'visible' && c.focused
      );

      if (visibleClient) {
        // האפליקציה פתוחה — נעביר postMessage ל-toast, בלי system notification.
        for (const client of allClients) {
          client.postMessage({
            type: 'live-notification',
            payload: {
              id: payload.id || `push-${Date.now()}`,
              title: payload.title || 'אלמוג',
              body: payload.body || '',
              icon_emoji: payload.icon_emoji ?? null,
              action_url: payload.url || payload.action_url || null,
              is_read: false,
              created_at: payload.created_at || new Date().toISOString(),
              type: payload.type || 'ai_message',
              archived_at: null,
              metadata: payload.metadata || {
                source: payload.source ?? null,
                mentor: payload.mentor ?? 'almog',
              },
            },
          });
        }
        return;
      }

      // הרקע — system notification רגיל
      await self.registration.showNotification(payload.title || 'אלמוג', {
        body: payload.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        dir: 'rtl',
        lang: 'he',
        tag: payload.tag || 'almog',
        data: { url: payload.url || '/home' },
      });
    })()
  );
});

/* חידוש מנוי כשהדפדפן מסובב/מבטל אותו — אחרת ה-push נדם בשקט. */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch('/api/v1/push/subscribe');
        const { publicKey } = await res.json();
        if (!publicKey) return;
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        await fetch('/api/v1/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        });
      } catch {
        /* ignore */
      }
    })()
  );
});

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/home';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
