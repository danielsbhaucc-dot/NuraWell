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
  onMarkComplete?: () => void;
  isMarkingComplete?: boolean;
}

export function LessonNav({ prevLesson, nextLesson, isCurrentCompleted, onMarkComplete, isMarkingComplete }: LessonNavProps) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-3">
        {/* Prev */}
        {prevLesson ? (
          <Link
            href={`/lessons/${prevLesson.id}`}
            className="flex items-center gap-2 flex-1 min-w-0 py-2.5 px-3 rounded-2xl transition-all hover:bg-white/8 active:scale-98 group"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white flex-shrink-0 transition-colors" />
            <div className="min-w-0">
              <p className="text-xs text-slate-500">שיעור קודם</p>
              <p className="text-sm text-slate-300 group-hover:text-white font-medium line-clamp-1 transition-colors">
                {prevLesson.title}
              </p>
            </div>
          </Link>
        ) : (
          <div className="flex-1" />
        )}

        {/* Mark Complete */}
        {onMarkComplete && (
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onMarkComplete}
            disabled={isCurrentCompleted || isMarkingComplete}
            className="flex-shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center transition-all"
            style={isCurrentCompleted
              ? { background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)' }
              : { background: 'rgba(20,184,166,0.15)', border: '1px solid rgba(20,184,166,0.3)' }
            }
            aria-label={isCurrentCompleted ? 'שיעור הושלם' : 'סמן כהושלם'}
          >
            <CheckCircle2
              className="w-5 h-5 transition-colors"
              style={{ color: isCurrentCompleted ? '#10b981' : '#14b8a6' }}
              fill={isCurrentCompleted ? '#10b981' : 'none'}
            />
          </motion.button>
        )}

        {/* Next */}
        {nextLesson ? (
          <Link
            href={`/lessons/${nextLesson.id}`}
            className="flex items-center gap-2 flex-1 min-w-0 py-2.5 px-3 rounded-2xl transition-all hover:bg-white/8 active:scale-98 group text-left"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500 text-left">שיעור הבא</p>
              <p className="text-sm text-slate-300 group-hover:text-white font-medium line-clamp-1 transition-colors text-left">
                {nextLesson.title}
              </p>
            </div>
            <ChevronLeft className="w-4 h-4 text-slate-500 group-hover:text-white flex-shrink-0 transition-colors" />
          </Link>
        ) : (
          <div className="flex-1" />
        )}
      </div>
    </div>
  );
}
