'use client';

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

type HealthDataConsentBlockProps = {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
};

/** הודעת היידוע (סעיף 11) + הסכמה למידע בריאותי/גוף לפני איסוף. */
export function HealthDataConsentBlock({
  checked,
  onChange,
  disabled,
}: HealthDataConsentBlockProps) {
  return (
    <div
      className="mt-4 rounded-2xl border border-amber-400/35 bg-amber-950/30 p-4"
      role="group"
      aria-labelledby="health-consent-title"
    >
      <p id="health-consent-title" className="text-sm font-bold text-amber-100 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden />
        מידע בריאותי ומדידות גוף
      </p>
      <p className="mt-2 text-xs leading-relaxed text-amber-50/85">
        נאסוף משקל, גובה ויעדים — <strong>מידע בעל רגישות מיוחדת</strong> — רק כדי להתאים את הליווי.
        המידע נשמר במערכת מאובטחת, לא נמכר, ולא יועבר לצד שלישי למטרות שיווק. ניתן למשוך הסכמה
        זו בהגדרות הפרטיות. ללא הסכמה — לא ניתן להמשיך בשלב זה. פרטים נוספים ב{' '}
        <Link href="/privacy" className="underline font-semibold text-amber-100" target="_blank">
          מדיניות הפרטיות
        </Link>
        . יש לך זכות עיון, תיקון ומחיקה — ראה/י §10 במדיניות.
      </p>
      <label className="mt-3 flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-amber-300/60 accent-emerald-500"
        />
        <span className="text-sm text-amber-50/95 leading-snug">
          אני מסכים/ה לאיסוף ועיבוד מידע בריאותי/גוף כמתואר, בהתאם ל{' '}
          <Link href="/privacy" className="underline" target="_blank">
            מדיניות הפרטיות
          </Link>
          .
        </span>
      </label>
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
        className="mt-1 h-4 w-4 rounded border-white/30 accent-emerald-500"
        required
      />
      <span className="text-xs leading-relaxed text-emerald-50/90">
        קראתי ואני מסכים/ה ל{' '}
        <Link href="/terms" className="font-semibold underline underline-offset-2 text-emerald-200" target="_blank">
          תנאי השימוש
        </Link>{' '}
        ול{' '}
        <Link href="/privacy" className="font-semibold underline underline-offset-2 text-emerald-200" target="_blank">
          מדיניות הפרטיות
        </Link>
        .
      </span>
    </label>
  );
}

type ParentalConsentCheckboxProps = {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
};

export function ParentalConsentCheckbox({
  checked,
  onChange,
  disabled,
}: ParentalConsentCheckboxProps) {
  return (
    <label className="mt-3 flex items-start gap-3 cursor-pointer rounded-xl border border-white/15 bg-white/5 p-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-white/30 accent-emerald-500"
      />
      <span className="text-xs leading-relaxed text-emerald-50/90">
        אני בן/בת 16–17, ויש לי הסכמה ופיקוח של הורה או אפוטרופוס חוקי לשימוש בשירות, בהתאם לתנאי
        השימוש.
      </span>
    </label>
  );
}
