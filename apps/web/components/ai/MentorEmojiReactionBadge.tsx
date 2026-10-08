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
      className="pointer-events-auto absolute -bottom-2.5 start-2 z-10 inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-white/25 bg-[#0f172a]/92 px-1.5 text-[15px] leading-none shadow-[0_6px_16px_rgba(0,0,0,0.35)] backdrop-blur-md"
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
                rotate: [0, -8, 8, -4, 0],
                scale: [1, 1.12, 1],
              }
        }
        transition={
          reduceMotion
            ? undefined
            : { delay: 0.15, duration: 0.55, ease: 'easeOut' }
        }
      >
        {reaction.emoji}
      </motion.span>
    </motion.span>
  );
}
