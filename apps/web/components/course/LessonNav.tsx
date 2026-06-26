'use client';

import Link from 'next/link';
import { ChevronRight, ChevronLeft, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface NavLesson {
  id: string;
  title: string;
}

interface LessonNavProps {
  prevLesson: NavLesson | null;
  nextLesson: NavLesson | null;
  isCurrentCompleted: boolean;
  onToggleComplete?: () => void;
  isTogglingComplete?: boolean;
}

export function LessonNav({
  prevLesson,
  nextLesson,
  isCurrentCompleted,
  onToggleComplete,
  isTogglingComplete,
}: LessonNavProps) {
  return (
    <div className="guide-glass-card p-4">
      <div className="flex items-center gap-3">
        {prevLesson ? (
          <Link
            href={`/lessons/${prevLesson.id}`}
            className="flex items-center gap-2 flex-1 min-w-0 py-2.5 px-3 rounded-2xl transition-all hover:bg-emerald-50 active:scale-98 group"
            style={{ border: '1px solid rgba(6,78,59,0.1)' }}
          >
            <ChevronRight className="w-4 h-4 flex-shrink-0 transition-colors" style={{ color: '#9896B8' }} />
            <div className="min-w-0">
              <p className="text-xs" style={{ color: '#9896B8' }}>פרק קודם</p>
              <p className="text-sm font-medium line-clamp-1 transition-colors" style={{ color: '#1A1730' }}>
                {prevLesson.title}
              </p>
            </div>
          </Link>
        ) : (
          <div className="flex-1" />
        )}

        {onToggleComplete && (
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onToggleComplete}
            disabled={isTogglingComplete}
            className="flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center transition-all disabled:opacity-60"
            style={
              isCurrentCompleted
                ? {
                    background: 'linear-gradient(145deg, rgba(16,185,129,0.28), rgba(52,211,153,0.18))',
                    border: '2px solid rgba(16,185,129,0.55)',
                    boxShadow: '0 6px 18px rgba(16,185,129,0.22)',
                  }
                : {
                    background: 'rgba(255,255,255,0.72)',
                    border: '2px solid rgba(20,184,166,0.35)',
                    boxShadow: '0 4px 14px rgba(6,78,59,0.08)',
                  }
            }
            aria-label={isCurrentCompleted ? 'בטל סימון השלמה' : 'סמן כהושלם'}
            title={isCurrentCompleted ? 'לחץ לביטול סימון' : 'סמן כהושלם'}
          >
            <CheckCircle2
              className="w-6 h-6 transition-colors"
              style={{ color: isCurrentCompleted ? '#059669' : '#14b8a6' }}
              fill={isCurrentCompleted ? '#10b981' : 'none'}
              strokeWidth={isCurrentCompleted ? 0 : 2}
            />
          </motion.button>
        )}

        {nextLesson ? (
          <Link
            href={`/lessons/${nextLesson.id}`}
            className="flex items-center gap-2 flex-1 min-w-0 py-2.5 px-3 rounded-2xl transition-all hover:bg-emerald-50 active:scale-98 group text-left"
            style={{ border: '1px solid rgba(6,78,59,0.1)' }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs text-left" style={{ color: '#9896B8' }}>פרק הבא</p>
              <p className="text-sm font-medium line-clamp-1 transition-colors text-left" style={{ color: '#1A1730' }}>
                {nextLesson.title}
              </p>
            </div>
            <ChevronLeft className="w-4 h-4 flex-shrink-0 transition-colors" style={{ color: '#9896B8' }} />
          </Link>
        ) : (
          <div className="flex-1" />
        )}
      </div>
    </div>
  );
}
