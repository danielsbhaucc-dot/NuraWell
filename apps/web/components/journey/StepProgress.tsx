'use client';

import { motion } from 'framer-motion';
import { Check, Play, HelpCircle, Gamepad2, Heart, FileCheck } from 'lucide-react';
import type { StepSection, JourneyStepProgress } from '../../lib/types/journey';

const sectionMeta: Record<StepSection, { label: string; short: string; icon: React.ElementType }> = {
  video: { label: 'סרטון', short: 'סרטון', icon: Play },
  quiz: { label: 'שאלות', short: 'שאלות', icon: HelpCircle },
  game: { label: 'משחק', short: 'משחק', icon: Gamepad2 },
  commitment: { label: 'התחייבות', short: 'חיבור', icon: Heart },
  summary: { label: 'סיכום', short: 'סיכום', icon: FileCheck },
};

interface StepProgressProps {
  sections: StepSection[];
  currentSection: StepSection;
  progress: JourneyStepProgress;
  onSectionClick: (section: StepSection) => void;
}

function isSectionDone(section: StepSection, progress: JourneyStepProgress): boolean {
  switch (section) {
    case 'video':
      return progress.video_watched;
    case 'quiz':
      return progress.quiz_score !== null;
    case 'game':
      return progress.game_score !== null;
    case 'commitment':
      return progress.commitment_accepted;
    case 'summary':
      return progress.is_completed;
    default:
      return false;
  }
}

export function StepProgress({ sections, currentSection, progress, onSectionClick }: StepProgressProps) {
  const nodes = sections.flatMap((section, index) => {
    const meta = sectionMeta[section];
    const Icon = meta.icon;
    const isCurrent = section === currentSection;
    const isDone = isSectionDone(section, progress);
    const prevDone = index > 0 && isSectionDone(sections[index - 1], progress);

    const connector =
      index > 0 ? (
        <div
          key={`seg-${sections[index - 1]}-to-${section}`}
          className="h-[3px] flex-1 min-w-[6px] rounded-full self-center transition-all duration-300"
          style={{
            background: prevDone
              ? 'linear-gradient(90deg, #34d399, #6ee7b7)'
              : 'rgba(255,255,255,0.22)',
          }}
          aria-hidden
        />
      ) : null;

    const btn = (
      <button
        key={section}
        type="button"
        onClick={() => onSectionClick(section)}
        className="flex flex-col items-center gap-1 shrink-0 w-[46px] sm:w-[56px]"
      >
        <motion.div
          className="relative flex h-[26px] w-[26px] sm:h-[30px] sm:w-[30px] items-center justify-center rounded-full"
          animate={{ scale: isCurrent ? 1.08 : 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          style={{
            background: isDone
              ? 'linear-gradient(145deg, #34d399, #059669)'
              : isCurrent
                ? 'rgba(255,255,255,0.98)'
                : 'rgba(255,255,255,0.22)',
            boxShadow: isCurrent
              ? '0 0 0 3px rgba(255,255,255,0.38), 0 4px 14px rgba(0,0,0,0.18)'
              : isDone
                ? '0 2px 10px rgba(16,185,129,0.35)'
                : 'inset 0 1px 0 rgba(255,255,255,0.2)',
          }}
        >
          {isDone ? (
            <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" strokeWidth={3} />
          ) : (
            <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isCurrent ? 'text-emerald-700' : 'text-white/90'}`} />
          )}
        </motion.div>
        <span
          className={`text-[9px] sm:text-[10px] font-bold leading-tight text-center px-0.5 ${
            isCurrent ? 'text-white' : isDone ? 'text-emerald-100' : 'text-white/55'
          }`}
        >
          <span className="sm:hidden">{meta.short}</span>
          <span className="hidden sm:inline">{meta.label}</span>
        </span>
      </button>
    );

    return connector ? [connector, btn] : [btn];
  });

  return (
    <div className="w-full" dir="ltr">
      <div className="flex w-full items-center justify-between gap-0">{nodes}</div>
      <p className="mt-2.5 text-center text-[10px] sm:text-xs text-white/85 font-medium leading-snug">
        {isSectionDone(currentSection, progress) ? (
          <>
            <span className="text-emerald-100">שלב זה הושלם</span>
            {' · '}
          </>
        ) : (
          <>
            <span>נמצאים כאן</span>
            {' · '}
          </>
        )}
        <span className="font-bold text-white">{sectionMeta[currentSection].label}</span>
      </p>
    </div>
  );
}
