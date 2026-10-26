'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { AlmogAvatarChipWithNameTag } from '../journey/AlmogPresence';

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
      transition={{ duration: 0.35, ease: 'easeOut' as const }}
      className="guide-immersive-slide-header mb-4 w-full max-w-md"
    >
      <div className="guide-immersive-slide-header__ornament" aria-hidden />
      <div className="flex items-center gap-3">
        <AlmogAvatarChipWithNameTag size={36} />
        <div className="min-w-0 flex-1 text-start">
          <p className="flex items-center justify-end gap-1 text-[11px] font-bold text-primary-200/90">
            <Sparkles className="h-3 w-3 shrink-0 text-primary-300" aria-hidden />
            <span className="min-w-0 wrap-break-word">{eyebrow}</span>
          </p>
          {title ? (
            <p className="text-sm font-black text-on-dark/90 leading-snug wrap-break-word whitespace-normal">
              {title}
            </p>
          ) : null}
          {subtitle ? (
            <p className="text-[11px] font-semibold text-on-dark/50 leading-snug wrap-break-word whitespace-normal">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
