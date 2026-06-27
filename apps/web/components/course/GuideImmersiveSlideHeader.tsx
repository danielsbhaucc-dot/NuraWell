'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { AlmogAvatarChip } from '../journey/AlmogPresence';

interface GuideImmersiveSlideHeaderProps {
  eyebrow: string;
  title?: string;
  subtitle?: string;
}

/** פס עליון מלוטש מעל בועת התוכן במסע הצלילה */
export function GuideImmersiveSlideHeader({ eyebrow, title, subtitle }: GuideImmersiveSlideHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="guide-immersive-slide-header mb-4 w-full max-w-md"
    >
      <div className="guide-immersive-slide-header__ornament" aria-hidden />
      <div className="flex items-center gap-3">
        <AlmogAvatarChip size={36} />
        <div className="min-w-0 flex-1 text-right">
          <p className="flex items-center justify-end gap-1 text-[11px] font-bold text-emerald-200/90">
            <Sparkles className="h-3 w-3 shrink-0 text-emerald-300" aria-hidden />
            <span className="truncate">{eyebrow}</span>
          </p>
          {title ? (
            <p className="truncate text-sm font-black text-white/90">{title}</p>
          ) : null}
          {subtitle ? (
            <p className="truncate text-[11px] font-semibold text-white/50">{subtitle}</p>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
