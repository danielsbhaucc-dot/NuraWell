'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import type { MentorId } from '@/lib/mentors/registry';
import { useMentorAvatarUrl } from '@/lib/client/useMentorAvatarUrl';

export type MentorBubbleTheme = 'dark' | 'light';

type MentorBubbleProps = {
  mentorId: MentorId;
  children: React.ReactNode;
  className?: string;
  /** dark = על רקע כהה/תמונה; light = על רקע בהיר */
  theme?: MentorBubbleTheme;
};

export function MentorBubble({ mentorId, children, className = '', theme = 'dark' }: MentorBubbleProps) {
  const { avatarUrl, mentorName, ready } = useMentorAvatarUrl(mentorId);
  const isDark = theme === 'dark';

  return (
    <motion.div
      className={`flex gap-3 items-start ${className}`}
      dir="rtl"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div
        className={[
          'relative shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden shadow-lg',
          isDark ? 'ring-2 ring-emerald-400/50 shadow-emerald-500/25' : 'ring-2 ring-emerald-500/30 shadow-emerald-600/15',
        ].join(' ')}
        aria-hidden={!ready}
      >
        <Image
          src={avatarUrl}
          alt={`תמונת ${mentorName}`}
          fill
          sizes="64px"
          className="object-cover"
          priority={mentorId === 'dolev'}
          unoptimized={avatarUrl.startsWith('data:')}
        />
      </motion.div>
      <div className="flex-1 min-w-0">
        <p
          className={[
            'text-xs font-bold mb-1.5',
            isDark ? 'text-emerald-200' : 'text-emerald-700',
          ].join(' ')}
          style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}
        >
          {mentorName} · המנטור שלך
        </p>
        <motion.div
          className={isDark ? 'onboarding-bubble-dark' : 'onboarding-bubble-light'}
        >
          {children}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
