'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import { ConsentEvidenceSheet, type ConsentCollected } from './ConsentEvidenceSheet';
import { CONSENT_TRANSPARENCY, CONSENT_WHY } from '@/lib/legal/consent-text';

type HealthDataConsentBlockProps = {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  gender?: string | null;
  onEvidence?: (c: ConsentCollected) => void;
};

/** הודעת היידוע (סעיף 11) + הסכמה למידע בריאותי/גוף לפני איסוף. */
export function HealthDataConsentBlock({
  checked,
  onChange,
  disabled,
  gender,
  onEvidence,
}: HealthDataConsentBlockProps) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="mt-4 rounded-2xl border border-accent-400/35 bg-accent-950/30 p-4"
      role="group"
      aria-labelledby="health-consent-title"
    >
      <p id="health-consent-title" className="text-sm font-bold text-accent-100 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden />
        מידע בריאותי ומדידות גוף
      </p>
      <p className="mt-2 text-xs leading-relaxed text-accent-50/85">
        נאסוף משקל, גובה ויעדים — <strong>מידע בעל רגישות מיוחדת</strong> — רק כדי להתאים את הליווי.
        המידע נשמר במערכת מאובטחת, לא נמכר, ולא יועבר לצד שלישי למטרות שיווק. ניתן למשוך הסכמה
        זו בהגדרות הפרטיות. ללא הסכמה — לא ניתן להמשיך בשלב זה. פרטים נוספים ב{' '}
        <Link href="/privacy" className="underline font-semibold text-accent-100" target="_blank">
          מדיניות הפרטיות
        </Link>
        . יש לך זכות עיון, תיקון ומחיקה — ראו §10 במדיניות.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-accent-50/75">{CONSENT_TRANSPARENCY} {CONSENT_WHY}</p>
      {checked ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-primary-500/15 px-3 py-2 text-sm font-bold text-primary-100" role="status">
          <Check className="h-4 w-4" aria-hidden /> ההסכמה אושרה
        </p>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          data-testid="onboarding-consent-open"
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-gradient-to-l from-primary-500 to-secondary-500 px-4 py-2.5 text-sm font-bold text-on-dark shadow-lg disabled:opacity-50"
        >
          <ShieldCheck className="h-4 w-4" aria-hidden /> לקריאה ואישור ההסכמה
        </button>
      )}
      <ConsentEvidenceSheet
        open={open}
        action="grant"
        gender={gender === 'female' || gender === 'male' ? gender : null}
        mode="collect"
        onClose={() => setOpen(false)}
        onDone={(r) => {
          setOpen(false);
          if (r.collected) {
            onEvidence?.(r.collected);
            onChange(true);
          }
        }}
      />
    </div>
  );
}

type LegalConsentCheckboxProps = {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
};

export function LegalConsentCheckbox({
  id,
  checked,
  onChange,
  disabled,
}: LegalConsentCheckboxProps) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer mt-4">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-on-dark/30 accent-primary-500"
        required
      />
      <span className="text-xs leading-relaxed text-primary-50/90">
        קראתי ואישרתי את {' '}
        <Link href="/terms" className="font-semibold underline underline-offset-2 text-primary-200" target="_blank">
          תנאי השימוש
        </Link>{' '}
        ול{' '}
        <Link href="/privacy" className="font-semibold underline underline-offset-2 text-primary-200" target="_blank">
          מדיניות הפרטיות
        </Link>
        .
      </span>
    </label>
  );
}
