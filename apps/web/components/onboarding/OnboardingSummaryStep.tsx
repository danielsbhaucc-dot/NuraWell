'use client';

import { Pencil } from 'lucide-react';
import { MentorBubble } from './MentorBubble';
import { DOLEV_REGISTRATION_ROLE, genderCopy } from '@/lib/onboarding/gender-copy';
import { formatOnboardingSummary, type OnboardingSummaryData } from '@/lib/onboarding/summary-labels';
import type { OnboardingGender } from '@/lib/onboarding/types';

type OnboardingSummaryStepProps = {
  data: OnboardingSummaryData;
  name: string;
  gender: OnboardingGender | '';
  onEdit: (step: number) => void;
};

export function OnboardingSummaryStep({ data, name, gender, onEdit }: OnboardingSummaryStepProps) {
  const rows = formatOnboardingSummary(data);
  const gc = genderCopy(gender);

  return (
    <>
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-l from-emerald-950/60 to-slate-900/80 px-4 py-3 mb-4 text-center">
        <p className="text-[11px] font-bold text-emerald-300/80 tracking-wide">דו״ח סיכום · נשלח מדולב</p>
        <p className="text-sm font-black text-white mt-0.5">{DOLEV_REGISTRATION_ROLE} שלך</p>
      </div>

      <MentorBubble mentorId="dolev" roleLabel="מכין את דו״ח הסיכום שלך">
        <p>
          {name ? `${name}, ` : ''}לפני שפותחים את החשבון — {gc.glance} מבט על הסיכום שאני מכין עבורך. אם משהו לא
          מדויק, {gc.press} על העיפרון ליד השורה.
        </p>
      </MentorBubble>

      <ul className="mt-5 space-y-2" aria-label="דו״ח סיכום הרשמה מדולב">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex items-start justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
          >
            <span className="text-xs font-bold text-emerald-100/70 shrink-0 pt-0.5">{row.label}</span>
            <span
              className="text-sm text-emerald-50 text-left flex-1 break-words"
              dir={row.label.includes('משקל') ? 'ltr' : undefined}
            >
              {row.value}
            </span>
            <button
              type="button"
              onClick={() => onEdit(row.editStep)}
              className="shrink-0 p-1.5 rounded-lg text-emerald-300/90 hover:bg-emerald-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
              aria-label={`עריכת ${row.label}`}
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <p className="text-xs text-emerald-100/60 mt-4 text-center">
        בלחיצה על «סיום» נשלח אימייל לאימות — ואחרי האישור אשלח לך את הסיכום הזה גם במייל.
      </p>
    </>
  );
}
