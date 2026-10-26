'use client';

import { motion, useReducedMotion } from 'framer-motion';

import {
  formatMentorReactionTooltip,
  MENTOR_DISPLAY_NAME,
  type MentorEmojiReaction,
} from '../../lib/ai/emoji-reaction/types';

type Props = {
  reaction: MentorEmojiReaction;
  mentorName?: string;
};

/**
 * תגובת אימוג'י על בועת המשתמש — יושב על שפת הבועה (כמו וואטסאפ).
 */
export function MentorEmojiReactionBadge({
  reaction,
  mentorName = MENTOR_DISPLAY_NAME,
}: Props) {
  const reduceMotion = useReducedMotion();
  const label = formatMentorReactionTooltip(reaction, mentorName);

  return (
    <motion.span
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-[#f2f2f6] bg-[#f2f2f6] px-1.5 text-[15px] leading-none text-[#1f3a2a] shadow-[0_3px_10px_rgba(0,0,0,0.28)] ring-1 ring-forest-950/10"
      title={label}
      aria-label={label}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.35, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: 'spring', stiffness: 520, damping: 18, mass: 0.7 }
      }
      whileHover={reduceMotion ? undefined : { scale: 1.12 }}
    >
      <motion.span
        aria-hidden
        className="select-none"
        animate={
          reduceMotion
            ? undefined
            : {
                rotate: [0, -10, 10, -4, 0],
                scale: [1, 1.18, 1],
              }
        }
        transition={
          reduceMotion ? undefined : { delay: 0.12, duration: 0.55, ease: 'easeOut' as const }
        }
      >
        {reaction.emoji}
      </motion.span>
    </motion.span>
  );
}
