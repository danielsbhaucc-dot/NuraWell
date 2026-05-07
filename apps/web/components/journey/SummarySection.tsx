'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileCheck, RotateCcw, BookOpen, Download, CheckCircle2,
  ChevronDown, ExternalLink, Award, Sparkles, ListChecks, Heart
} from 'lucide-react';
import type { JourneyStep, JourneyStepProgress, Research } from '../../lib/types/journey';
import Link from 'next/link';

interface SummarySectionProps {
  step: JourneyStep;
  progress: JourneyStepProgress;
  onReplay: () => void;
  onComplete: () => void;
}

export function SummarySection({ step, progress, onReplay, onComplete }: SummarySectionProps) {
  const [expandedResearch, setExpandedResearch] = useState<string | null>(null);
  const quizTotal = step.quiz_questions.length;
  const quizCorrect = progress.quiz_score ?? 0;
  const gameTotal = step.game_items.length;
  const gameCorrect = progress.game_score ?? 0;
  const overallScore = quizTotal + gameTotal > 0
    ? Math.round(((quizCorrect + gameCorrect) / (quizTotal + gameTotal)) * 100)
    : 0;

  const getScoreEmoji = (score: number) => {
    if (score >= 90) return '🏆';
    if (score >= 70) return '⭐';
    if (score >= 50) return '👍';
    return '💪';
  };

  const getScoreMessage = (score: number) => {
    if (score >= 90) return 'מדהים! שליטה מלאה בחומר!';
    if (score >= 70) return 'מצוין! הבנת את רוב החומר';
    if (score >= 50) return 'לא רע! תוכל לשפר בפעם הבאה';
    return 'כדאי לצפות שוב ולנסות שוב 💪';
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-3"
          style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <FileCheck className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-bold text-emerald-700">סיכום השיעור</span>
        </div>
      </div>

      {/* Score card — green header + white body */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl overflow-hidden"
        style={{
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        }}
      >
        {/* Green gradient header */}
        <div className="px-6 py-5 text-center" style={{ background: 'linear-gradient(145deg, #047857, #059669, #10b981)' }}>
          <div className="text-5xl mb-3">{getScoreEmoji(overallScore)}</div>
          <div className="text-4xl font-black text-white mb-1">{overallScore}%</div>
          <p className="text-white/90 font-bold">{getScoreMessage(overallScore)}</p>
        </div>
        {/* White body */}
        <div className="p-5 bg-white">
        <div className="flex justify-center gap-4 text-sm">
          <div className="px-3 py-2 rounded-xl" style={{ background: 'rgba(16,185,129,0.1)' }}>
            <span className="text-gray-500">שאלות: </span>
            <strong className="text-emerald-700">{quizCorrect}/{quizTotal}</strong>
          </div>
          <div className="px-3 py-2 rounded-xl" style={{ background: 'rgba(245,158,11,0.1)' }}>
            <span className="text-gray-500">משחק: </span>
            <strong className="text-amber-700">{gameCorrect}/{gameTotal}</strong>
          </div>
          {progress.commitment_accepted && (
            <div className="px-3 py-2 rounded-xl" style={{ background: 'rgba(16,185,129,0.1)' }}>
              <Heart className="w-4 h-4 text-emerald-600 inline" fill="currentColor" />
              <span className="text-emerald-700 font-bold mr-1">התחייבות ✓</span>
            </div>
          )}
        </div>
        </div>{/* end white body */}
      </motion.div>

      {/* Summary text */}
      {step.summary_text && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl p-5"
          style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-6 rounded-full" style={{ background: 'linear-gradient(to bottom, #6ee7b7, #047857)' }} />
            <BookOpen className="w-4 h-4 text-emerald-600" />
            <h3 className="font-black text-base" style={{ color: '#1A1730' }}>מה למדנו?</h3>
          </div>
          <p className="text-[15px] text-gray-600 leading-relaxed">{step.summary_text}</p>
        </motion.div>
      )}

      {/* Tasks */}
      {step.tasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl p-5"
          style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-6 rounded-full" style={{ background: 'linear-gradient(to bottom, #fbbf24, #d97706)' }} />
            <ListChecks className="w-4 h-4 text-amber-600" />
            <h3 className="font-black text-base" style={{ color: '#1A1730' }}>משימות לביצוע</h3>
          </div>
          <div className="space-y-2">
            {step.tasks.map((task) => (
              <div key={task.id} className="flex items-start gap-3 p-3 rounded-xl"
                style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.04)' }}>
                <span className="text-xl flex-shrink-0">{task.emoji}</span>
                <div>
                  <p className="font-bold text-sm" style={{ color: '#1A1730' }}>{task.title}</p>
                  {task.description && <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Habits */}
      {step.habits.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl p-5"
          style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-6 rounded-full" style={{ background: 'linear-gradient(to bottom, #34d399, #047857)' }} />
            <Heart className="w-4 h-4 text-emerald-600" />
            <h3 className="font-black text-base" style={{ color: '#1A1730' }}>הרגלים חדשים</h3>
          </div>
          <div className="space-y-2">
            {step.habits.map((habit) => (
              <div key={habit.id} className="flex items-start gap-3 p-3 rounded-xl"
                style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.1)' }}>
                <span className="text-xl flex-shrink-0">{habit.emoji}</span>
                <div>
                  <p className="font-bold text-sm" style={{ color: '#1A1730' }}>{habit.title}</p>
                  {habit.description && <p className="text-xs text-gray-500 mt-0.5">{habit.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Research accordion */}
      {step.researches.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl p-5"
          style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-6 rounded-full" style={{ background: 'linear-gradient(to bottom, #60a5fa, #3b82f6)' }} />
            <Award className="w-4 h-4 text-blue-500" />
            <h3 className="font-black text-base" style={{ color: '#1A1730' }}>מחקרים תומכים</h3>
          </div>
          <div className="space-y-2">
            {step.researches.map((research) => (
              <ResearchItem
                key={research.id}
                research={research}
                isExpanded={expandedResearch === research.id}
                onToggle={() => setExpandedResearch(expandedResearch === research.id ? null : research.id)}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* PDF Download */}
      {step.pdf_url && (
        <motion.a
          href={step.pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex items-center gap-3 p-4 rounded-2xl transition-all hover:scale-[1.01]"
          style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <Download className="w-5 h-5 text-red-500" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm" style={{ color: '#1A1730' }}>הורד סיכום PDF</p>
            <p className="text-xs text-gray-500">{step.pdf_name || 'סיכום השיעור'}</p>
          </div>
          <ExternalLink className="w-4 h-4 text-gray-400" />
        </motion.a>
      )}

      {/* Action buttons */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="space-y-3 pt-2"
      >
        {/* Replay */}
        <button onClick={onReplay}
          className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-95"
          style={{ background: 'rgba(0,0,0,0.03)', border: '1.5px solid rgba(0,0,0,0.08)', color: '#4b5563' }}>
          <RotateCcw className="w-4 h-4" />
          <span>שחק שוב את השיעור</span>
        </button>

        {/* Complete / go to journey */}
        {!progress.is_completed ? (
          <button onClick={onComplete}
            className="w-full py-4 rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
            style={{ background: 'linear-gradient(135deg, #047857, #10b981)', boxShadow: '0 6px 20px rgba(16,185,129,0.3)' }}>
            <CheckCircle2 className="w-5 h-5" />
            <span>סיימתי! סמן כהושלם</span>
          </button>
        ) : (
          <Link href="/journey"
            className="w-full py-4 rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
            style={{ background: 'linear-gradient(135deg, #047857, #10b981)', boxShadow: '0 6px 20px rgba(16,185,129,0.3)' }}>
            <Sparkles className="w-5 h-5" />
            <span>חזרה למסע</span>
          </Link>
        )}
      </motion.div>
    </div>
  );
}

function ResearchItem({ research, isExpanded, onToggle }: { research: Research; isExpanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
      <button onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 text-right transition-all hover:bg-gray-50">
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: '#1A1730' }}>{research.title}</p>
          <p className="text-xs text-gray-400">{research.authors} ({research.year})</p>
        </div>
      </button>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0">
              <p className="text-xs text-gray-500 mb-1 italic">{research.journal}</p>
              <p className="text-sm text-gray-600 leading-relaxed mb-2">{research.finding}</p>
              {research.url && (
                <a href={research.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 font-semibold">
                  <ExternalLink className="w-3 h-3" /> צפה במחקר המלא
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
