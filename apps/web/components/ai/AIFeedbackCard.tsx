'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { getAlmogAvatarUrl } from '../../lib/ai/almog-avatar';

export type AIFeedbackCardVariant = 'emerald' | 'amber';

export interface AIFeedbackCardProps {
  /** Shown above the body (default: מילה מאלמוג) */
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
  { border: string; shadow: string; gradient: string; title: string; icon: string }
> = {
  emerald: {
    border: '1px solid rgba(16,185,129,0.22)',
    shadow: '0 10px 32px rgba(16,185,129,0.1)',
    gradient: 'linear-gradient(165deg, rgba(255,255,255,0.98) 0%, rgba(236,253,245,0.92) 100%)',
    title: 'text-emerald-800',
    icon: 'text-emerald-600',
  },
  amber: {
    border: '1px solid rgba(245,158,11,0.25)',
    shadow: '0 10px 32px rgba(245,158,11,0.1)',
    gradient: 'linear-gradient(165deg, rgba(255,255,255,0.98) 0%, rgba(255,251,235,0.92) 100%)',
    title: 'text-amber-900',
    icon: 'text-amber-600',
  },
};

export function AIFeedbackCard({
  title = 'מילה מאלמוג',
  loading,
  text,
  error = false,
  variant = 'emerald',
  action,
  className = '',
}: AIFeedbackCardProps) {
  const v = variantStyles[variant];
  const avatarSrc = getAlmogAvatarUrl();

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 26, stiffness: 320 }}
      className={`mx-auto max-w-md rounded-2xl p-4 text-right ${className}`}
      style={{
        background: v.gradient,
        border: v.border,
        boxShadow: v.shadow,
      }}
    >
      <div className="mb-2 flex items-center justify-end gap-2">
        <img src={avatarSrc} alt="אלמוג" className="h-8 w-8 rounded-xl object-cover border border-white/70 shadow-sm" />
        <div className="text-right">
          <p className={`text-xs font-black ${v.title}`}>{title}</p>
          <p className="text-[11px] text-gray-500">מנטור אישי</p>
        </div>
        <Sparkles className={`h-4 w-4 shrink-0 ${v.icon}`} />
      </div>

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
        <p className="text-sm text-gray-600 leading-relaxed">
          לא הצלחתי להביא את המשוב המלא כרגע, אבל אני עדיין איתך. ממשיכים צעד קטן קדימה.
        </p>
      ) : text ? (
        <p className="text-sm text-gray-800 leading-relaxed">{text}</p>
      ) : null}

      {action ? <div className="mt-4 flex flex-col gap-2">{action}</div> : null}
    </motion.div>
  );
}
