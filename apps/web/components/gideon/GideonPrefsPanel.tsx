'use client';

import { useCallback, useEffect, useState } from 'react';
import { confirmDialog } from '@/components/shared/dialogs';

type Pref = { id: string; kind: string; label: string; params: Record<string, unknown>; active: boolean; source?: string; expires_at?: string | null; description: string };
type Held = { id: number; kind: string; topic: string | null; text: string; deliver_after: string; created_at: string };
type Win = { start: string; end: string; reason: string };
type Data = { prefs: Pref[]; quiet: { until: string; reasons: string[]; emergencies: string } | null; nextWindows: Win[]; held: Held[] };

const CITIES: [string, string][] = [['Jerusalem', 'ירושלים'], ['Tel Aviv', 'תל אביב'], ['Haifa', 'חיפה'], ['Beer Sheva', 'באר שבע'], ['Ashdod', 'אשדוד'], ['Petach Tikvah', 'פתח תקווה'], ['Tiberias', 'טבריה'], ['Eilat', 'אילת']];
const TOPICS: [string, string][] = [['daily', 'עדכון יומי'], ['weekly', 'סיכום שבועי'], ['monthly', 'דוח חודשי'], ['cost', 'התראות עלות'], ['owner_tasks', 'תזכורות משימות'], ['agent_report', 'דיווחי סוכן התוכן'], ['dev_forward', 'עדכונים מאורי']];
const DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const fmt = (s: string) => new Date(s).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const card = 'rounded-3xl border border-slate-200 bg-white p-5';
const btn = 'rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';

export function GideonPrefsPanel() {
  const [d, setD] = useState<Data | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sh, setSh] = useState({ active: true, city: 'Jerusalem', candle_mins: 40, yom_tov: true, emergencies: 'hold' as 'hold' | 'allow' });
  const [kind, setKind] = useState<'quiet_hours' | 'quiet_until' | 'mute_topic' | 'note'>('quiet_hours');
  const [form, setForm] = useState({ label: '', from: '22:00', to: '07:00', days: [] as number[], until: '', topics: [] as string[], note: '', emergencies: 'allow' as 'hold' | 'allow' });

  const load = useCallback(async () => {
    const r = await fetch('/api/v1/admin/ceo/prefs', { credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setNote(j.error ?? 'טעינה נכשלה');
    setD(j);
    const s = (j.prefs as Pref[]).find((p) => p.kind === 'shabbat');
    if (s) setSh({ active: s.active, city: String(s.params.city ?? 'Jerusalem'), candle_mins: Number(s.params.candle_mins ?? 40), yom_tov: s.params.yom_tov !== false, emergencies: s.params.emergencies === 'allow' ? 'allow' : 'hold' });
  }, []);
  useEffect(() => void load(), [load]);

  const post = async (body: Record<string, unknown>, ok = 'נשמר ✅') => {
    setBusy(true);
    setNote(null);
    const r = await fetch('/api/v1/admin/ceo/prefs', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setNote(r.ok ? ok : (j.error ?? 'הפעולה נכשלה'));
    await load();
  };

  const add = () => {
    const pref: Record<string, unknown> = { kind, label: form.label || (kind === 'note' ? form.note : ''), active: true };
    if (kind === 'quiet_hours') Object.assign(pref, { from: form.from, to: form.to, ...(form.days.length ? { days: form.days } : {}) });
    if (kind === 'quiet_until') pref.until = form.until ? new Date(form.until).toISOString() : '';
    if (kind === 'mute_topic') pref.topics = form.topics;
    if (kind === 'note') pref.note = form.note;
    void post({ action: 'add', pref, emergencies: form.emergencies });
  };

  const others = d?.prefs.filter((p) => p.kind !== 'shabbat') ?? [];
  return (
    <div dir="rtl" className="space-y-6">
      {note ? <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm">{note}</p> : null}

      <section className={card}>
        <h2 className="text-lg font-bold">מצב עכשיו</h2>
        <p className="mt-2 text-sm">{d?.quiet ? `🤫 זמן שקט עד ${fmt(d.quiet.until)}. הודעות יזומות מוחזקות${d.quiet.emergencies === 'allow' ? ' (התראות אבטחה עוברות)' : ', כולל התראות אבטחה'}.` : '🔔 אין שקט כרגע. הודעות נשלחות כרגיל.'}</p>
        {d?.held.length ? (
          <div className="mt-3">
            <p className="text-sm font-semibold">ממתינות לשליחה ({d.held.length}):</p>
            <ul className="mt-1 space-y-1 text-xs text-slate-700">
              {d.held.map((h) => <li key={h.id}>• {fmt(h.created_at)} · {h.text}</li>)}
            </ul>
            <div className="mt-2 flex gap-2">
              <button className={btn} disabled={busy} onClick={() => post({ action: 'flush_now' }, 'נשלח לטלגרם ✅')}>שלח עכשיו</button>
              <button className="rounded-2xl border px-4 py-2 text-sm" disabled={busy} onClick={async () => { if (await confirmDialog({ title: 'למחוק את ההודעות הממתינות בלי לשלוח?', danger: true, confirmLabel: 'מחק' })) void post({ action: 'drop_held' }, 'נמחקו'); }}>מחק בלי לשלוח</button>
            </div>
          </div>
        ) : null}
      </section>

      <section className={card}>
        <h2 className="text-lg font-bold">🕯️ שבת וחגים</h2>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={sh.active} onChange={(e) => setSh({ ...sh, active: e.target.checked })} /> לא לשלוח לי כלום בשבת (מהדלקת נרות עד צאת השבת)</label>
        <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={sh.yom_tov} onChange={(e) => setSh({ ...sh, yom_tov: e.target.checked })} /> גם בחגים (יום טוב, ראש השנה, יום כיפור)</label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-sm">עיר (לזמני השקיעה)
            <select value={sh.city} onChange={(e) => setSh({ ...sh, city: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2">{CITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <label className="text-sm">דקות לפני השקיעה
            <input type="number" min={0} max={60} value={sh.candle_mins} onChange={(e) => setSh({ ...sh, candle_mins: Number(e.target.value) })} className="mt-1 w-full rounded-xl border px-3 py-2" />
          </label>
        </div>
        <fieldset className="mt-3 text-sm">
          <legend className="font-semibold">התראות אבטחה דחופות (נעילה, כיבוי, צ׳אט זר) בשבת:</legend>
          <label className="mt-1 flex items-center gap-2"><input type="radio" checked={sh.emergencies === 'hold'} onChange={() => setSh({ ...sh, emergencies: 'hold' })} /> לחכות גם הן לצאת השבת (ברירת מחדל)</label>
          <label className="mt-1 flex items-center gap-2"><input type="radio" checked={sh.emergencies === 'allow'} onChange={() => setSh({ ...sh, emergencies: 'allow' })} /> לשלוח מיד</label>
        </fieldset>
        <button className={`${btn} mt-3`} disabled={busy} onClick={() => post({ action: 'save_shabbat', shabbat: sh })}>שמירה</button>
        {d?.nextWindows.length ? (
          <ul className="mt-3 space-y-0.5 text-xs text-slate-600">
            {d.nextWindows.map((w) => <li key={w.start}>{w.reason === 'yom_tov' ? 'חג' : 'שבת'}: {fmt(w.start)} ← {fmt(w.end)}</li>)}
          </ul>
        ) : null}
      </section>

      <section className={card}>
        <h2 className="text-lg font-bold">הוראות נוספות</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {others.length ? others.map((p) => (
            <li key={p.id} className={`rounded-xl border p-3 ${p.active ? '' : 'opacity-50'}`}>
              <div className="font-semibold">{p.label}</div>
              <div className="text-xs text-slate-600">{p.description} · {p.source === 'gideon' ? 'נשמר דרך גדעון' : 'נוסף כאן'}</div>
              <div className="mt-2 flex gap-2">
                <button className="rounded-xl border px-2 py-1 text-xs" disabled={busy} onClick={() => post({ action: 'set_active', id: p.id, active: !p.active })}>{p.active ? 'השבת' : 'הפעל'}</button>
                <button className="rounded-xl border border-red-200 px-2 py-1 text-xs text-red-700" disabled={busy} onClick={async () => { if (await confirmDialog({ title: 'למחוק את ההוראה?', danger: true, confirmLabel: 'מחק' })) void post({ action: 'delete', id: p.id }, 'נמחק'); }}>מחק</button>
              </div>
            </li>
          )) : <li className="text-slate-500">אין.</li>}
        </ul>

        <div className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-3 text-sm">
          <div className="font-semibold">הוספה</div>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="w-full rounded-xl border px-3 py-2">
            <option value="quiet_hours">שעות שקט קבועות</option>
            <option value="quiet_until">שקט זמני עד…</option>
            <option value="mute_topic">לא לשלוח סוג הודעה</option>
            <option value="note">הערה התנהגותית (לא נאכפת בקוד)</option>
          </select>
          <input placeholder="תיאור במילים שלך" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="w-full rounded-xl border px-3 py-2" />
          {kind === 'quiet_hours' ? (
            <>
              <div className="flex gap-2">
                <label className="flex-1">מ-<input type="time" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} className="w-full rounded-xl border px-3 py-2" /></label>
                <label className="flex-1">עד<input type="time" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className="w-full rounded-xl border px-3 py-2" /></label>
              </div>
              <div className="flex flex-wrap gap-2">{DAYS.map((l, i) => (
                <label key={l} className="flex items-center gap-1"><input type="checkbox" checked={form.days.includes(i)} onChange={(e) => setForm({ ...form, days: e.target.checked ? [...form.days, i] : form.days.filter((x) => x !== i) })} />{l}</label>
              ))}<span className="text-xs text-slate-500">(בלי סימון = כל יום)</span></div>
            </>
          ) : null}
          {kind === 'quiet_until' ? <input type="datetime-local" value={form.until} onChange={(e) => setForm({ ...form, until: e.target.value })} className="w-full rounded-xl border px-3 py-2" /> : null}
          {kind === 'mute_topic' ? (
            <div className="flex flex-wrap gap-2">{TOPICS.map(([v, l]) => (
              <label key={v} className="flex items-center gap-1"><input type="checkbox" checked={form.topics.includes(v)} onChange={(e) => setForm({ ...form, topics: e.target.checked ? [...form.topics, v] : form.topics.filter((x) => x !== v) })} />{l}</label>
            ))}</div>
          ) : null}
          {kind === 'note' ? <textarea placeholder="מה גדעון צריך לזכור תמיד" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full rounded-xl border px-3 py-2" /> : null}
          {kind === 'quiet_hours' || kind === 'quiet_until' ? (
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.emergencies === 'allow'} onChange={(e) => setForm({ ...form, emergencies: e.target.checked ? 'allow' : 'hold' })} /> התראות אבטחה דחופות עוברות גם בזמן הזה</label>
          ) : null}
          <button className={btn} disabled={busy} onClick={add}>הוספה</button>
        </div>
      </section>
    </div>
  );
}
