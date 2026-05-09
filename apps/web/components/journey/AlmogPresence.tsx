'use client';

import { motion } from 'framer-motion';
import { ALMOG_AVATAR_FALLBACK } from '../../lib/ai/almog-avatar';
import { useAlmogAvatarUrl } from '../../lib/client/useAlmogAvatarUrl';

/** מסכי סיום (חידון / משחק) — תמונה גדולה + תג שם */
export function AlmogCompletionHero({
  subtitle = 'המנטור שלך ב־NuraWell',
}: {
  subtitle?: string;
}) {
  const { avatarUrl } = useAlmogAvatarUrl();

  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="flex flex-col items-center mb-6"
    >
      <div
        className="relative p-[3px] rounded-full mb-3"
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.95), rgba(16,185,129,0.55), rgba(4,120,87,0.85))',
          boxShadow: '0 12px 40px rgba(4,120,87,0.22), 0 0 0 1px rgba(255,255,255,0.35) inset',
        }}
      >
        <div className="rounded-full p-0.5" style={{ background: 'linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarUrl}
            alt="אלמוג"
            width={112}
            height={112}
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover object-top block"
            onError={(e) => {
              e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
            }}
          />
        </div>
        <span
          className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 translate-y-1/2 px-3 py-1 rounded-full text-[11px] font-black text-white whitespace-nowrap shadow-md"
          style={{
            background: 'linear-gradient(135deg, #047857, #10b981)',
            border: '1px solid rgba(255,255,255,0.35)',
          }}
        >
          אלמוג
        </span>
      </div>
      <p className="mt-5 text-sm font-semibold text-emerald-800/90 tracking-wide">{subtitle}</p>
    </motion.div>
  );
}

/** תמונת אלמוג קומפקטית לשורות כותרת */
export function AlmogAvatarChip({ size = 44 }: { size?: number }) {
  const { avatarUrl } = useAlmogAvatarUrl();
  const px = `${size}px`;

  return (
    <div
      className="relative shrink-0 rounded-full p-[2px]"
      style={{
        background: 'linear-gradient(145deg, #34d399, #059669, #f59e0b)',
        boxShadow: '0 4px 16px rgba(4,120,87,0.22)',
      }}
    >
      <div className="rounded-full bg-white p-[2px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl}
          alt="אלמוג"
          width={size}
          height={size}
          className="rounded-full object-cover object-top block"
          style={{ width: px, height: px }}
          onError={(e) => {
            e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
          }}
        />
      </div>
    </div>
  );
}

/** @deprecated השתמשו בשורת כותרת עם AlmogAvatarChip ב-SummarySection */
export function AlmogInlinePresence({
  title = 'אלמוג',
  subtitle = 'מסכם איתך את הצעד',
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex items-center justify-center gap-3 mb-4 px-2"
    >
      <AlmogAvatarChip size={48} />
      <div className="text-right min-w-0">
        <p className="font-black text-sm text-emerald-900">{title}</p>
        <p className="text-xs text-gray-600 leading-snug">{subtitle}</p>
      </div>
    </motion.div>
  );
}
