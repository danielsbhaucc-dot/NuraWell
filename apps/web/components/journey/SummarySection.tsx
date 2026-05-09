'use client';

import { useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileCheck, RotateCcw, BookOpen, Download, CheckCircle2,
  ChevronDown, ExternalLink, Award, Sparkles, ListChecks, Heart
} from 'lucide-react';
import type {
  JourneyStep,
  JourneyStepProgress,
  JourneyTaskDecisionStatus,
  Research,
} from '../../lib/types/journey';
import Link from 'next/link';
import { AlmogInlinePresence } from './AlmogPresence';

interface SummarySectionProps {
  step: JourneyStep;
  progress: JourneyStepProgress;
  onReplay: () => void;
  onComplete: () => void;
  onTaskDecisionChange: (taskId: string, status: JourneyTaskDecisionStatus) => void;
}

export function SummarySection({ step, progress, onReplay, onComplete, onTaskDecisionChange }: SummarySectionProps) {
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

  const getHabitFrequencyLabel = (frequency: 'daily' | 'weekly' | 'per_meal') => {
    if (frequency === 'daily') return 'יומי';
    if (frequency === 'weekly') return 'שבועי';
    return 'לפני ארוחה';
  };

  const glassPanelStyle: CSSProperties = {
    background: 'linear-gradient(165deg, rgba(255,255,255,0.52) 0%, rgba(236,253,245,0.38) 45%, rgba(255,255,255,0.44) 100%)',
    backdropFilter: 'blur(22px)',
    WebkitBackdropFilter: 'blur(22px)',
    boxShadow: '0 18px 48px rgba(6,78,59,0.1), inset 0 1px 0 rgba(255,255,255,0.65)',
    border: '1px solid rgba(255,255,255,0.55)',
  };

  const sectionDividerClass = 'border-t border-emerald-900/[0.06]';

  return (
    <div className="pb-8">
      {/* פאנל זכוכית אחד לכל תוכן הסיכום */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[28px] overflow-hidden"
        style={glassPanelStyle}
      >
        <div className="px-4 pt-5 pb-3 sm:px-6 sm:pt-6">
          <div className="text-center">
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-3"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.22)' }}
            >
              <FileCheck className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-bold text-emerald-700">סיכום השיעור</span>
            </div>
          </div>
          <AlmogInlinePresence />
        </div>

        {/* ציון — רצועה ירוקה רציפה בתוך הזכוכית */}
        <div className="px-4 sm:px-6 py-6 sm:py-7" style={{ background: 'linear-gradient(145deg, #047857, #059669, #10b981)' }}>
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center sm:gap-10">
            <LessonScoreRing percent={overallScore} />
            <div className="text-center sm:text-right flex flex-col items-center sm:items-end gap-2 min-w-0">
              <div className="text-4xl sm:text-5xl leading-none">{getScoreEmoji(overallScore)}</div>
              <p className="text-white/95 font-bold text-[15px] sm:text-base leading-snug max-w-[280px] sm:max-w-xs">
                {getScoreMessage(overallScore)}
              </p>
            </div>
          </div>
        </div>

        <div
          className={`px-4 sm:px-6 py-4 ${sectionDividerClass}`}
          style={{ background: 'rgba(255,255,255,0.28)' }}
        >
          <div className="flex flex-wrap justify-stretch gap-2.5 sm:gap-3 text-sm">
            <div
              className="px-3 py-2.5 rounded-2xl flex-1 min-w-[calc(50%-6px)] sm:min-w-[120px] text-center border border-white/50 shadow-sm"
              style={{ background: 'rgba(255,255,255,0.55)' }}
            >
              <span className="text-gray-600 block text-xs mb-0.5">שאלות</span>
              <strong className="text-emerald-800 text-base">{quizCorrect}/{quizTotal}</strong>
            </div>
            <div
              className="px-3 py-2.5 rounded-2xl flex-1 min-w-[calc(50%-6px)] sm:min-w-[120px] text-center border border-white/50 shadow-sm"
              style={{ background: 'rgba(255,255,255,0.5)' }}
            >
              <span className="text-gray-600 block text-xs mb-0.5">משחק</span>
              <strong className="text-amber-800 text-base">{gameCorrect}/{gameTotal}</strong>
            </div>
            {progress.commitment_accepted && (
              <div
                className="px-3 py-2.5 rounded-2xl flex-1 min-w-full sm:min-w-[120px] text-center border border-white/50 shadow-sm"
                style={{ background: 'rgba(255,255,255,0.55)' }}
              >
                <Heart className="w-4 h-4 text-emerald-600 inline mb-0.5" fill="currentColor" />
                <span className="text-emerald-800 font-bold block text-sm">התחייבות ✓</span>
              </div>
            )}
          </div>
        </div>

        {/* Summary text */}
        {step.summary_text && (
          <div className={`px-4 sm:px-6 py-5 ${sectionDividerClass}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-6 rounded-full" style={{ background: 'linear-gradient(to bottom, #6ee7b7, #047857)' }} />
              <BookOpen className="w-4 h-4 text-emerald-600" />
              <h3 className="font-black text-base" style={{ color: '#1A1730' }}>מה למדנו?</h3>
            </div>
            <p className="text-[15px] text-gray-700 leading-relaxed">{step.summary_text}</p>
          </div>
        )}

        {/* Tasks */}
        {step.tasks.length > 0 && (
          <div className={`px-4 sm:px-6 py-5 ${sectionDividerClass}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-6 rounded-full shrink-0" style={{ background: 'linear-gradient(to bottom, #fbbf24, #d97706)' }} />
              <ListChecks className="w-4 h-4 text-amber-600 shrink-0" />
              <h3 className="font-black text-base min-w-0" style={{ color: '#1A1730' }}>משימות לביצוע</h3>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 mb-4 leading-relaxed">
              בחר מה מקובל עליך כרגע. אלמוג יזכור את הבחירה שלך ויתאים את ההכוונה בהתאם.
            </p>
            <div className="space-y-4">
              {step.tasks.map((task) => {
                const decision = progress.task_statuses?.[task.id];
                const status = decision?.status ?? 'pending';
                return (
                  <div
                    key={task.id}
                    className="w-full max-w-full rounded-2xl p-4 sm:p-5 overflow-hidden transition-shadow"
                    style={{
                      background:
                        status === 'accepted'
                          ? 'rgba(236,253,245,0.72)'
                          : status === 'rejected'
                            ? 'rgba(255,241,242,0.72)'
                            : 'rgba(255,255,255,0.45)',
                      border:
                        status === 'accepted'
                          ? '1px solid rgba(16,185,129,0.28)'
                          : status === 'rejected'
                            ? '1px solid rgba(244,63,94,0.22)'
                            : '1px solid rgba(255,255,255,0.65)',
                      boxShadow: '0 4px 16px rgba(6,78,59,0.05), inset 0 1px 0 rgba(255,255,255,0.7)',
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    <div className="flex flex-row gap-3 sm:gap-4 items-start w-full">
                      <span className="text-2xl shrink-0 leading-none pt-0.5 select-none" aria-hidden>
                        {task.emoji}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <p
                          className="font-bold text-[15px] sm:text-base leading-relaxed break-words text-pretty"
                          style={{ color: '#1A1730', wordBreak: 'break-word' }}
                        >
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="text-[13px] sm:text-sm text-gray-600 leading-relaxed break-words">{task.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-2.5">
                      <button
                        type="button"
                        onClick={() => onTaskDecisionChange(task.id, 'accepted')}
                        className={`w-full px-4 py-3 rounded-2xl text-sm font-bold transition shadow-sm ${
                          status === 'accepted'
                            ? 'bg-emerald-600 text-white shadow-emerald-900/15'
                            : 'bg-emerald-50/90 text-emerald-800 border border-emerald-200/90 hover:bg-emerald-100'
                        }`}
                      >
                        מקובל עליי
                      </button>
                      <button
                        type="button"
                        onClick={() => onTaskDecisionChange(task.id, 'rejected')}
                        className={`w-full px-4 py-3 rounded-2xl text-sm font-bold transition shadow-sm ${
                          status === 'rejected'
                            ? 'bg-rose-600 text-white shadow-rose-900/15'
                            : 'bg-rose-50/90 text-rose-800 border border-rose-200/90 hover:bg-rose-100'
                        }`}
                      >
                        לא מקובל כרגע
                      </button>
                    </div>
                    <div className="mt-3 flex justify-start">
                      {status === 'accepted' && (
                        <span className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200/90 rounded-lg px-2.5 py-1 font-semibold">
                          סומן: מקובל
                        </span>
                      )}
                      {status === 'rejected' && (
                        <span className="text-[11px] text-rose-800 bg-rose-50 border border-rose-200/90 rounded-lg px-2.5 py-1 font-semibold">
                          סומן: לא מקובל כרגע
                        </span>
                      )}
                      {status === 'pending' && (
                        <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200/90 rounded-lg px-2.5 py-1 font-semibold">
                          ממתין לבחירה
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Habits */}
        {step.habits.length > 0 && (
          <div className={`px-4 sm:px-6 py-5 ${sectionDividerClass}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-6 rounded-full" style={{ background: 'linear-gradient(to bottom, #34d399, #047857)' }} />
              <Heart className="w-4 h-4 text-emerald-600" />
              <h3 className="font-black text-base" style={{ color: '#1A1730' }}>הרגלים חדשים</h3>
            </div>
            <p className="text-xs text-gray-600 mb-3">
              אלו ההרגלים של הצעד הזה. אלמוג יתבסס עליהם בשיחות שלך.
            </p>
            <div className="space-y-3">
              {step.habits.map((habit) => (
                <div
                  key={habit.id}
                  className="p-3.5 rounded-xl border border-white/55 shadow-sm"
                  style={{ background: 'rgba(255,255,255,0.42)', backdropFilter: 'blur(8px)' }}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl flex-shrink-0 mt-0.5">{habit.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm leading-snug break-words" style={{ color: '#1A1730' }}>{habit.title}</p>
                      {habit.description && <p className="text-xs text-gray-600 mt-1">{habit.description}</p>}
                    </div>
                  </div>
                  <span className="inline-flex mt-3 text-[11px] px-2 py-1 rounded-md border border-emerald-200/80 bg-emerald-50/90 text-emerald-800 font-semibold">
                    תדירות: {getHabitFrequencyLabel(habit.frequency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Research accordion */}
        {step.researches.length > 0 && (
          <div className={`px-4 sm:px-6 py-5 ${sectionDividerClass}`}>
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
          </div>
        )}

        {/* PDF Download */}
        {step.pdf_url && (
          <div className={`px-4 sm:px-6 py-4 ${sectionDividerClass}`}>
            <a
              href={step.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-2xl transition-all hover:scale-[1.01] border border-white/50 shadow-sm"
              style={{ background: 'rgba(255,255,255,0.45)', backdropFilter: 'blur(10px)' }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <Download className="w-5 h-5 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm" style={{ color: '#1A1730' }}>הורד סיכום PDF</p>
                <p className="text-xs text-gray-600">{step.pdf_name || 'סיכום השיעור'}</p>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400 shrink-0" />
            </a>
          </div>
        )}

        {/* Action buttons */}
        <div className={`px-4 sm:px-6 py-5 ${sectionDividerClass} space-y-3`} style={{ background: 'rgba(255,255,255,0.18)' }}>
          <button
            type="button"
            onClick={onReplay}
            className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-95 border border-white/45 shadow-sm"
            style={{ background: 'rgba(255,255,255,0.55)', color: '#374151', backdropFilter: 'blur(8px)' }}
          >
            <RotateCcw className="w-4 h-4" />
            <span>שחק שוב את השיעור</span>
          </button>

          {!progress.is_completed ? (
            <button
              type="button"
              onClick={onComplete}
              className="w-full py-4 rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
              style={{ background: 'linear-gradient(135deg, #047857, #10b981)', boxShadow: '0 6px 20px rgba(16,185,129,0.3)' }}
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>סיימתי! סמן כהושלם</span>
            </button>
          ) : (
            <Link
              href="/journey"
              className="w-full py-4 rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
              style={{ background: 'linear-gradient(135deg, #047857, #10b981)', boxShadow: '0 6px 20px rgba(16,185,129,0.3)' }}
            >
              <Sparkles className="w-5 h-5" />
              <span>חזרה למסע</span>
            </Link>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function LessonScoreRing({ percent }: { percent: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, percent));
  const dashOffset = c - (clamped / 100) * c;

  return (
    <div className="relative h-[100px] w-[100px] shrink-0">
      <svg className="h-[100px] w-[100px] -rotate-90 drop-shadow-md" viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.98)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={dashOffset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white pointer-events-none">
        <span className="text-2xl font-black leading-none tracking-tight">{clamped}%</span>
        <span className="text-[10px] font-bold text-white/85 mt-1">התקדמות</span>
      </div>
    </div>
  );
}

function ResearchItem({ research, isExpanded, onToggle }: { research: Research; isExpanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl overflow-hidden border border-white/50 shadow-sm" style={{ background: 'rgba(255,255,255,0.38)' }}>
      <button onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 text-right transition-all hover:bg-white/35">
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
