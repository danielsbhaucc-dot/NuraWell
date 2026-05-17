'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import type { MentorId } from '@/lib/mentors/registry';
import { useMentorAvatarUrl } from '@/lib/client/useMentorAvatarUrl';

type MentorBubbleProps = {
  mentorId: MentorId;
  children: React.ReactNode;
  className?: string;
};

export function MentorBubble({ mentorId, children, className = '' }: MentorBubbleProps) {
  const { avatarUrl, mentorName, ready } = useMentorAvatarUrl(mentorId);

  return (
    <div className={`flex gap-3 items-start ${className}`} dir="rtl">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden ring-2 ring-emerald-400/50 shadow-lg shadow-emerald-500/20"
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
        <p className="text-xs font-bold text-emerald-300/90 mb-1" style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}>
          {mentorName} · המנטור שלך
        </p>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card-strong rounded-2xl rounded-tr-md px-4 py-3 text-[15px] leading-relaxed text-white/95"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
