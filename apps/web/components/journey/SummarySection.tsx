'use client';

import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileCheck, RotateCcw, BookOpen, Download, CheckCircle2,
  ChevronDown, ExternalLink, Award, Sparkles, ListChecks, Heart,
  Check, X,
} from 'lucide-react';
import type {
  JourneyStep,
  JourneyStepProgress,
  JourneyTaskDecisionStatus,
  Research,
} from '../../lib/types/journey';
import Link from 'next/link';
import { AlmogAvatarChip } from './AlmogPresence';
import { isCommitmentGateResolved } from '../../lib/journey/commitment-gate';
import { emojiFromWellnessText } from '../../lib/emoji-from-text';
import { useProgressReport } from '../progress-report/ProgressReportProvider';

interface SummarySectionProps {
  step: JourneyStep;
  progress: JourneyStepProgress;
  onReplay: () => void;
  onComplete: () => void;
  onTaskDecisionChange: (taskId: string, status: JourneyTaskDecisionStatus) => void | Promise<void>;
}

export function SummarySection({ step, progress, onReplay, onComplete, onTaskDecisionChange }: SummarySectionProps) {
  const progressReport = useProgressReport();
  const [expandedResearch, setExpandedResearch] = useState<string | null>(null);
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null);
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
    background:
      'linear-gradient(165deg, rgba(255,255,255,0.34) 0%, rgba(167,243,208,0.2) 38%, rgba(255,255,255,0.3) 100%)',
    backdropFilter: 'blur(28px) saturate(1.35)',
    WebkitBackdropFilter: 'blur(28px) saturate(1.35)',
    boxShadow:
      '0 32px 64px rgba(6,78,59,0.14), 0 0 0 1px rgba(255,255,255,0.45) inset, inset 0 1px 1px rgba(255,255,255,0.78)',
    border: '1px solid rgba(255,255,255,0.48)',
  };

  /** הפרדה ברורה בין כותרת לגוף — כמו כרטיסי הפיצ׳רים בעמוד הנחיתה, עם גוף זכוכית */
  const sectionStackClass = 'px-3 sm:px-6 space-y-7 sm:space-y-8 pb-1';

  return (
    <div className="pb-8 w-full max-w-full min-w-0">
      {/* פאנל זכוכית אחד לכל תוכן הסיכום */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[28px] overflow-x-clip overflow-y-visible w-full max-w-full min-w-0"
        style={glassPanelStyle}
      >
        <div className="px-3 sm:px-6 pt-5 pb-2">
          <div className="flex items-center justify-center gap-3 flex-row-reverse flex-wrap sm:flex-nowrap">
            <div
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full"
              style={{
                background: 'rgba(255,255,255,0.42)',
                border: '1px solid rgba(255,255,255,0.55)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 18px rgba(6,78,59,0.06)',
              }}
            >
              <FileCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              <span className="text-sm font-black text-emerald-900">סיכום השיעור</span>
            </div>
            <AlmogAvatarChip size={46} />
          </div>
          <p className="text-center text-[11px] sm:text-xs text-emerald-900/75 font-semibold mt-2">
            מסכם איתך את הצעד
          </p>
        </div>

        {/* ציון — קופסה מעוגלת (לא רוחב מלא) */}
        <div className="px-3 sm:px-6 pb-4 pt-1">
          <div
            className="max-w-[min(100%,380px)] mx-auto rounded-[26px] overflow-hidden"
            style={{
              boxShadow:
                '0 16px 42px rgba(4,120,87,0.35), 0 0 0 1px rgba(255,255,255,0.35) inset, 0 0 32px rgba(52,211,153,0.25)',
            }}
          >
            <div
              className="px-5 sm:px-7 py-6 sm:py-8"
              style={{ background: 'linear-gradient(155deg, #065f46 0%, #047857 38%, #059669 65%, #34d399 100%)' }}
            >
              <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center sm:gap-8">
                <LessonScoreRing percent={overallScore} />
                <div className="text-center sm:text-right flex flex-col items-center sm:items-end gap-2 min-w-0">
                  <div className="text-4xl sm:text-5xl leading-none drop-shadow-sm">{getScoreEmoji(overallScore)}</div>
                  <p className="text-white/95 font-bold text-[15px] sm:text-base leading-snug max-w-[240px] sm:max-w-xs">
                    {getScoreMessage(overallScore)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`${sectionStackClass} pt-6`}>
          <SummaryGlassSection
            title="מדדים מהשיעור"
            subtitle="שאלות, משחק והתחייבות"
            headerGradient="linear-gradient(145deg, #047857, #059669, #10b981)"
            icon={<FileCheck className="h-5 w-5 text-white" strokeWidth={2.2} aria-hidden />}
          >
            <div className="flex flex-wrap justify-center gap-3 sm:gap-4 text-sm w-full">
              <div
                className="px-3 py-2.5 rounded-2xl flex-1 min-w-[calc(50%-6px)] sm:min-w-[120px] text-center border border-emerald-900/10 shadow-sm"
                style={{
                  background: 'rgba(255,255,255,0.72)',
                  boxShadow: '0 4px 14px rgba(6,78,59,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
                }}
              >
                <span className="text-gray-600 block text-xs mb-0.5">שאלות</span>
                <strong className="text-emerald-800 text-base">{quizCorrect}/{quizTotal}</strong>
              </div>
              <div
                className="px-3 py-2.5 rounded-2xl flex-1 min-w-[calc(50%-6px)] sm:min-w-[120px] text-center border border-emerald-900/10 shadow-sm"
                style={{
                  background: 'rgba(255,255,255,0.68)',
                  boxShadow: '0 4px 14px rgba(6,78,59,0.06), inset 0 1px 0 rgba(255,255,255,0.88)',
                }}
              >
                <span className="text-gray-600 block text-xs mb-0.5">משחק</span>
                <strong className="text-amber-800 text-base">{gameCorrect}/{gameTotal}</strong>
              </div>
              {step.commitment && isCommitmentGateResolved(true, progress) && (
                <div
                  className="px-3 py-2.5 rounded-2xl flex-1 min-w-full sm:min-w-[120px] text-center border border-emerald-900/10 shadow-sm"
                  style={{
                    background: progress.commitment_accepted
                      ? 'rgba(236,253,245,0.92)'
                      : 'rgba(255,247,237,0.92)',
                    boxShadow: '0 4px 14px rgba(6,78,59,0.06), inset 0 1px 0 rgba(255,255,255,0.85)',
                  }}
                >
                  {progress.commitment_accepted ? (
                    <Heart className="w-4 h-4 text-emerald-600 inline mb-0.5" fill="currentColor" aria-hidden />
                  ) : (
                    <Heart className="w-4 h-4 text-amber-700 inline mb-0.5" fill="none" strokeWidth={2} aria-hidden />
                  )}
                  <span
                    className={`font-bold block text-sm ${progress.commitment_accepted ? 'text-emerald-800' : 'text-amber-900'}`}
                  >
                    {progress.commitment_accepted ? 'התחייבות ✓' : 'בלי התחייבות בשלב זה'}
                  </span>
                </div>
              )}
            </div>
          </SummaryGlassSection>
        </div>

        {/* Summary text */}
        {step.summary_text && (
          <div className={sectionStackClass}>
            <SummaryGlassSection
              title="מה למדנו?"
              subtitle="נקודות מרכזיות מהשיעור"
              headerGradient="linear-gradient(145deg, #065f46, #047857, #059669)"
              icon={<BookOpen className="h-5 w-5 text-white" strokeWidth={2.2} aria-hidden />}
            >
              <p
                className="text-[15px] text-gray-800 leading-relaxed [overflow-wrap:anywhere] break-words hyphens-auto"
                lang="he"
              >
                {step.summary_text}
              </p>
            </SummaryGlassSection>
          </div>
        )}

        {/* Tasks */}
        {step.tasks.length > 0 && (
          <div className={`${sectionStackClass} w-full min-w-0 max-w-full overflow-x-clip`}>
            <SummaryGlassSection
              title="משימות לביצוע"
              subtitle="בחר מה מקובל עליך כרגע — אלמוג יזכור ויתאים את ההכוונה"
              headerGradient="linear-gradient(145deg, #b45309, #d97706, #f59e0b)"
              icon={<ListChecks className="h-5 w-5 text-white" strokeWidth={2.2} aria-hidden />}
            >
            <div className="flex flex-col gap-5 w-full min-w-0">
              {step.tasks.map((task) => {
                const decision = progress.task_statuses?.[task.id];
                const status = decision?.status ?? 'pending';
                const taskEmoji = emojiFromWellnessText(
                  `${task.title} ${task.description ?? ''}`,
                  task.emoji || '✨'
                );

                const ringGradient =
                  status === 'accepted'
                    ? 'linear-gradient(135deg, rgba(16,185,129,0.55), rgba(110,231,183,0.35), rgba(255,255,255,0.7))'
                    : status === 'rejected'
                      ? 'linear-gradient(135deg, rgba(251,113,133,0.5), rgba(253,186,116,0.35), rgba(255,255,255,0.65))'
                      : 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(167,243,208,0.4), rgba(204,251,241,0.5))';

                const innerBg =
                  status === 'accepted'
                    ? 'linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(209,250,229,0.38) 100%)'
                    : status === 'rejected'
                      ? 'linear-gradient(180deg, rgba(255,255,255,0.68) 0%, rgba(255,241,242,0.42) 100%)'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.58) 0%, rgba(236,253,245,0.28) 100%)';

                const accentBar =
                  status === 'accepted'
                    ? 'linear-gradient(180deg, #059669, #34d399)'
                    : status === 'rejected'
                      ? 'linear-gradient(180deg, #e11d48, #fb7185)'
                      : 'linear-gradient(180deg, rgba(5,150,105,0.35), rgba(52,211,153,0.2))';

                return (
                  <div
                    key={task.id}
                    className="w-full max-w-full min-w-0 h-auto shrink-0 rounded-[24px] p-[1.5px]"
                    style={{ background: ringGradient }}
                  >
                    <div
                      className="rounded-[22px] overflow-hidden relative"
                      style={{
                        background: innerBg,
                        backdropFilter: 'blur(22px) saturate(1.25)',
                        WebkitBackdropFilter: 'blur(22px) saturate(1.25)',
                        boxShadow:
                          '0 18px 48px rgba(6,78,59,0.11), 0 0 0 1px rgba(255,255,255,0.5) inset, inset 0 1px 1px rgba(255,255,255,0.9)',
                      }}
                    >
                      <div
                        className="absolute right-0 top-3 bottom-3 w-1 rounded-full opacity-90"
                        style={{ background: accentBar }}
                        aria-hidden
                      />
                          <div className="flex flex-row-reverse items-start gap-3.5 px-4 pt-4 pb-3 pr-5">
                            <div
                              className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[18px] text-[26px]"
                              style={{
                                background: 'linear-gradient(145deg, rgba(255,255,255,0.92), rgba(236,253,245,0.5))',
                                border: '1px solid rgba(255,255,255,0.85)',
                                boxShadow: '0 6px 20px rgba(6,78,59,0.08), inset 0 1px 0 rgba(255,255,255,0.95)',
                              }}
                              aria-hidden
                            >
                              {taskEmoji}
                            </div>
                            <div className="min-w-0 flex-1 text-right space-y-2">
                              <p className="font-black text-[15px] sm:text-[16px] leading-snug text-[#1A1730] [overflow-wrap:anywhere] break-words tracking-tight">
                                {task.title}
                              </p>
                              {task.description ? (
                                <p className="text-[12px] sm:text-[13px] text-gray-600/95 leading-relaxed [overflow-wrap:anywhere] break-words rounded-xl bg-white/35 px-3 py-2 border border-white/50">
                                  {task.description}
                                </p>
                              ) : null}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2.5 px-3 pb-3 pt-0">
                            <button
                              type="button"
                              disabled={taskBusyId === task.id}
                              onClick={async () => {
                                setTaskBusyId(task.id);
                                try {
                                  await Promise.resolve(onTaskDecisionChange(task.id, 'accepted'));
                                  progressReport.open('task_execution');
                                } finally {
                                  setTaskBusyId(null);
                                }
                              }}
                              className={`flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl px-2 py-2.5 text-[11px] sm:text-xs font-black transition active:scale-[0.98] disabled:opacity-60 ${
                                status === 'accepted'
                                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/18 ring-1 ring-white/25'
                                  : 'border border-emerald-400/45 bg-white/60 text-emerald-900 hover:bg-emerald-50/95'
                              }`}
                              style={{ backdropFilter: 'blur(8px)' }}
                            >
                              <Check className="h-4 w-4 shrink-0 opacity-95" strokeWidth={3} />
                              <span className="leading-tight">מקובל עליי</span>
                            </button>
                            <button
                              type="button"
                              disabled={taskBusyId === task.id}
                              onClick={() => void onTaskDecisionChange(task.id, 'rejected')}
                              className={`flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl px-2 py-2.5 text-[11px] sm:text-xs font-black transition active:scale-[0.98] disabled:opacity-60 ${
                                status === 'rejected'
                                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/15 ring-1 ring-white/20'
                                  : 'border border-rose-300/65 bg-white/55 text-rose-900 hover:bg-rose-50/95'
                              }`}
                              style={{ backdropFilter: 'blur(8px)' }}
                            >
                              <X className="h-4 w-4 shrink-0 opacity-95" strokeWidth={3} />
                              <span className="leading-tight">לא מקובל</span>
                            </button>
                          </div>

                          <div className="flex justify-end flex-wrap gap-2 border-t border-emerald-900/[0.07] px-3 py-3 bg-white/[0.12]">
                            {status === 'accepted' && (
                              <span
                                className="text-[10px] sm:text-[11px] font-bold tracking-wide text-emerald-900 bg-gradient-to-r from-emerald-50 to-teal-50/90 border border-emerald-300/50 rounded-full px-3 py-1.5 shadow-sm shadow-emerald-900/5"
                                style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.65)' }}
                              >
                                נשמר · מקובל
                              </span>
                            )}
                            {status === 'rejected' && (
                              <span
                                className="text-[10px] sm:text-[11px] font-bold tracking-wide text-rose-900 bg-gradient-to-r from-rose-50 to-orange-50/90 border border-rose-300/45 rounded-full px-3 py-1.5 shadow-sm shadow-rose-900/5"
                                style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.65)' }}
                              >
                                נשמר · לא מקובל כרגע
                              </span>
                            )}
                            {status === 'pending' && (
                              <span className="text-[10px] sm:text-[11px] font-semibold text-amber-950/95 bg-amber-100/85 border border-amber-300/55 rounded-full px-3 py-1.5 shadow-sm">
                                נא לבחור למעלה
                              </span>
                            )}
                            {status === 'accepted' && decision?.execution_done && (
                              <span className="text-[10px] sm:text-[11px] font-bold text-teal-900 bg-teal-50/95 border border-teal-300/50 rounded-full px-3 py-1.5 shadow-sm">
                                דווח: בוצע ✓
                              </span>
                            )}
                          </div>
                    </div>
                  </div>
                );
              })}
            </div>
            </SummaryGlassSection>
          </div>
        )}

        {/* Habits */}
        {step.habits.length > 0 && (
          <div className={sectionStackClass}>
            <SummaryGlassSection
              title="הרגלים חדשים"
              subtitle="אלו ההרגלים של הצעד — אלמוג יתבסס עליהם בשיחות"
              headerGradient="linear-gradient(145deg, #047857, #10b981, #34d399)"
              icon={<Heart className="h-5 w-5 text-white" strokeWidth={2.2} aria-hidden />}
            >
            <div className="flex flex-col gap-4 w-full min-w-0">
              {step.habits.map((habit) => {
                const habitEmoji = emojiFromWellnessText(
                  `${habit.title} ${habit.description ?? ''}`,
                  habit.emoji || '🌿'
                );
                const shortTitle =
                  habit.title.length > 42 ? `${habit.title.slice(0, 40)}…` : habit.title;
                return (
                  <div
                    key={habit.id}
                    className="w-full rounded-[22px] p-[1px] shrink-0 overflow-hidden"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(16,185,129,0.5), rgba(167,243,208,0.35), rgba(255,255,255,0.55))',
                      boxShadow: '0 12px 36px rgba(6,78,59,0.1)',
                    }}
                  >
                    <div
                      className="flex flex-row-reverse min-h-[108px]"
                      style={{
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                      }}
                    >
                      <div
                        className="flex w-[32%] max-w-[130px] shrink-0 flex-col items-center justify-center gap-1 px-2 py-3 text-center"
                        style={{
                          background: 'linear-gradient(180deg, rgba(52,211,153,0.85) 0%, rgba(5,150,105,0.92) 100%)',
                          borderLeft: '1px solid rgba(255,255,255,0.35)',
                        }}
                      >
                        <span className="text-2xl drop-shadow-sm" aria-hidden>
                          {habitEmoji}
                        </span>
                        <span
                          className="text-[10px] font-black leading-tight text-white/95 [overflow-wrap:anywhere] break-words px-0.5"
                          style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
                        >
                          {shortTitle}
                        </span>
                      </div>
                      <div
                        className="min-w-0 flex-1 px-4 py-3.5 flex flex-col justify-center text-right"
                        style={{
                          background: 'linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(240,253,250,0.5) 100%)',
                        }}
                      >
                        <p className="font-black text-[15px] leading-snug text-[#1A1730] [overflow-wrap:anywhere] break-words">
                          {habit.title}
                        </p>
                        {habit.description ? (
                          <p className="text-[12px] sm:text-[13px] text-gray-600 leading-relaxed [overflow-wrap:anywhere] break-words mt-2 border-t border-emerald-900/[0.08] pt-2">
                            {habit.description}
                          </p>
                        ) : null}
                        <div className="mt-3 flex justify-start">
                          <span
                            className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide px-3 py-1.5 rounded-full border border-emerald-400/35 text-emerald-900"
                            style={{
                              background: 'linear-gradient(135deg, rgba(209,250,229,0.95), rgba(167,243,208,0.35))',
                              boxShadow: '0 4px 14px rgba(16,185,129,0.12), inset 0 1px 0 rgba(255,255,255,0.75)',
                            }}
                          >
                            תדירות · {getHabitFrequencyLabel(habit.frequency)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            </SummaryGlassSection>
          </div>
        )}

        {/* Research accordion */}
        {step.researches.length > 0 && (
          <div className={sectionStackClass}>
            <SummaryGlassSection
              title="מחקרים תומכים"
              subtitle="מקורות וממצאים לעיון"
              headerGradient="linear-gradient(145deg, #1d4ed8, #3b82f6, #60a5fa)"
              icon={<Award className="h-5 w-5 text-white" strokeWidth={2.2} aria-hidden />}
            >
            <div className="space-y-3 w-full min-w-0">
              {step.researches.map((research) => (
                <ResearchItem
                  key={research.id}
                  research={research}
                  isExpanded={expandedResearch === research.id}
                  onToggle={() => setExpandedResearch(expandedResearch === research.id ? null : research.id)}
                />
              ))}
            </div>
            </SummaryGlassSection>
          </div>
        )}

        {/* PDF Download */}
        {step.pdf_url && (
          <div className={sectionStackClass}>
            <SummaryGlassSection
              title="חומר להורדה"
              subtitle="סיכום בקובץ PDF"
              headerGradient="linear-gradient(145deg, #0f766e, #14b8a6, #2dd4bf)"
              icon={<Download className="h-5 w-5 text-white" strokeWidth={2.2} aria-hidden />}
            >
            <a
              href={step.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-2xl transition-all hover:scale-[1.01] border border-white/55 shadow-md"
              style={{
                background: 'rgba(255,255,255,0.62)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85), 0 8px 24px rgba(6,78,59,0.08)',
              }}
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
            </SummaryGlassSection>
          </div>
        )}

        {/* Action buttons */}
        <div className={`${sectionStackClass} pt-2 pb-6`}>
          <div
            className="max-w-lg mx-auto w-full rounded-[24px] overflow-hidden space-y-3 p-4"
            style={{
              border: '1px solid rgba(255,255,255,0.55)',
              background: 'linear-gradient(165deg, rgba(255,255,255,0.48) 0%, rgba(236,253,245,0.4) 100%)',
              backdropFilter: 'blur(22px)',
              WebkitBackdropFilter: 'blur(22px)',
              boxShadow: '0 14px 40px rgba(6,78,59,0.12), inset 0 1px 0 rgba(255,255,255,0.75)',
            }}
          >
          <p className="text-center text-[11px] font-bold text-emerald-900/75">המשך בשיעור</p>
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
        </div>
      </motion.div>
    </div>
  );
}

function SummaryGlassSection({
  title,
  subtitle,
  headerGradient,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  headerGradient: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="max-w-lg mx-auto w-full min-w-0 rounded-[24px] overflow-hidden"
      style={{
        border: '1px solid rgba(255,255,255,0.58)',
        boxShadow:
          '0 16px 48px rgba(6,78,59,0.13), 0 0 0 1px rgba(255,255,255,0.22) inset',
      }}
    >
      <div
        className="flex items-center gap-3 px-4 py-3.5 sm:px-5 sm:py-4"
        style={{
          background: headerGradient,
          boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.07)',
        }}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: 'rgba(255,255,255,0.22)',
            border: '1px solid rgba(255,255,255,0.38)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
          }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1 text-right">
          <h3
            className="text-[15px] sm:text-base font-black text-white leading-snug"
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.14)' }}
          >
            {title}
          </h3>
          {subtitle ? (
            <p className="text-[11px] sm:text-xs font-semibold text-white/90 mt-1 leading-relaxed">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      <div
        className="px-3.5 py-4 sm:px-4 sm:py-[18px]"
        style={{
          background:
            'linear-gradient(165deg, rgba(255,255,255,0.58) 0%, rgba(236,253,245,0.4) 52%, rgba(255,255,255,0.52) 100%)',
          backdropFilter: 'blur(24px) saturate(1.25)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.25)',
          borderTop: '1px solid rgba(255,255,255,0.62)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function LessonScoreRing({ percent }: { percent: number }) {
  const rid = useId().replace(/:/g, '');
  const gradId = `lessonScoreRingStroke-${rid}`;
  const r = 38;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, percent));
  const dashOffset = c - (clamped / 100) * c;

  return (
    <div
      className="relative h-[104px] w-[104px] shrink-0 rounded-full p-[3px]"
      style={{
        background: 'linear-gradient(135deg, #fbbf24 0%, #34d399 40%, #22d3ee 75%, #c4b5fd 100%)',
        boxShadow: '0 10px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.35)',
      }}
    >
      <div className="relative flex h-full w-full items-center justify-center rounded-full bg-emerald-950/45 p-1.5">
        <svg width={90} height={90} viewBox="0 0 100 100" className="-rotate-90 shrink-0" aria-hidden>
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="40%" stopColor="#4ade80" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={dashOffset}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-white">
          <span className="text-2xl font-black leading-none tracking-tight drop-shadow-md">{clamped}%</span>
          <span className="text-[10px] font-bold text-white/90 mt-0.5">התקדמות</span>
        </div>
      </div>
    </div>
  );
}

function ResearchItem({ research, isExpanded, onToggle }: { research: Research; isExpanded: boolean; onToggle: () => void }) {
  return (
    <div
      className="rounded-[18px] overflow-hidden border border-white/70 ring-1 ring-emerald-900/[0.05]"
      style={{
        background:
          'linear-gradient(165deg, rgba(255,255,255,0.62) 0%, rgba(239,246,255,0.48) 40%, rgba(255,255,255,0.45) 100%)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow:
          '0 8px 28px rgba(6,78,59,0.08), inset 0 1px 0 rgba(255,255,255,0.85)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 p-3.5 text-start transition-all hover:bg-white/25 active:bg-white/30"
      >
        <ChevronDown
          className={`w-4 h-4 text-emerald-700/50 transition-transform shrink-0 mt-1 ${isExpanded ? 'rotate-180' : ''}`}
        />
        <div className="flex-1 min-w-0 dir-ltr text-left">
          <p
            className="text-sm font-bold text-gray-900 leading-snug break-words [overflow-wrap:anywhere]"
            lang="en"
          >
            {research.title}
          </p>
          <p className="text-xs text-gray-500 mt-1 break-words">
            {research.authors} ({research.year})
          </p>
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
            <div className="px-3.5 pb-3.5 pt-0 border-t border-white/40">
              <p className="text-xs text-gray-500 mb-2 italic dir-ltr text-left break-words" lang="en">
                {research.journal}
              </p>
              <p className="text-sm text-gray-700 leading-relaxed mb-2 dir-ltr text-left break-words hyphens-auto" lang="en">
                {research.finding}
              </p>
              {research.url && (
                <a
                  href={research.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold dir-ltr"
                >
                  <ExternalLink className="w-3 h-3 shrink-0" /> צפה במחקר המלא
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
