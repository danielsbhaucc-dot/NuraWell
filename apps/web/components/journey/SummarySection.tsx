'use client';

import { useId, useState, type CSSProperties } from 'react';
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
    background:
      'linear-gradient(165deg, rgba(255,255,255,0.34) 0%, rgba(167,243,208,0.2) 38%, rgba(255,255,255,0.3) 100%)',
    backdropFilter: 'blur(28px) saturate(1.35)',
    WebkitBackdropFilter: 'blur(28px) saturate(1.35)',
    boxShadow: '0 28px 56px rgba(6,78,59,0.12), inset 0 1px 1px rgba(255,255,255,0.72), inset 0 -1px 0 rgba(255,255,255,0.25)',
    border: '1px solid rgba(255,255,255,0.38)',
  };

  const sectionDividerClass = 'border-t border-emerald-900/[0.06]';

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

        <div
          className={`px-3 sm:px-6 py-4 ${sectionDividerClass}`}
          style={{ background: 'rgba(255,255,255,0.22)' }}
        >
          <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3 text-sm max-w-lg mx-auto w-full">
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
            {step.commitment && isCommitmentGateResolved(true, progress) && (
              <div
                className="px-3 py-2.5 rounded-2xl flex-1 min-w-full sm:min-w-[120px] text-center border border-white/55 shadow-sm"
                style={{
                  background: progress.commitment_accepted
                    ? 'rgba(236,253,245,0.75)'
                    : 'rgba(255,247,237,0.85)',
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
        </div>

        {/* Summary text */}
        {step.summary_text && (
          <div className={`px-3 sm:px-6 py-5 ${sectionDividerClass}`}>
            <div className="flex items-center gap-2 mb-3 max-w-lg mx-auto">
              <div className="w-1.5 h-6 rounded-full" style={{ background: 'linear-gradient(to bottom, #6ee7b7, #047857)' }} />
              <BookOpen className="w-4 h-4 text-emerald-600" />
              <h3 className="font-black text-base" style={{ color: '#1A1730' }}>מה למדנו?</h3>
            </div>
            <div
              className="max-w-lg mx-auto rounded-2xl border border-white/45 px-4 py-4 min-w-0"
              style={{
                background: 'rgba(255,255,255,0.28)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55)',
              }}
            >
              <p
                className="text-[15px] text-gray-800 leading-relaxed [overflow-wrap:anywhere] break-words hyphens-auto"
                lang="he"
              >
                {step.summary_text}
              </p>
            </div>
          </div>
        )}

        {/* Tasks */}
        {step.tasks.length > 0 && (
          <div className={`px-3 sm:px-6 py-5 w-full min-w-0 max-w-full overflow-x-clip ${sectionDividerClass}`}>
            <div className="flex items-center gap-2 mb-2 max-w-lg mx-auto">
              <div className="w-1.5 h-6 rounded-full shrink-0" style={{ background: 'linear-gradient(to bottom, #fbbf24, #d97706)' }} />
              <ListChecks className="w-4 h-4 text-amber-600 shrink-0" />
              <h3 className="font-black text-base min-w-0" style={{ color: '#1A1730' }}>משימות לביצוע</h3>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 mb-4 leading-relaxed max-w-lg mx-auto px-0.5">
              בחר מה מקובל עליך כרגע. אלמוג יזכור את הבחירה שלך ויתאים את ההכוונה בהתאם.
            </p>
            <div className="flex flex-col gap-4 w-full max-w-lg mx-auto min-w-0">
              {step.tasks.map((task) => {
                const decision = progress.task_statuses?.[task.id];
                const status = decision?.status ?? 'pending';

                const ringGradient =
                  status === 'accepted'
                    ? 'linear-gradient(145deg, rgba(52,211,153,0.75), rgba(167,243,208,0.45), rgba(255,255,255,0.55))'
                    : status === 'rejected'
                      ? 'linear-gradient(145deg, rgba(251,113,133,0.65), rgba(254,215,170,0.4), rgba(255,255,255,0.5))'
                      : 'linear-gradient(145deg, rgba(255,255,255,0.85), rgba(167,243,208,0.55), rgba(204,251,241,0.45))';

                const innerBg =
                  status === 'accepted'
                    ? 'linear-gradient(180deg, rgba(255,255,255,0.62) 0%, rgba(209,250,229,0.42) 100%)'
                    : status === 'rejected'
                      ? 'linear-gradient(180deg, rgba(255,255,255,0.58) 0%, rgba(255,241,242,0.45) 100%)'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.52) 0%, rgba(240,253,250,0.34) 100%)';

                return (
                  <div
                    key={task.id}
                    className="w-full max-w-full min-w-0 h-auto shrink-0 rounded-[22px] p-[1px]"
                    style={{ background: ringGradient }}
                  >
                    <div
                      className="rounded-[21px] overflow-hidden"
                      style={{
                        background: innerBg,
                        backdropFilter: 'blur(22px) saturate(1.25)',
                        WebkitBackdropFilter: 'blur(22px) saturate(1.25)',
                        boxShadow:
                          '0 14px 42px rgba(6,78,59,0.1), inset 0 1px 1px rgba(255,255,255,0.85), inset 0 -1px 0 rgba(255,255,255,0.2)',
                      }}
                    >
                          {/* כותרת — גובה לפי תוכן בלבד */}
                          <div className="flex flex-row-reverse items-start gap-3 px-4 pt-4 pb-3">
                            <div
                              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-inner"
                              style={{
                                background: 'rgba(255,255,255,0.55)',
                                border: '1px solid rgba(255,255,255,0.75)',
                                boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.9)',
                              }}
                              aria-hidden
                            >
                              {task.emoji}
                            </div>
                            <div className="min-w-0 flex-1 text-right space-y-1.5">
                              <p className="font-black text-[15px] leading-snug text-[#1A1730] [overflow-wrap:anywhere] break-words">
                                {task.title}
                              </p>
                              {task.description ? (
                                <p className="text-[12px] sm:text-[13px] text-gray-600 leading-relaxed [overflow-wrap:anywhere] break-words border-t border-white/40 pt-2">
                                  {task.description}
                                </p>
                              ) : null}
                            </div>
                          </div>

                          {/* כפתורים — שורה כפולה במובייל חוסכת גובה */}
                          <div className="grid grid-cols-2 gap-2 px-3 pb-3 pt-0">
                            <button
                              type="button"
                              onClick={() => onTaskDecisionChange(task.id, 'accepted')}
                              className={`flex min-h-[44px] items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] sm:text-xs font-black transition active:scale-[0.98] ${
                                status === 'accepted'
                                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/20'
                                  : 'border border-emerald-300/70 bg-white/50 text-emerald-900 hover:bg-emerald-50/90'
                              }`}
                              style={{ backdropFilter: 'blur(8px)' }}
                            >
                              <Check className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={3} />
                              <span className="leading-tight">מקובל עליי</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onTaskDecisionChange(task.id, 'rejected')}
                              className={`flex min-h-[44px] items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] sm:text-xs font-black transition active:scale-[0.98] ${
                                status === 'rejected'
                                  ? 'bg-rose-600 text-white shadow-md shadow-rose-900/15'
                                  : 'border border-rose-300/70 bg-white/45 text-rose-900 hover:bg-rose-50/90'
                              }`}
                              style={{ backdropFilter: 'blur(8px)' }}
                            >
                              <X className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={3} />
                              <span className="leading-tight">לא מקובל</span>
                            </button>
                          </div>

                          <div className="flex justify-end border-t border-white/35 px-3 py-2.5">
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
                          </div>
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
            <p className="text-xs text-gray-600 mb-4 leading-relaxed">
              אלו ההרגלים של הצעד הזה. אלמוג יתבסס עליהם בשיחות שלך.
            </p>
            <div className="flex flex-col gap-4 max-w-lg mx-auto w-full min-w-0">
              {step.habits.map((habit) => (
                <div
                  key={habit.id}
                  className="w-full rounded-[22px] p-[1px] shrink-0"
                  style={{
                    background:
                      'linear-gradient(145deg, rgba(52,211,153,0.55), rgba(167,243,208,0.35), rgba(255,255,255,0.65))',
                  }}
                >
                  <div
                    className="rounded-[21px] overflow-hidden min-h-0 h-auto"
                    style={{
                      background:
                        'linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(236,253,245,0.45) 55%, rgba(255,255,255,0.38) 100%)',
                      backdropFilter: 'blur(22px) saturate(1.25)',
                      WebkitBackdropFilter: 'blur(22px) saturate(1.25)',
                      boxShadow:
                        '0 16px 40px rgba(6,78,59,0.09), inset 0 1px 1px rgba(255,255,255,0.85), inset 0 -1px 0 rgba(255,255,255,0.25)',
                      border: '1px solid rgba(255,255,255,0.55)',
                    }}
                  >
                    <div className="flex flex-row-reverse items-start gap-3 px-4 pt-4 pb-3">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl shadow-inner"
                        style={{
                          background: 'rgba(255,255,255,0.65)',
                          border: '1px solid rgba(255,255,255,0.85)',
                          boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.95)',
                        }}
                        aria-hidden
                      >
                        {habit.emoji}
                      </div>
                      <div className="min-w-0 flex-1 text-right space-y-2">
                        <p
                          className="font-black text-[15px] leading-snug text-[#1A1730] [overflow-wrap:anywhere] break-words"
                        >
                          {habit.title}
                        </p>
                        {habit.description ? (
                          <p className="text-[12px] sm:text-[13px] text-gray-600 leading-relaxed [overflow-wrap:anywhere] break-words border-t border-emerald-900/[0.07] pt-2">
                            {habit.description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="px-4 pb-4 pt-0 flex justify-start">
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
            <div className="space-y-3 max-w-lg mx-auto w-full min-w-0">
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
      className="rounded-[18px] overflow-hidden border border-white/55 shadow-md shadow-emerald-950/5"
      style={{
        background:
          'linear-gradient(165deg, rgba(255,255,255,0.52) 0%, rgba(239,246,255,0.42) 40%, rgba(255,255,255,0.38) 100%)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
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
