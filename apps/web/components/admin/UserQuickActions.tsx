'use client';

import { useState } from 'react';

/** Same actions Gideon has: pause notifications, send an in-app notification in Almog's voice. */
export function UserQuickActions({ userId }: { userId: string | null }) {
  const [days, setDays] = useState(7);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  if (!userId) return null;
  const call = async (payload: Record<string, unknown>, ok: string) => {
    setMsg(null);
    const r = await fetch(`/api/v1/admin/users/${userId}/quick-actions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? ok : d.error ?? 'שגיאה');
  };
  return (
    <div dir="rtl" className="space-y-3 rounded-2xl border border-hairline bg-gc px-4 py-3 text-sm shadow-xs">
      <p className="font-semibold text-ink">פעולות מהירות</p>
      <div className="flex flex-wrap items-center gap-2">
        <span>השהיית התראות ל-</span>
        <input type="number" min={0} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-16 rounded-lg border px-2 py-1" />
        <span>ימים</span>
        <button className="rounded-xl bg-ink-900 px-3 py-1.5 text-gc" onClick={() => call({ action: 'pause', days }, days ? `ההתראות הושהו ל-${days} ימים` : 'ההתראות חודשו')}>
          {days ? 'השהה' : 'חדש התראות'}
        </button>
      </div>
      <div className="space-y-2">
        <input placeholder="כותרת התראה" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border px-2 py-1.5" />
        <textarea placeholder="תוכן (בקול של אלמוג)" value={body} onChange={(e) => setBody(e.target.value)} className="w-full rounded-lg border px-2 py-1.5" rows={2} />
        <button disabled={title.length < 2 || body.length < 2} className="rounded-xl bg-primary-700 px-3 py-1.5 text-gc disabled:opacity-50" onClick={() => call({ action: 'notify', title, body }, 'ההתראה נשלחה')}>
          שליחת התראה
        </button>
      </div>
      {msg ? <p className="text-xs text-ink-soft">{msg}</p> : null}
    </div>
  );
}
