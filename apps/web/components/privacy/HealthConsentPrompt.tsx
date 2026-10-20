'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatedDialog } from '../shared/AnimatedDialog';

const SNOOZE_KEY = 'nw.healthConsentPrompt.snoozedUntil';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/** בקשת הסכמה לעיבוד מידע בריאותי — לחשבונות ותיקים ללא רישום הסכמה. */
export function HealthConsentPrompt() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const until = Number(window.localStorage.getItem(SNOOZE_KEY) ?? 0);
      if (until > Date.now()) return;
    } catch {}
    let cancelled = false;
    fetch('/api/v1/account/health-consent', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { needs_prompt?: boolean } | null) => {
        if (!cancelled && d?.needs_prompt) setOpen(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const snooze = () => {
    try {
      window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {}
    setOpen(false);
  };

  const agree = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/account/health-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'grant' }),
      });
      if (!res.ok) throw new Error();
      setOpen(false);
    } catch {
      setError('לא הצלחנו לשמור. נסו שוב.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatedDialog
      open={open}
      onClose={snooze}
      variant="sheet"
      aria-labelledby="hc-prompt-title"
      panelClassName="w-full rounded-t-3xl bg-white p-6 text-right shadow-xl dark:bg-neutral-900"
    >
      <div dir="rtl" className="space-y-4">
        <h2 id="hc-prompt-title" className="text-lg font-bold">
          הסכמה לעיבוד מידע בריאותי
        </h2>
        <p className="text-sm leading-relaxed opacity-80">
          כדי שנוכל לשמור משקל, מדדים ומידע בריאותי ולהשתמש בהם לליווי אישי, אנחנו צריכים את הסכמתך
          המפורשת. בלי הסכמה, מידע כזה לא יישמר. אפשר לבטל בכל עת בהגדרות הפרטיות.{' '}
          <Link href="/privacy" className="underline">
            מדיניות הפרטיות
          </Link>
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={agree}
            disabled={saving}
            className="flex-1 rounded-2xl bg-emerald-600 py-3 font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'שומר…' : 'אישור הסכמה'}
          </button>
          <button type="button" onClick={snooze} disabled={saving} className="flex-1 rounded-2xl border py-3 font-semibold">
            לא עכשיו
          </button>
        </div>
      </div>
    </AnimatedDialog>
  );
}
