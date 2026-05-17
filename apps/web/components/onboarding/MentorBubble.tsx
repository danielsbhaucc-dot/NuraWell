'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import type { MentorId } from '@/lib/mentors/registry';
import { MENTORS } from '@/lib/mentors/registry';
import { useMentorAvatarUrl } from '@/lib/client/useMentorAvatarUrl';
import { almogCdnHostname } from '@/lib/ai/almog-avatar';

export type MentorBubbleTheme = 'dark' | 'light';

type MentorBubbleProps = {
  mentorId: MentorId;
  children: React.ReactNode;
  className?: string;
  theme?: MentorBubbleTheme;
  roleLabel?: string;
};

function isCdnAvatarUrl(url: string): boolean {
  if (url.startsWith('data:')) return false;
  const host = almogCdnHostname();
  if (host && url.includes(host)) return true;
  return url.includes('/images/') && !url.includes('X-Amz-') && !url.includes('r2.cloudflarestorage');
}

export function MentorBubble({
  mentorId,
  children,
  className = '',
  theme = 'dark',
  roleLabel,
}: MentorBubbleProps) {
  const { avatarUrl, mentorName, ready, hasCustom } = useMentorAvatarUrl(mentorId);
  const isDark = theme === 'dark';
  const subtitle =
    roleLabel ?? (mentorId === 'dolev' ? 'מקבל אתכם כאן' : MENTORS[mentorId].title);

  const useNativeImg = hasCustom && isCdnAvatarUrl(avatarUrl);

  return (
    <motion.div
      className={`${className}`}
      dir="rtl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      <header className="flex items-center gap-2.5 mb-2">
        <span
          className={[
            'onboarding-mentor-avatar relative inline-block shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden',
            isDark
              ? 'ring-2 ring-white/15 shadow-[0_4px_14px_rgba(0,0,0,0.18)]'
              : 'ring-2 ring-emerald-500/20 shadow-[0_4px_14px_rgba(4,120,87,0.1)]',
          ].join(' ')}
          aria-hidden={!ready}
        >
          {useNativeImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-110"
            />
          ) : (
            <Image
              src={avatarUrl}
              alt=""
              fill
              sizes="48px"
              className="object-cover scale-110"
              priority={mentorId === 'dolev'}
              unoptimized={avatarUrl.startsWith('data:')}
            />
          )}
        </span>
        <p
          className={[
            'text-[13px] font-bold leading-tight',
            isDark ? 'text-emerald-100' : 'text-emerald-800',
          ].join(' ')}
          style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}
        >
          {mentorName}
          <span className={isDark ? ' text-emerald-100/55 font-medium' : ' text-slate-500 font-medium'}>
            {' '}
            · {subtitle}
          </span>
        </p>
      </header>
      <section
        className={isDark ? 'onboarding-bubble-dark' : 'onboarding-bubble-light'}
        role="region"
        aria-label={`הודעה מ${mentorName}`}
      >
        {children}
      </section>
    </motion.div>
  );
}
