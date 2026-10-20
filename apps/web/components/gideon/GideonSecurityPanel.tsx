'use client';

import { useCallback, useEffect, useState } from 'react';
import { confirmDialog } from '@/components/shared/dialogs';

type State = { disabled: boolean; locked_until: string | null; stepup_trust_minutes: number; reverify_minutes: number; trusted_until: string | null; last_verified_at: string | null };
type Device = { id: string; label: string; created_at: string; last_used_at: string | null };
type Req = { id: string; replace: boolean; created_at: string };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '—');

/** Ops side of Gideon security. Face ID itself always happens in Telegram (Mini App), never here. */
export function GideonSecurityPanel() {
  const [st, setSt] = useState<State | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [trust, setTrust] = useState(240);
  const [reverify, setReverify] = useState(1440);

  const load = useCallback(async () => {
    const r = await fetch('/api/v1/admin/ceo/security', { credentials: 'include' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setNote(d.error ?? 'טעינה נכשלה');
    setSt(d.state);
    setDevices(d.devices);
    setReqs(d.requests);
    setTrust(d.state.stepup_trust_minutes);
    setReverify(d.state.reverify_minutes);
  }, []);
  useEffect(() => void load(), [load]);

  const post = async (body: Record<string, unknown>) => {
    setNote(null);
    const r = await fetch('/api/v1/admin/ceo/security', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setNote(d.error ?? 'הפעולה נכשלה');
    else if (d.sentToTelegram) setNote('📲 נשלח לגדעון בטלגרם. אשר שם עם Face ID.');
    await load();
  };

  const locked = st?.locked_until && Date.parse(st.locked_until) > Date.now();
  return (
    <div dir="rtl" className="space-y-6">
      {note ? <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm">{note}</p> : null}

      {reqs.length ? (
        <section className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-5">
          <h2 className="text-lg font-bold">🔔 בקשות רישום Face ID מגדעון</h2>
          {reqs.map((r) => (
            <div key={r.id} className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">{r.replace ? 'החלפת מכשיר (הקודמים יוסרו)' : 'רישום מכשיר'} · {fmt(r.created_at)}</span>
              <span className="flex gap-2">
                <button className="rounded-xl bg-emerald-700 px-3 py-1.5 text-white" onClick={() => post({ action: 'approve_device', id: r.id })}>✅ אשר</button>
                <button className="rounded-xl border px-3 py-1.5" onClick={() => post({ action: 'reject_device', id: r.id })}>❌ דחה</button>
              </span>
            </div>
          ))}
          <p className="mt-2 text-xs text-slate-600">אחרי האישור גדעון ישלח בטלגרם כפתור רישום חד-פעמי (10 דקות).</p>
        </section>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold">מצב</h2>
        <p className="mt-2 text-sm">
          {st?.disabled ? '⛔ גדעון כבוי' : locked ? `🔒 נעול עד ${fmt(st!.locked_until)}` : '✅ פעיל'} · חלון אמון עד: {fmt(st?.trusted_until ?? null)} · אימות אחרון: {fmt(st?.last_verified_at ?? null)}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="rounded-2xl bg-red-600 px-4 py-2.5 font-semibold text-white" onClick={async () => { if (await confirmDialog({ title: 'לכבות את גדעון עכשיו?', message: 'כל הפעולות הממתינות יבוטלו.', danger: true, confirmLabel: 'כבה' })) void post({ action: 'kill', reason: 'Ops kill switch' }); }}>
            ⛔ כיבוי מיידי
          </button>
          {st?.disabled || locked ? (
            <button className="rounded-2xl bg-emerald-700 px-4 py-2.5 font-semibold text-white" onClick={() => post({ action: 'unlock' })}>
              🔓 שחרר והפעל {devices.length ? '(Face ID בטלגרם)' : ''}
            </button>
          ) : null}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold">מכשירים עם Face ID</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {devices.length ? devices.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-2">
              <span>📱 {k.label || 'מכשיר'} · נרשם {fmt(k.created_at)} · שימוש אחרון {fmt(k.last_used_at)}</span>
              <button className="rounded-xl border border-red-200 px-2 py-1 text-xs text-red-700" onClick={async () => { if (await confirmDialog({ title: 'להסיר את המכשיר?', message: 'האישור יישלח לטלגרם.', danger: true, confirmLabel: 'הסר' })) void post({ action: 'remove_key', id: k.id }); }}>הסר</button>
            </li>
          )) : <li>עוד לא נרשם מכשיר. עד אז פעולות רגישות חסומות.</li>}
        </ul>
        <button className="mt-3 rounded-2xl bg-slate-900 px-4 py-2.5 font-semibold text-white" onClick={() => post({ action: 'new_device', replace: devices.length > 0 })}>
          {devices.length ? 'החלפת מכשיר (שליחת כפתור רישום לטלגרם)' : 'רישום Face ID (שליחת כפתור לטלגרם)'}
        </button>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold">זמנים</h2>
        <label className="mt-3 block text-sm">חלון אמון אחרי Face ID (דקות)
          <input type="number" min={0} max={1440} value={trust} onChange={(e) => setTrust(Number(e.target.value))} className="mt-1 w-full rounded-xl border px-3 py-2" />
        </label>
        <label className="mt-3 block text-sm">אימות תקופתי לכל אישור (דקות, 0 = כבוי)
          <input type="number" min={0} max={20160} value={reverify} onChange={(e) => setReverify(Number(e.target.value))} className="mt-1 w-full rounded-xl border px-3 py-2" />
        </label>
        <button className="mt-3 rounded-2xl bg-slate-900 px-4 py-2.5 font-semibold text-white" onClick={() => post({ action: 'trust', trust_minutes: trust, reverify_minutes: reverify })}>
          שמירה (אישור ב-Face ID בטלגרם)
        </button>
      </section>
    </div>
  );
}
