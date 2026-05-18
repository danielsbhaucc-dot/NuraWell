'use client';

import { Pencil } from 'lucide-react';
import { MentorBubble } from './MentorBubble';
import { formatOnboardingSummary, type OnboardingSummaryData } from '@/lib/onboarding/summary-labels';

type OnboardingSummaryStepProps = {
  data: OnboardingSummaryData;
  name: string;
  onEdit: (step: number) => void;
};

export function OnboardingSummaryStep({ data, name, onEdit }: OnboardingSummaryStepProps) {
  const rows = formatOnboardingSummary(data);

  return (
    <>
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-l from-emerald-950/60 to-slate-900/80 px-4 py-3 mb-4 text-center">
        <p className="text-[11px] font-bold text-emerald-300/80 tracking-wide">דו״ח סיכום · נשלח מדולב</p>
        <p className="text-sm font-black text-white mt-0.5">מנטור הקליטה שלך</p>
      </div>

      <MentorBubble mentorId="dolev" roleLabel="מכין את דו״ח הסיכום שלך">
        <p>
          {name ? `${name}, ` : ''}לפני שפותחים את החשבון — תעיף/י על הסיכום שאני מכין עבורך. אם משהו לא
          מדויק, לחץ/י עריכה ליד השורה.
        </p>
      </MentorBubble>

      <ul className="mt-5 space-y-2" aria-label="דו״ח סיכום הרשמה מדולב">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
          >
            <span className="text-xs font-bold text-emerald-100/70 shrink-0">{row.label}</span>
            <span
              className="text-sm text-emerald-50 text-left flex-1 break-words"
              dir={row.label.includes('משקל') ? 'ltr' : undefined}
            >
              {row.value}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-emerald-100/60 mt-4 text-center">
        בלחיצה על «סיום» נשלח אימייל לאימות — ואחרי האישור אשלח לך את הסיכום הזה גם במייל.
      </p>

      <nav className="flex flex-wrap gap-2 justify-center mt-4" aria-label="עריכת שלבים">
        {[1, 2, 3, 4].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onEdit(s)}
            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-300/90 border border-emerald-500/30 rounded-lg px-2.5 py-1.5 hover:bg-emerald-500/10"
          >
            <Pencil className="w-3 h-3" />
            עריכת שלב {s}
          </button>
        ))}
      </nav>
    </>
  );
}
