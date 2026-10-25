'use client';

import { motion } from 'framer-motion';
import { Check, Hourglass, Sparkles, Trash2 } from 'lucide-react';
import type { RetentionChoice } from '@saas/billing';

type Props = {
  value: RetentionChoice | null;
  onChange: (v: RetentionChoice) => void;
  disabled?: boolean;
  tone?: 'dark' | 'light';
};

const OPTIONS: { value: RetentionChoice; title: string; body: string; Icon: typeof Trash2 }[] = [
  {
    value: 'keep_24m',
    title: 'לשמור 24 חודשים',
    body: 'אם תחזרו, הכול מחכה לכם: המסע, ההתקדמות והשיחות. אחרי 24 חודשים בלי מנוי הכול נמחק אוטומטית, ונזכיר לכם כחודש לפני כן.',
    Icon: Hourglass,
  },
  {
    value: 'delete_now',
    title: 'למחוק מיד',
    body: 'כשהמנוי מסתיים, החשבון וכל המידע האישי נמחקים לצמיתות, כולל מפתח ההצפנה. אין דרך לשחזר.',
    Icon: Trash2,
  },
];

/** Post-subscription data choice. No default selection: the user must actively pick. */
export function RetentionChoicePicker({ value, onChange, disabled, tone = 'dark' }: Props) {
  const dark = tone === 'dark';
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className={`flex items-center gap-2 text-sm font-black mb-1 ${dark ? 'text-emerald-50' : 'text-slate-900'}`}>
        <Sparkles className={`w-4 h-4 ${dark ? 'text-emerald-300' : 'text-teal-600'}`} aria-hidden />
        מה יקרה למידע שלכם כשהמנוי יסתיים?
      </legend>
      <p className={`text-xs leading-relaxed ${dark ? 'text-emerald-100/75' : 'text-slate-600'}`}>
        כל עוד המנוי פעיל, המידע נשמר מוצפן. אפשר לשנות את הבחירה בכל רגע בהגדרות הפרטיות.
      </p>
      <div role="radiogroup" aria-label="בחירת שמירת מידע אחרי סיום מנוי" className="grid gap-3">
        {OPTIONS.map(({ value: v, title, body, Icon }) => {
          const sel = value === v;
          return (
            <motion.button
              key={v}
              type="button"
              role="radio"
              aria-checked={sel}
              data-choice={v}
              whileTap={{ scale: 0.98 }}
              onClick={() => onChange(v)}
              className={[
                'relative w-full text-start rounded-2xl p-4 border transition-all overflow-hidden',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400',
                dark
                  ? sel
                    ? 'border-emerald-300/80 bg-linear-to-br from-emerald-500/30 via-teal-600/20 to-slate-900/60 shadow-[0_10px_40px_rgba(16,185,129,0.28)]'
                    : 'border-white/12 bg-slate-800/55 backdrop-blur-xl hover:border-emerald-400/40'
                  : sel
                    ? 'border-teal-500 bg-linear-to-br from-teal-50 via-sky-50 to-indigo-50 shadow-[0_10px_30px_rgba(13,148,136,0.18)]'
                    : 'border-slate-200 bg-slate-50/80 hover:border-teal-300',
              ].join(' ')}
            >
              <span className="flex items-start gap-3">
                <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${dark ? 'bg-white/10 text-emerald-200' : 'bg-teal-100 text-teal-700'}`}>
                  <Icon className="w-5 h-5" aria-hidden />
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`block font-black text-[15px] ${dark ? 'text-white' : 'text-slate-900'}`}>{title}</span>
                  <span className={`block text-[13px] mt-1 leading-snug ${dark ? 'text-emerald-50/80' : 'text-slate-600'}`}>{body}</span>
                </span>
                <span
                  className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${sel ? 'bg-emerald-500' : dark ? 'border-2 border-white/30' : 'border-2 border-slate-300'}`}
                  aria-hidden
                >
                  {sel ? <Check className="w-4 h-4 text-white" strokeWidth={3} /> : null}
                </span>
              </span>
            </motion.button>
          );
        })}
      </div>
    </fieldset>
  );
}
