'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, XCircle } from 'lucide-react';
import { ALMOG_AVATAR_FALLBACK } from '../../lib/ai/almog-avatar';
import { useAlmogAvatarUrl } from '../../lib/client/useAlmogAvatarUrl';

type Tone = 'quiz' | 'game';

const toneStyles: Record<
  Tone,
  { okBar: string; okAccent: string; badBar: string; badAccent: string }
> = {
  quiz: {
    okBar: 'linear-gradient(135deg, #047857 0%, #10b981 100%)',
    okAccent: '#ecfdf5',
    badBar: 'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)',
    badAccent: '#fffbeb',
  },
  game: {
    okBar: 'linear-gradient(135deg, #047857 0%, #10b981 100%)',
    okAccent: '#ecfdf5',
    badBar: 'linear-gradient(135deg, #c2410c 0%, #ea580c 100%)',
    badAccent: '#fff7ed',
  },
};

export function AlmogInstantFeedback({
  isCorrect,
  children,
  tone = 'quiz',
}: {
  isCorrect: boolean;
  children: React.ReactNode;
  tone?: Tone;
}) {
  const { avatarUrl } = useAlmogAvatarUrl();
  const t = toneStyles[tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      className="mt-4 overflow-hidden rounded-2xl text-right shadow-[0_8px_32px_rgba(6,78,59,0.12)]"
      style={{
        border: isCorrect ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(245,158,11,0.4)',
      }}
    >
      <div
        className="flex items-center gap-3 px-4 py-3.5"
        style={{ background: isCorrect ? t.okBar : t.badBar }}
      >
        <img
          src={avatarUrl}
          alt="אלמוג"
          className="h-11 w-11 shrink-0 rounded-2xl border-2 border-white/90 object-cover shadow-md"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
          }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-end gap-2">
            <p className="text-[15px] font-black text-white" style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}>
              אלמוג
            </p>
            {isCorrect ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-white/95" strokeWidth={2.5} />
            ) : (
              <XCircle className="h-5 w-5 shrink-0 text-white/95" strokeWidth={2.5} />
            )}
          </div>
          <p className="mt-0.5 text-xs font-bold text-white/95">
            {isCorrect ? 'מעולה — נפלת בול על זה.' : 'לא נורא — בוא נבין את זה רגע.'}
          </p>
        </div>
      </div>
      <div
        className="border-t border-black/5 px-4 py-3.5 text-sm leading-relaxed text-gray-700"
        style={{ background: isCorrect ? t.okAccent : t.badAccent }}
      >
        {children}
      </div>
    </motion.div>
  );
}
