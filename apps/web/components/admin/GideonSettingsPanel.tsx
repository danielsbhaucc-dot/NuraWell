'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import type { GideonSettings } from '@/lib/ceo/settings';

type Recipient = { chat_id: string; label: string };
const TOPICS: Array<[keyof GideonSettings['alert_topics'], string]> = [
  ['daily', 'עדכון יומי'],
  ['weekly', 'סיכום שבועי'],
  ['monthly', 'דוח חודשי'],
  ['cost', 'התראת חריגת עלות'],
  ['owner_tasks', 'תזכורות משימות שלי'],
];

/** /ops/ceo/settings — Gideon: cost-alert thresholds, digest time, topics, recipients, tokens. */
export function GideonSettingsPanel() {
  const [s, setS] = useState<GideonSettings | null>(null);
  const [token, setToken] = useState('');
  const [secret, setSecret] = useState('');
  const [clear, setClear] = useState<{ token: boolean; secret: boolean }>({ token: false, secret: false });
  const [newR, setNewR] = useState<Recipient>({ chat_id: '', label: '' });
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; msg?: string }>({ kind: 'idle' });

  useEffect(() => {
    fetch('/api/v1/admin/gideon-settings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { settings?: GideonSettings }) => j.settings && setS(j.settings))
      .catch(() => setState({ kind: 'error', msg: 'טעינה נכשלה' }));
  }, []);

  if (!s) return <div className="flex items-center gap-2 p-4 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> טוען הגדרות…</div>;

  const set = (p: Partial<GideonSettings>) => {
    setS({ ...s, ...p });
    setState({ kind: 'idle' });
  };
  const numField = (label: string, k: 'cost_ratio_threshold' | 'cost_min_delta_usd' | 'cost_per_user_min_delta_usd' | 'cost_max_single_user_share', step: number, hint: string) => (
    <label className="text-sm">
      <span className="block font-semibold text-slate-900">{label}</span>
      <input type="number" step={step} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1" value={s[k]} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<GideonSettings>)} />
      <span className="block text-xs text-slate-500">{hint}</span>
    </label>
  );

  const addRecipient = () => {
    if (!/^-?\d{3,20}$/.test(newR.chat_id.trim())) return setState({ kind: 'error', msg: 'Chat ID חייב להיות מספר (אפשר עם מינוס לקבוצה)' });
    if (s.recipients.some((r) => r.chat_id === newR.chat_id.trim())) return;
    set({ recipients: [...s.recipients, { chat_id: newR.chat_id.trim(), label: newR.label.trim() }] });
    setNewR({ chat_id: '', label: '' });
  };

  const save = async () => {
    setState({ kind: 'saving' });
    const { telegram_bot_token_hint: _a, telegram_webhook_secret_hint: _b, updated_at: _c, ...rest } = s;
    const body: Record<string, unknown> = { ...rest };
    if (token.trim()) body.telegram_bot_token = token.trim();
    else if (clear.token) body.telegram_bot_token = '';
    if (secret.trim()) body.telegram_webhook_secret = secret.trim();
    else if (clear.secret) body.telegram_webhook_secret = '';
    const res = await fetch('/api/v1/admin/gideon-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as { settings?: GideonSettings; error?: string };
    if (!res.ok || !j.settings) return setState({ kind: 'error', msg: j.error ?? 'השמירה נכשלה' });
    setS(j.settings);
    setToken('');
    setSecret('');
    setClear({ token: false, secret: false });
    setState({ kind: 'saved' });
  };

  const card = 'rounded-2xl bg-white p-4 ring-1 ring-slate-200';
  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <section className={card}>
        <h2 className="mb-1 text-base font-bold text-slate-900">התראת חריגת עלות מערכתית</h2>
        <p className="mb-3 text-xs text-slate-500">גדעון מתריע כשהעלות אתמול גבוהה מהחציון של 14 הימים הקודמים לפי הספים כאן, ולא כשמשתמש כבד אחד אחראי לרוב העלות.</p>
        <div className="grid grid-cols-2 gap-3">
          {numField('פי כמה מהרגיל', 'cost_ratio_threshold', 0.1, 'ברירת מחדל 2.5')}
          {numField('תוספת מינימלית לרכיב ($)', 'cost_min_delta_usd', 0.05, 'ברירת מחדל 0.25')}
          {numField('תוספת מינימלית למשתמש פעיל ($)', 'cost_per_user_min_delta_usd', 0.01, 'ברירת מחדל 0.02')}
          {numField('חלק מקסימלי של משתמש יחיד', 'cost_max_single_user_share', 0.05, 'מעל זה, נחשב משתמש כבד ולא באג (0.6)')}
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-2 text-base font-bold text-slate-900">עדכונים ונושאים</h2>
        <label className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={s.digest_enabled} onChange={(e) => set({ digest_enabled: e.target.checked })} /> לשלוח עדכונים בטלגרם</label>
        <label className="mt-1 block text-sm">
          <span className="font-semibold text-slate-900">שעת העדכון (שעון ישראל)</span>
          <select className="mt-1 block rounded-lg border border-slate-300 px-2 py-1" value={s.digest_hour} onChange={(e) => set({ digest_hour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        </label>
        <div className="mt-2 grid grid-cols-2 gap-1">
          {TOPICS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 py-1 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={s.alert_topics[k]} onChange={(e) => set({ alert_topics: { ...s.alert_topics, [k]: e.target.checked } })} /> {label}
            </label>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-1 text-base font-bold text-slate-900">נמענים</h2>
        <p className="mb-2 text-xs text-slate-500">מקבלים עדכונים והתראות בלבד. מתן פקודות לגדעון נשאר רק לצ&apos;אטים המורשים בהגדרות השרת.</p>
        <ul className="mb-2 divide-y divide-slate-100">
          {s.recipients.length === 0 ? <li className="py-1 text-sm text-slate-500">אין נמענים נוספים</li> : null}
          {s.recipients.map((r) => (
            <li key={r.chat_id} className="flex items-center justify-between py-1.5 text-sm">
              <span><span className="font-semibold">{r.label || 'ללא שם'}</span> <span dir="ltr" className="font-mono text-slate-500">{r.chat_id}</span></span>
              <button type="button" aria-label={`הסר ${r.label || r.chat_id}`} onClick={() => set({ recipients: s.recipients.filter((x) => x.chat_id !== r.chat_id) })} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input dir="ltr" placeholder="Chat ID" className="w-36 rounded-lg border border-slate-300 px-2 py-1 text-sm" value={newR.chat_id} onChange={(e) => setNewR({ ...newR, chat_id: e.target.value })} />
          <input placeholder="שם (לא חובה)" className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm" value={newR.label} onChange={(e) => setNewR({ ...newR, label: e.target.value })} />
          <button type="button" onClick={addRecipient} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1 text-sm font-semibold hover:bg-slate-200"><Plus className="h-4 w-4" /> הוספה</button>
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-900"><KeyRound className="h-4 w-4" /> טוקנים</h2>
        <p className="mb-2 text-xs text-slate-500">נשמרים מוצפנים. אחרי שמירה מוצגות רק 4 הספרות האחרונות. ריק = ללא שינוי.</p>
        {([
          ['טוקן בוט טלגרם', s.telegram_bot_token_hint, token, setToken, 'token'],
          ['סוד webhook של טלגרם', s.telegram_webhook_secret_hint, secret, setSecret, 'secret'],
        ] as const).map(([label, hint, val, setVal, k]) => (
          <div key={k} className="mb-2">
            <span className="block text-sm font-semibold text-slate-900">{label} <span dir="ltr" className="font-mono text-xs text-slate-500">{hint ?? '(מהגדרות השרת / לא מוגדר)'}</span></span>
            <div className="mt-1 flex gap-2">
              <input type="password" autoComplete="new-password" dir="ltr" placeholder="ערך חדש" className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm" value={val} onChange={(e) => { setVal(e.target.value); setState({ kind: 'idle' }); }} />
              {hint ? (
                <label className="flex items-center gap-1 text-xs text-red-700"><input type="checkbox" checked={clear[k]} onChange={(e) => setClear({ ...clear, [k]: e.target.checked })} /> מחק</label>
              ) : null}
            </div>
          </div>
        ))}
        <p className="text-xs text-slate-500">אחרי החלפת סוד ה-webhook צריך לעדכן אותו גם בטלגרם (setWebhook).</p>
      </section>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={state.kind === 'saving'} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
          {state.kind === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} שמירה
        </button>
        {state.kind === 'saved' ? <span className="text-sm text-emerald-700">נשמר</span> : null}
        {state.kind === 'error' ? <span className="text-sm text-red-600">{state.msg}</span> : null}
      </div>
    </div>
  );
}
