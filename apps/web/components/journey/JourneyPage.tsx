'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { CheckCircle2, Lock, Play, Sparkles, Droplets } from 'lucide-react';
import type { JourneyStepWithProgress } from '../../lib/types/journey';

interface JourneyPageProps {
  steps: JourneyStepWithProgress[];
}

export function JourneyPage({ steps }: JourneyPageProps) {
  const completedCount = steps.filter(s => s.progress?.is_completed).length;
  const totalCount = steps.length;

  return (
    <div>
      {/* ═══ GREEN HERO ═══ */}
      <div className="-mt-16 pt-16 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #064e3b 0%, #047857 50%, #10b981 80%, #34d399 100%)' }}>
        <div className="absolute pointer-events-none" style={{ width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(52,211,153,0.4) 0%, transparent 70%)', top: '-20px', right: '-20px', filter: 'blur(16px)' }} />

        <div className="relative z-10" style={{ padding: '16px 20px 44px' }}>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4"
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span className="text-white text-sm font-bold">המסע שלי</span>
            </div>
            <h1 className="text-3xl font-black text-white mb-2" style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}>
              הדרך שלך לבריאות 🌿
            </h1>
            <p className="text-white/80 text-sm max-w-xs mx-auto">
              כל צעד מקרב אותך לגרסה הבריאה ביותר של עצמך
            </p>
            {totalCount > 0 && (
              <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full"
                style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}>
                <span className="text-white text-sm font-bold">{completedCount}/{totalCount} צעדים הושלמו</span>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* ═══ WHITE ROUNDED BODY ═══ */}
      <div style={{
        background: '#EDF5F0', borderRadius: '26px 26px 0 0', marginTop: '-18px',
        padding: '28px 16px 40px', position: 'relative', zIndex: 3, minHeight: '55vh',
      }}>
        {/* Section label */}
        <div className="flex items-center gap-2 mb-5 px-1">
          <div className="w-1.5 h-6 rounded-full" style={{ background: 'linear-gradient(to bottom, #6ee7b7, #047857)' }} />
          <span className="text-lg font-black" style={{ color: '#1A1730', fontFamily: "'Rubik','Heebo',sans-serif" }}>
            הצעדים שלך
          </span>
        </div>

        {/* Steps Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute right-[23px] top-0 bottom-0 w-0.5"
            style={{ background: 'linear-gradient(to bottom, #10b981, #d1fae5, transparent)' }} />

          <div className="space-y-4">
            {steps.map((step, index) => {
              const isCompleted = step.progress?.is_completed;
              const isActive = !isCompleted && (index === 0 || steps[index - 1]?.progress?.is_completed);
              const isLocked = !isCompleted && !isActive;

              return (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.08 }}
                >
                  <Link
                    href={isLocked ? '#' : `/journey/${step.step_number}`}
                    className={`block relative pr-14 ${isLocked ? 'pointer-events-none opacity-60' : ''}`}
                  >
                    {/* Timeline dot */}
                    <div className="absolute right-[12px] top-5 z-10">
                      <div className="w-[22px] h-[22px] rounded-full flex items-center justify-center"
                        style={{
                          background: isCompleted ? '#10b981' : isActive ? '#fff' : '#d1d5db',
                          border: isCompleted ? '3px solid #10b981' : isActive ? '3px solid #10b981' : '3px solid #d1d5db',
                          boxShadow: isActive ? '0 0 12px rgba(16,185,129,0.4)' : 'none',
                        }}>
                        {isCompleted && <CheckCircle2 className="w-3 h-3 text-white" />}
                        {isActive && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                        {isLocked && <Lock className="w-2.5 h-2.5 text-gray-400" />}
                      </div>
                    </div>

                    {/* Card */}
                    <div className="rounded-2xl overflow-hidden transition-all duration-200 hover:scale-[1.01] active:scale-[0.98]"
                      style={{
                        background: isActive
                          ? 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(236,253,245,0.95) 100%)'
                          : 'rgba(255,255,255,0.92)',
                        border: isActive ? '1.5px solid rgba(16,185,129,0.35)' : '1px solid rgba(255,255,255,0.8)',
                        boxShadow: isActive
                          ? '0 6px 24px rgba(16,185,129,0.15), 0 2px 8px rgba(6,78,59,0.06)'
                          : '0 2px 12px rgba(6,78,59,0.06)',
                      }}>
                      <div className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                            style={{
                              background: isCompleted ? 'rgba(16,185,129,0.12)' : isActive ? 'rgba(16,185,129,0.12)' : 'rgba(0,0,0,0.04)',
                              color: isCompleted ? '#059669' : isActive ? '#047857' : '#9ca3af',
                            }}>
                            צעד {step.step_number}
                          </span>
                          {step.duration_minutes && (
                            <span className="text-xs text-gray-400">{step.duration_minutes} דקות</span>
                          )}
                          {isCompleted && (
                            <span className="text-xs font-bold text-emerald-600 mr-auto flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> הושלם ✨
                            </span>
                          )}
                        </div>

                        <h3 className="text-[17px] font-black leading-snug mb-1.5"
                          style={{ color: '#1A1730', fontFamily: "'Rubik','Heebo',sans-serif" }}>
                          {step.title}
                        </h3>

                        {step.description && (
                          <p className="text-sm text-gray-500 leading-relaxed line-clamp-2">
                            {step.description}
                          </p>
                        )}

                        {isActive && (
                          <div className="mt-3 flex items-center gap-2">
                            <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white"
                              style={{ background: 'linear-gradient(135deg, #047857, #10b981)', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>
                              <Play className="w-3.5 h-3.5" fill="white" />
                              <span>בואו נתחיל!</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Progress bar for partially completed */}
                      {step.progress && !isCompleted && (
                        <div style={{ height: '3px', background: 'rgba(16,185,129,0.1)' }}>
                          <div style={{
                            height: '100%',
                            width: `${getSectionProgress(step.progress)}%`,
                            background: 'linear-gradient(90deg, #047857, #10b981)',
                            borderRadius: '0 4px 4px 0',
                          }} />
                        </div>
                      )}
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Empty state */}
        {steps.length === 0 && (
          <div className="text-center py-20">
            <Droplets className="w-12 h-12 text-emerald-300 mx-auto mb-4" />
            <h3 className="text-xl font-black mb-2" style={{ color: '#1A1730' }}>עוד לא התחלת את המסע</h3>
            <p className="text-sm text-gray-500">בקרוב יופיעו כאן צעדים חדשים</p>
          </div>
        )}
      </div>
    </div>
  );
}

function getSectionProgress(progress: JourneyStepWithProgress['progress']): number {
  if (!progress) return 0;
  const sections = ['video', 'quiz', 'game', 'commitment', 'summary'];
  const currentIndex = sections.indexOf(progress.last_section);
  return Math.round(((currentIndex + 1) / sections.length) * 100);
}
