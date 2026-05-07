'use client';

import { motion } from 'framer-motion';
import { Play, HelpCircle, Gamepad2, Heart, FileCheck } from 'lucide-react';
import type { StepSection, JourneyStepProgress } from '../../lib/types/journey';

const sectionMeta: Record<StepSection, { label: string; icon: React.ElementType }> = {
  video:      { label: 'סרטון', icon: Play },
  quiz:       { label: 'שאלות', icon: HelpCircle },
  game:       { label: 'משחק',  icon: Gamepad2 },
  commitment: { label: 'התחייבות', icon: Heart },
  summary:    { label: 'סיכום', icon: FileCheck },
};

interface StepProgressProps {
  sections: StepSection[];
  currentSection: StepSection;
  progress: JourneyStepProgress;
  onSectionClick: (section: StepSection) => void;
}

function isSectionDone(section: StepSection, progress: JourneyStepProgress): boolean {
  switch (section) {
    case 'video': return progress.video_watched;
    case 'quiz': return progress.quiz_score !== null;
    case 'game': return progress.game_score !== null;
    case 'commitment': return progress.commitment_accepted;
    case 'summary': return progress.is_completed;
    default: return false;
  }
}

export function StepProgress({ sections, currentSection, progress, onSectionClick }: StepProgressProps) {
  return (
    <div className="flex items-center gap-1.5">
      {sections.map((section, index) => {
        const meta = sectionMeta[section];
        const Icon = meta.icon;
        const isCurrent = section === currentSection;
        const isDone = isSectionDone(section, progress);

        return (
          <button
            key={section}
            onClick={() => onSectionClick(section)}
            className="flex-1 relative"
          >
            {/* Bar */}
            <div className="h-1.5 rounded-full mb-1.5 overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.15)' }}>
              {(isDone || isCurrent) && (
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: isDone ? '#34d399' : 'rgba(255,255,255,0.5)' }}
                  initial={{ width: 0 }}
                  animate={{ width: isDone ? '100%' : '50%' }}
                  transition={{ duration: 0.5 }}
                />
              )}
            </div>

            {/* Label */}
            <div className={`flex items-center justify-center gap-1 ${isCurrent ? 'opacity-100' : 'opacity-50'}`}>
              <Icon className="w-3 h-3 text-white" />
              <span className="text-[9px] text-white font-semibold hidden sm:inline">{meta.label}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
