'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import type { GuideRules } from '@/lib/guides/guide-rules';

/** /ops/guides — rules for when Almog opens a guide (and when not). */
export function GuideRulesPanel() {
  const [rules, setRules] = useState<GuideRules | null>(null);
  const [phrases, setPhrases] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    fetch('/api/v1/admin/guide-rules')
      .then((r) => r.json())
      .then((j: { rules?: GuideRules }) => {
        if (j.rules) {
          setRules(j.rules);
          setPhrases(j.rules.blocked_phrases.join(', '));
        }
      })
      .catch(() => setState('error'));
  }, []);

  if (!rules) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-gc p-4 text-sm text-slate-600 ring-1 ring-slate-200">
        <Loader2 className="h-4 w-4 animate-spin" /> טוען כללי פתיחת מדריכים…
      </div>
    );
  }

  const set = (patch: Partial<GuideRules>) => {
    setRules({ ...rules, ...patch });
    setState('idle');
  };
  const save = async () => {
    setState('saving');
    const body: GuideRules = {
      ...rules,
      blocked_phrases: phrases.split(',').map((p) => p.trim()).filter((p) => p.length >= 2),
    };
    const res = await fetch('/api/v1/admin/guide-rules', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setState(res.ok ? 'saved' : 'error');
  };

  const Toggle = ({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex cursor-pointer items-start gap-3 py-1.5">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-semibold text-slate-900">{label}</span>
        {hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
      </span>
    </label>
  );

  return (
    <section dir="rtl" className="rounded-2xl bg-gc p-4 ring-1 ring-slate-200">
      <h2 className="mb-1 text-base font-bold text-slate-900">מתי אלמוג פותח מדריך</h2>
      <p className="mb-3 text-xs text-slate-500">חל על פתיחה מהצ&apos;אט ועל הסריקה הלילית. משתמש תמיד יכול לבקש מדריך במפורש אם האפשרות מופעלת.</p>
      <Toggle label="אלמוג רשאי לפתוח מדריכים" checked={rules.enabled} onChange={(v) => set({ enabled: v })} />
      <Toggle label="לפתוח כשהמשתמש מבקש במפורש" hint='למשל "תפתח לי מדריך על שבת"' checked={rules.open_on_explicit_request} onChange={(v) => set({ open_on_explicit_request: v })} />
      <Toggle label="לפתוח כשהמשתמש מדבר על שבת" checked={rules.signals.shabbat} onChange={(v) => set({ signals: { ...rules.signals, shabbat: v } })} />
      <Toggle label="לפתוח כשהמשתמש מדבר על חגים" checked={rules.signals.holidays} onChange={(v) => set({ signals: { ...rules.signals, holidays: v } })} />
      <Toggle label='לפתוח במילים של לחץ ("קשה לי", "עומס")' hint="רחב מאוד — כבוי כברירת מחדל" checked={rules.signals.stress} onChange={(v) => set({ signals: { ...rules.signals, stress: v } })} />
      <Toggle label="הסריקה הלילית פותחת מדריך בלי בקשה" hint="כבוי: ההמלצה נשארת הצעה שאלמוג יכול להעלות בשיחה" checked={rules.companion_auto_open} onChange={(v) => set({ companion_auto_open: v })} />
      <div className="mt-2 grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="block font-semibold text-slate-900">מקסימום מדריכים פעילים</span>
          <input type="number" min={1} max={20} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1" value={rules.max_active_guides} onChange={(e) => set({ max_active_guides: Number(e.target.value) || 1 })} />
        </label>
        <label className="text-sm">
          <span className="block font-semibold text-slate-900">שעות המתנה בין פתיחות</span>
          <input type="number" min={0} max={720} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1" value={rules.cooldown_hours} onChange={(e) => set({ cooldown_hours: Number(e.target.value) || 0 })} />
        </label>
      </div>
      <label className="mt-3 block text-sm">
        <span className="block font-semibold text-slate-900">לא לפתוח כשההודעה כוללת (מופרד בפסיקים)</span>
        <input className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1" value={phrases} onChange={(e) => { setPhrases(e.target.value); setState('idle'); }} />
      </label>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={save} disabled={state === 'saving'} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-gc hover:bg-emerald-700 disabled:opacity-60">
          {state === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} שמירה
        </button>
        {state === 'saved' ? <span className="text-sm text-emerald-700">נשמר</span> : null}
        {state === 'error' ? <span className="text-sm text-red-600">השמירה נכשלה</span> : null}
      </div>
    </section>
  );
}
