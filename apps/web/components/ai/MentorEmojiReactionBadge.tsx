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
 * תגובת אימוג'י על בועת המשתמש — אנימציית כניסה + טולטיפ עם שם המנטור.
 */
export function MentorEmojiReactionBadge({
  reaction,
  mentorName = MENTOR_DISPLAY_NAME,
}: Props) {
  const reduceMotion = useReducedMotion();
  const label = formatMentorReactionTooltip(reaction, mentorName);

  return (
    <motion.span
      className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-white/20 bg-[#0f172a]/95 px-2 py-0.5 text-[13px] leading-none shadow-[0_6px_16px_rgba(0,0,0,0.28)] backdrop-blur-md"
      title={label}
      aria-label={label}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.4, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: 'spring', stiffness: 520, damping: 18, mass: 0.7 }
      }
      whileHover={reduceMotion ? undefined : { scale: 1.08 }}
    >
      <motion.span
        aria-hidden
        className="select-none text-[15px]"
        animate={
          reduceMotion
            ? undefined
            : {
                rotate: [0, -10, 10, -4, 0],
                scale: [1, 1.18, 1],
              }
        }
        transition={
          reduceMotion ? undefined : { delay: 0.12, duration: 0.55, ease: 'easeOut' }
        }
      >
        {reaction.emoji}
      </motion.span>
    </motion.span>
  );
}
