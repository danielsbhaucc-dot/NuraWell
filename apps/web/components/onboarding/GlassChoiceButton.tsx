'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

type GlassChoiceButtonProps = {
  selected: boolean;
  onClick: () => void;
  emoji?: string;
  title: string;
  subtitle?: string;
  name?: string;
  value?: string;
};

export function GlassChoiceButton({
  selected,
  onClick,
  emoji,
  title,
  subtitle,
  name,
  value,
}: GlassChoiceButtonProps) {
  return (
    <button
      type="button"
      role={name ? undefined : 'radio'}
      aria-pressed={selected}
      name={name}
      value={value}
      onClick={onClick}
      className={[
        'w-full text-right rounded-2xl px-4 py-3.5 transition-all border backdrop-blur-xl',
        'active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400',
        selected
          ? 'border-emerald-400/80 bg-emerald-500/30 shadow-[0_8px_32px_rgba(16,185,129,0.3)] ring-1 ring-emerald-400/40'
          : 'border-emerald-500/25 bg-slate-800/50 hover:bg-slate-800/70 hover:border-emerald-400/40',
      ].join(' ')}
    >
      <span className="flex items-start gap-3">
        {emoji ? <span className="text-2xl shrink-0" aria-hidden>{emoji}</span> : null}
        <span className="flex-1 min-w-0">
          <span className="block font-bold text-[15px] text-emerald-50">{title}</span>
          {subtitle ? (
            <span className="block text-sm text-emerald-100/80 mt-0.5 leading-snug">{subtitle}</span>
          ) : null}
        </span>
        {selected ? (
          <span className="shrink-0 w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center">
            <Check className="w-4 h-4 text-white" strokeWidth={3} aria-hidden />
          </span>
        ) : (
          <span className="shrink-0 w-7 h-7 rounded-full border-2 border-white/30" aria-hidden />
        )}
      </span>
    </button>
  );
}
