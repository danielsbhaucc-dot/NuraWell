'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import type { MentorId } from '@/lib/mentors/registry';
import { MENTORS } from '@/lib/mentors/registry';
import { useMentorAvatarUrl } from '@/lib/client/useMentorAvatarUrl';

export type MentorBubbleTheme = 'dark' | 'light';

type MentorBubbleProps = {
  mentorId: MentorId;
  children: React.ReactNode;
  className?: string;
  theme?: MentorBubbleTheme;
  /** ברירת מחדל: מנטור לדולב = "מקבל אתכם כאן" */
  roleLabel?: string;
};

export function MentorBubble({
  mentorId,
  children,
  className = '',
  theme = 'dark',
  roleLabel,
}: MentorBubbleProps) {
  const { avatarUrl, mentorName, ready } = useMentorAvatarUrl(mentorId);
  const isDark = theme === 'dark';
  const subtitle =
    roleLabel ?? (mentorId === 'dolev' ? 'מקבל אתכם כאן' : MENTORS[mentorId].title);

  return (
    <motion.div
      className={`flex gap-3 items-end ${className}`}
      dir="rtl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      <motion.div
        className={[
          'onboarding-mentor-avatar relative shrink-0 w-[52px] h-[52px] sm:w-14 sm:h-14 rounded-2xl overflow-hidden',
          isDark
            ? 'ring-2 ring-white/15 shadow-[0_4px_16px_rgba(0,0,0,0.2)]'
            : 'ring-2 ring-emerald-500/20 shadow-[0_4px_16px_rgba(4,120,87,0.12)]',
        ].join(' ')}
        aria-hidden={!ready}
        whileHover={{ scale: 1.02 }}
      >
        <Image
          src={avatarUrl}
          alt=""
          fill
          sizes="56px"
          className="object-cover scale-110"
          priority={mentorId === 'dolev'}
          unoptimized={avatarUrl.startsWith('data:')}
        />
      </motion.div>
      <motion.div className="flex-1 min-w-0 pb-0.5">
        <p
          className={[
            'text-[11px] font-bold mb-1 tracking-wide',
            isDark ? 'text-emerald-300/90' : 'text-emerald-700',
          ].join(' ')}
          style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}
        >
          {mentorName}
          <span className={isDark ? ' text-emerald-100/50 font-medium' : ' text-slate-500 font-medium'}>
            {' '}
            · {subtitle}
          </span>
        </p>
        <motion.div
          className={isDark ? 'onboarding-bubble-dark' : 'onboarding-bubble-light'}
          role="region"
          aria-label={`הודעה מ${mentorName}`}
        >
          {children}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
