'use client';

import { MessageCircle } from 'lucide-react';
import { AlmogAvatarChipWithNameTag } from '../journey/AlmogPresence';
import { dispatchOpenAlmogChatWithGuideContext, dispatchOpenAlmogChatWithPrefill } from '../../lib/notifications/open-almog-chat';
import type { GuideContextHint } from '../../lib/ai/guide-context-hint';

type AlmogScreenCoachProps = {
  title: string;
  body: string;
  prompt: string;
  cta?: string;
  tone?: 'emerald' | 'amber' | 'violet' | 'teal';
  guideContext?: GuideContextHint;
};

const toneMap = {
  emerald: {
    bg: 'linear-gradient(145deg, #047857, #10b981)',
    soft: 'rgba(16,185,129,0.10)',
    border: 'rgba(16,185,129,0.28)',
    text: '#047857',
    title: '#1A1730',
    body: '#3A3654',
    cardBg:
      'linear-gradient(170deg, rgba(236,253,245,0.88) 0%, rgba(220,252,231,0.76) 55%, rgba(254,252,232,0.72) 100%)',
  },
  amber: {
    bg: 'linear-gradient(145deg, #b45309, #f59e0b)',
    soft: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.28)',
    text: '#b45309',
    title: '#451a03',
    body: '#57534e',
    cardBg:
      'linear-gradient(170deg, rgba(255,251,235,0.92) 0%, rgba(254,243,199,0.78) 55%, rgba(255,251,235,0.88) 100%)',
  },
  violet: {
    bg: 'linear-gradient(145deg, #6d28d9, #a855f7)',
    soft: 'rgba(168,85,247,0.12)',
    border: 'rgba(168,85,247,0.28)',
    text: '#6d28d9',
    title: '#3b0764',
    body: '#4c1d95',
    cardBg:
      'linear-gradient(170deg, rgba(245,243,255,0.92) 0%, rgba(237,233,254,0.78) 55%, rgba(236,253,245,0.72) 100%)',
  },
  teal: {
    bg: 'linear-gradient(145deg, #0f766e, #14b8a6)',
    soft: 'rgba(20,184,166,0.12)',
    border: 'rgba(20,184,166,0.30)',
    text: '#0f766e',
    title: '#134e4a',
    body: '#3A3654',
    cardBg:
      'linear-gradient(170deg, rgba(240,253,250,0.92) 0%, rgba(204,251,241,0.76) 55%, rgba(236,253,245,0.80) 100%)',
  },
} as const;

const hebrewFont = "'Rubik','Heebo',sans-serif";

export function AlmogScreenCoach({
  title,
  body,
  prompt,
  cta = 'דבר איתי',
  tone = 'emerald',
  guideContext,
}: AlmogScreenCoachProps) {
  const palette = toneMap[tone];

  const openChat = () => {
    if (guideContext) {
      dispatchOpenAlmogChatWithGuideContext(prompt, guideContext);
    } else {
      dispatchOpenAlmogChatWithPrefill(prompt);
    }
  };

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
          <h3
            className="text-[15px] font-black leading-snug"
            style={{ fontFamily: hebrewFont, color: palette.title, letterSpacing: '-0.01em' }}
          >
            {title}
          </h3>
          <p
            className="mt-1.5 text-[13px] leading-[1.65]"
            style={{ fontFamily: hebrewFont, color: palette.body }}
          >
            {body}
          </p>
          <button
            type="button"
            onClick={openChat}
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
