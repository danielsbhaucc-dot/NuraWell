'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { ALMOG_AVATAR_FALLBACK } from '../../lib/ai/almog-avatar';
import { useAlmogAvatarUrl } from '../../lib/client/useAlmogAvatarUrl';

export type AIFeedbackCardVariant = 'emerald' | 'amber';

export interface AIFeedbackCardProps {
  /** כותרת אופציונלית מעל גוף הטקסט */
  title?: string;
  loading: boolean;
  /** Almog reply text; ignored while loading unless error */
  text: string | null;
  /** When true, show a soft error line (user can still continue elsewhere) */
  error?: boolean;
  variant?: AIFeedbackCardVariant;
  /** e.g. primary CTA — rendered below the message */
  action?: ReactNode;
  className?: string;
}

const variantStyles: Record<
  AIFeedbackCardVariant,
  { border: string; shadow: string; cardBg: string; headerBar: string; title: string; subtitle: string }
> = {
  emerald: {
    border: '1px solid rgba(16,185,129,0.28)',
    shadow: '0 12px 40px rgba(6,78,59,0.1)',
    cardBg: 'linear-gradient(180deg, #ffffff 0%, #f0fdf9 100%)',
    headerBar: 'linear-gradient(135deg, #064e3b 0%, #047857 55%, #10b981 100%)',
    title: 'text-white',
    subtitle: 'text-emerald-100/95',
  },
  amber: {
    border: '1px solid rgba(245,158,11,0.35)',
    shadow: '0 12px 40px rgba(120,53,15,0.1)',
    cardBg: 'linear-gradient(180deg, #ffffff 0%, #fffbeb 100%)',
    headerBar: 'linear-gradient(135deg, #78350f 0%, #b45309 50%, #f59e0b 100%)',
    title: 'text-white',
    subtitle: 'text-amber-100/95',
  },
};

export function AIFeedbackCard({
  title = '',
  loading,
  text,
  error = false,
  variant = 'emerald',
  action,
  className = '',
}: AIFeedbackCardProps) {
  const v = variantStyles[variant];
  const { avatarUrl: avatarSrc } = useAlmogAvatarUrl();
  const titleTrim = title.trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 26, stiffness: 320 }}
      className={`mx-auto max-w-md overflow-hidden rounded-[22px] text-right ${className}`}
      dir="rtl"
      style={{
        background: v.cardBg,
        border: v.border,
        boxShadow: v.shadow,
      }}
    >
      <div
        className={`flex items-center gap-3 px-4 ${titleTrim ? 'py-3.5' : 'py-3'}`}
        style={{ background: v.headerBar }}
      >
        <img
          src={avatarSrc}
          alt="אלמוג"
          className="h-11 w-11 shrink-0 rounded-2xl border-2 border-white/85 object-cover shadow-lg"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
          }}
        />
        {titleTrim ? (
          <div className="min-w-0 flex-1 text-right">
            <p
              className={`text-[15px] font-black leading-tight ${v.title}`}
              style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
            >
              {titleTrim}
            </p>
            <p className={`mt-0.5 text-[11px] font-semibold ${v.subtitle}`}>אלמוג · מנטור אישי</p>
          </div>
        ) : (
          <span className="sr-only">משוב מאלמוג</span>
        )}
      </div>

      <div className="px-4 py-4">
        {loading ? (
          <div className="inline-flex items-center gap-2 text-gray-600">
            <span className="text-sm font-semibold">אלמוג מקליד</span>
            <span className="inline-flex items-end gap-1 align-middle">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80 animate-bounce" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70 animate-bounce" style={{ animationDelay: '120ms' }} />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/60 animate-bounce" style={{ animationDelay: '240ms' }} />
            </span>
          </div>
        ) : error ? (
          <p className="text-sm leading-relaxed text-gray-600">
            לא הצלחתי להביא את המשוב המלא כרגע, אבל אני עדיין איתך. ממשיכים צעד קטן קדימה.
          </p>
        ) : text ? (
          <p className="text-sm leading-relaxed text-gray-800">{text}</p>
        ) : null}

        {action ? <div className="mt-4 flex flex-col gap-2">{action}</div> : null}
      </div>
    </motion.div>
  );
}
