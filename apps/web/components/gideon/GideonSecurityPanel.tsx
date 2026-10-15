'use client';

import { useCallback, useEffect, useState } from 'react';

type State = { disabled: boolean; disabled_reason: string | null; locked_until: string | null; failed_stepups: number; stepup_trust_minutes: number; reverify_minutes: number; trusted_until: string | null; last_verified_at: string | null };
type Key = { label: string; created_at: string; last_used_at: string | null };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '—');

export function GideonSecurityPanel() {
  const [st, setSt] = useState<State | null>(null);
  const [keys, setKeys] = useState<Key[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [trust, setTrust] = useState(240);
  const [reverify, setReverify] = useState(1440);
  const [regUrl, setRegUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/v1/admin/ceo/security', { credentials: 'include' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(d.error ?? 'טעינה נכשלה');
    setSt(d.state);
    setKeys(d.passkeys);
    setTrust(d.state.stepup_trust_minutes);
    setReverify(d.state.reverify_minutes);
  }, []);
  useEffect(() => void load(), [load]);

  const post = async (body: Record<string, unknown>) => {
    setErr(null);
    const r = await fetch('/api/v1/admin/ceo/security', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setErr(d.error ?? 'הפעולה נכשלה');
    return r.ok ? d : null;
  };

  const locked = st?.locked_until && Date.parse(st.locked_until) > Date.now();
  return (
    <div dir="rtl" className="space-y-6">
      {err ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p> : null}
      <section className="rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold">מצב</h2>
        <p className="mt-2 text-sm">
          {st?.disabled ? '⛔ גדעון כבוי' : locked ? `🔒 נעול עד ${fmt(st!.locked_until)}` : '✅ פעיל'}
          {' · '}חלון אמון עד: {fmt(st?.trusted_until ?? null)} · אימות אחרון: {fmt(st?.last_verified_at ?? null)}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="rounded-2xl bg-red-600 px-4 py-2.5 font-semibold text-white"
            onClick={async () => { if (confirm('לכבות את גדעון עכשיו? כל הפעולות הממתינות יבוטלו.')) { await post({ action: 'kill', reason: 'Ops kill switch' }); await load(); } }}
          >
            ⛔ כיבוי מיידי (Kill switch)
          </button>
          {(st?.disabled || locked) ? (
            <button
              className="rounded-2xl bg-emerald-700 px-4 py-2.5 font-semibold text-white"
              onClick={async () => { const d = await post({ action: 'unlock_link' }); if (d?.url) window.location.href = d.url; }}
            >
              🔓 שחרר והפעל עכשיו (Face ID)
            </button>
          ) : null}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold">מפתחות Face ID / טביעת אצבע</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {keys.length ? keys.map((k, i) => <li key={i}>🔑 {k.label || 'מפתח'} · נרשם {fmt(k.created_at)} · שימוש אחרון {fmt(k.last_used_at)}</li>) : <li>עוד לא נרשם מפתח. בלי מפתח, פעולות רגישות חסומות.</li>}
        </ul>
        <button className="mt-3 rounded-2xl bg-slate-900 px-4 py-2.5 font-semibold text-white" onClick={async () => { const d = await post({ action: 'register_link' }); if (d?.url) setRegUrl(d.url); }}>
          + רישום מפתח חדש
        </button>
        {regUrl ? (
          <p className="mt-3 break-all text-sm">
            פתח בטלפון תוך 10 דקות (בדפדפן, לא בתוך טלגרם): <a className="text-emerald-700 underline" href={regUrl}>{regUrl}</a>
          </p>
        ) : null}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold">זמנים</h2>
        <label className="mt-3 block text-sm">חלון אמון אחרי Face ID (דקות, פעולות רגישות בלי לשאול שוב)
          <input type="number" min={0} max={1440} value={trust} onChange={(e) => setTrust(Number(e.target.value))} className="mt-1 w-full rounded-xl border px-3 py-2" />
        </label>
        <label className="mt-3 block text-sm">אימות תקופתי לכל אישור (דקות, 0 = כבוי)
          <input type="number" min={0} max={20160} value={reverify} onChange={(e) => setReverify(Number(e.target.value))} className="mt-1 w-full rounded-xl border px-3 py-2" />
        </label>
        <button className="mt-3 rounded-2xl bg-slate-900 px-4 py-2.5 font-semibold text-white" onClick={async () => { await post({ action: 'trust', trust_minutes: trust, reverify_minutes: reverify }); await load(); }}>
          שמירה
        </button>
      </section>
    </div>
  );
}
