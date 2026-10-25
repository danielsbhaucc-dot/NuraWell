'use client';

import { useCallback, useEffect, useState } from 'react';
import { Archive, Loader2, RefreshCw } from 'lucide-react';
import { RetentionChoicePicker } from '@/components/privacy/RetentionChoicePicker';
import type { RetentionChoice } from '@saas/billing';

type State = { choice: RetentionChoice; is_default: boolean; decided_at: string | null };

export function RetentionChoiceSection({ onToast }: { onToast: (msg: string, kind: 'success' | 'error') => void }) {
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState<RetentionChoice | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch('/api/v1/account/retention-choice', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const j = (await res.json()) as State;
      setState(j);
      // Legacy accounts: show the applied default but leave nothing pre-picked as a fresh choice.
      setDraft(j.is_default ? null : j.choice);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/v1/account/retention-choice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice: draft }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || 'שמירת הבחירה נכשלה');
      onToast('הבחירה נשמרה ותועדה', 'success');
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שמירת הבחירה נכשלה';
      setSaveError(msg);
      onToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const dirty = state ? draft !== null && (state.is_default || draft !== state.choice) : false;

  return (
    <section className="crystal-surface rounded-2xl p-5 space-y-3" data-testid="retention-choice-section">
      <h2 className="font-bold text-ink flex items-center gap-2">
        <Archive className="w-4 h-4 text-teal-600" />
        המידע שלכם אחרי סיום המנוי
      </h2>
      {!state && !loadError ? (
        <div className="flex justify-center py-6" aria-busy="true">
          <Loader2 className="w-5 h-5 animate-spin text-ink-faint" />
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50/70 p-3 text-sm text-red-800 flex items-center justify-between gap-2">
          <span>לא הצלחנו לטעון את הבחירה.</span>
          <button type="button" onClick={() => void load()} className="flex items-center gap-1 font-bold text-red-700">
            <RefreshCw className="w-4 h-4" /> לנסות שוב
          </button>
        </div>
      ) : state ? (
        <>
          {state.is_default ? (
            <p className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-xs text-sky-900 leading-relaxed" data-testid="retention-default-note">
              החשבון נפתח לפני שהבחירה הזו הייתה קיימת, ולכן חלה כרגע ברירת המחדל: שמירה של 24 חודשים מסיום המנוי ואז מחיקה. אפשר לבחור כאן אחרת.
            </p>
          ) : (
            <p className="text-xs text-ink-faint" data-testid="retention-current">
              הבחירה הנוכחית: {state.choice === 'keep_24m' ? 'לשמור 24 חודשים' : 'למחוק מיד'}
              {state.decided_at ? ` · עודכנה ב־${new Date(state.decided_at).toLocaleDateString('he-IL')}` : ''}
            </p>
          )}
          <RetentionChoicePicker value={draft} onChange={setDraft} disabled={saving} tone="light" />
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            data-testid="retention-save"
            className="w-full min-h-[48px] rounded-xl font-bold text-white bg-linear-to-l from-teal-600 to-sky-600 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            שמירת הבחירה
          </button>
          {saveError ? <p className="text-sm font-semibold text-red-600">{saveError}</p> : null}
          <p className="text-[11px] text-ink-faint">כל שינוי נשמר כתיעוד הסכמה עם תאריך וגרסה.</p>
        </>
      ) : null}
    </section>
  );
}
