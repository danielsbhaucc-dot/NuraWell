'use client';

import { MessageCircle } from 'lucide-react';
import { AlmogAvatarChipWithNameTag } from '../journey/AlmogPresence';
import { dispatchOpenAlmogChatWithPrefill } from '../../lib/notifications/open-almog-chat';
import type { ProfileGender } from '../../lib/profile/personalized-copy';

type AlmogScreenCoachProps = {
  title: string;
  body: string;
  prompt: string;
  cta?: string;
  tone?: 'emerald' | 'amber' | 'violet' | 'teal';
  firstName?: string;
  gender?: ProfileGender;
};

const toneMap = {
  emerald: {
    bg: 'linear-gradient(145deg, #047857, #10b981)',
    soft: 'rgba(16,185,129,0.10)',
    border: 'rgba(16,185,129,0.28)',
    text: '#047857',
    cardBg:
      'linear-gradient(170deg, rgba(236,253,245,0.88) 0%, rgba(220,252,231,0.76) 55%, rgba(254,252,232,0.72) 100%)',
  },
  amber: {
    bg: 'linear-gradient(145deg, #b45309, #f59e0b)',
    soft: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.28)',
    text: '#b45309',
    cardBg:
      'linear-gradient(170deg, rgba(255,251,235,0.92) 0%, rgba(254,243,199,0.78) 55%, rgba(255,251,235,0.88) 100%)',
  },
  violet: {
    bg: 'linear-gradient(145deg, #6d28d9, #a855f7)',
    soft: 'rgba(168,85,247,0.12)',
    border: 'rgba(168,85,247,0.28)',
    text: '#6d28d9',
    cardBg:
      'linear-gradient(170deg, rgba(245,243,255,0.92) 0%, rgba(237,233,254,0.78) 55%, rgba(236,253,245,0.72) 100%)',
  },
  teal: {
    bg: 'linear-gradient(145deg, #0f766e, #14b8a6)',
    soft: 'rgba(20,184,166,0.12)',
    border: 'rgba(20,184,166,0.30)',
    text: '#0f766e',
    cardBg:
      'linear-gradient(170deg, rgba(240,253,250,0.92) 0%, rgba(204,251,241,0.76) 55%, rgba(236,253,245,0.80) 100%)',
  },
} as const;

export function AlmogScreenCoach({
  title,
  body,
  prompt,
  cta = 'דבר עם אלמוג',
  tone = 'emerald',
  firstName,
  gender,
}: AlmogScreenCoachProps) {
  const palette = toneMap[tone];
  const displayTitle =
    firstName && title.includes('אלמוג')
      ? title.replace('את המדריכים', `איתך את המדריכים, ${firstName}`)
      : title;

  return (
    <section
      dir="rtl"
      className="relative overflow-hidden p-4"
      style={{
        borderRadius: 22,
        background: palette.cardBg,
        border: `1px solid ${palette.border}`,
        boxShadow: '0 12px 34px rgba(6,78,59,0.10), inset 0 1px 0 rgba(255,255,255,0.72)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-4 top-px h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)' }}
      />
      <div className="flex items-start gap-3">
        <AlmogAvatarChipWithNameTag size={48} />
        <div className="min-w-0 flex-1 text-right">
          <h3 className="text-[15px] font-black text-emerald-950">{displayTitle}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-emerald-800/85">{body}</p>
          <button
            type="button"
            onClick={() => dispatchOpenAlmogChatWithPrefill(prompt)}
            className="mt-3 inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition active:scale-[0.98]"
            style={{ background: palette.soft, border: `1px solid ${palette.border}`, color: palette.text }}
          >
            <MessageCircle className="h-4 w-4" />
            {cta}
          </button>
        </div>
      </div>
    </section>
  );
}
