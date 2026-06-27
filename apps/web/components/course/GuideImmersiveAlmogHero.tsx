'use client';

import { motion } from 'framer-motion';
import { AlmogAvatarChipWithNameTag } from '../journey/AlmogPresence';

interface GuideImmersiveAlmogHeroProps {
  size?: number;
  className?: string;
}

/** אלמוג במסך הפתיחה של מסע הצלילה — תמונה + תג חופף */
export function GuideImmersiveAlmogHero({ size = 88, className }: GuideImmersiveAlmogHeroProps) {
  return (
    <motion.div
      initial={{ scale: 0.82, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.08, type: 'spring', stiffness: 220, damping: 18 }}
      className={className}
    >
      <AlmogAvatarChipWithNameTag size={size} />
    </motion.div>
  );
}
