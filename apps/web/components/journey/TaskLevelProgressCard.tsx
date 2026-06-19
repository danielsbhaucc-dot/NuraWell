'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowUp, Check, Flame, Target } from 'lucide-react';
import type { TaskLevelProgressSnapshot } from '../../lib/journey/task-level-progress';
import type { TaskDifficultyFeedback } from '../../lib/types/journey';

type TaskLevelProgressCardProps = {
  taskTitle: string;
  emoji: string;
  stepId: string;
  snapshot: TaskLevelProgressSnapshot;
  levels?: Array<{ id: string; label: string; order: number; is_recommended?: boolean }>;
  onFeedback?: (feedback: TaskDifficultyFeedback) => void;
};

export function TaskLevelProgressCard({
  taskTitle,
  emoji,
  stepId,
  snapshot,
  levels = [],
  onFeedback,
}: TaskLevelProgressCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const [localMsg, setLocalMsg] = useState<string | null>(null);
  const [recoveryPlanId, setRecoveryPlanId] = useState<string | null>(null);

  const sortedLevels = [...levels].sort((a, b) => a.order - b.order);
  const maxOrder = sortedLevels.length ? Math.max(...sortedLevels.map((l) => l.order)) : 1;

  const handleFeedback = async (feedback: TaskDifficultyFeedback) => {
    if (submitting) return;
    setSubmitting(true);
    setLocalMsg(null);
    try {
      const res = await fetch('/api/v1/task-level-feedback', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step_id: stepId,
          task_id: snapshot.taskId,
          feedback,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        recovery_plan?: { assignment_id?: string };
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'שגיאה');
      }
      if (feedback === 'too_hard' && data.recovery_plan?.assignment_id) {
        setRecoveryPlanId(data.recovery_plan.assignment_id);
      }
      setLocalMsg(
        feedback === 'too_easy'
          ? 'תודה! נזכור שזה קל לך.'
          : feedback === 'too_hard'
            ? data.recovery_plan?.assignment_id
              ? 'הכנתי לך צעד מותאם ב"התוכנית שלי".'
              : 'תודה! נתאים את הרמה.'
            : 'מעולה, נמשיך ברמה הזו.'
      );
      onFeedback?.(feedback);
    } catch (e) {
      setLocalMsg(e instanceof Error ? e.message : 'שגיאה בשליחה');
    } finally {
      setSubmitting(false);
    }
  };

  if (!snapshot.hasLeveling) return null;

  return (
    <div
      dir="rtl"
      className="rounded-2xl px-3 py-3 space-y-3"
      style={{
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(255,247,237,0.65) 100%)',
        border: '1px solid rgba(249,115,22,0.25)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85)',
      }}
    >
      <div className="flex items-start gap-2">
        <span className="text-2xl shrink-0">{emoji}</span>
        <div className="flex-1 text-right">
          <p className="text-sm font-black text-[#1A1730]">{taskTitle}</p>
          <p className="text-[11px] text-orange-900/75 font-semibold mt-0.5">
            רמה נוכחית: {snapshot.currentLevelLabel ?? '—'}
            {snapshot.recommendedLevelLabel ? (
              <> · יעד: {snapshot.recommendedLevelLabel}</>
            ) : null}
          </p>
        </div>
      </div>

      {/* סולם רמות */}
      {sortedLevels.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-orange-900/70 text-right">סולם קושי</p>
          <div className="relative h-2 rounded-full bg-orange-100/80 overflow-hidden">
            {sortedLevels.map((lvl) => {
              const pct = maxOrder > 0 ? ((lvl.order + 1) / (maxOrder + 1)) * 100 : 50;
              const isCurrent = lvl.id === snapshot.currentLevelId;
              const isTarget = lvl.id === snapshot.recommendedLevelId;
              return (
                <span
                  key={lvl.id}
                  className="absolute top-0 bottom-0 w-1 rounded-full"
                  style={{
                    right: `${100 - pct}%`,
                    background: isCurrent
                      ? '#ea580c'
                      : isTarget
                        ? '#059669'
                        : 'rgba(249,115,22,0.35)',
                    boxShadow: isCurrent ? '0 0 6px rgba(234,88,12,0.6)' : undefined,
                  }}
                  title={lvl.label}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1 justify-end">
            {sortedLevels.map((lvl) => (
              <span
                key={lvl.id}
                className="text-[9px] px-1.5 py-0.5 rounded-md font-semibold"
                style={{
                  background:
                    lvl.id === snapshot.currentLevelId
                      ? 'rgba(234,88,12,0.2)'
                      : lvl.is_recommended
                        ? 'rgba(16,185,129,0.15)'
                        : 'rgba(0,0,0,0.05)',
                  color: lvl.id === snapshot.currentLevelId ? '#9a3412' : '#374151',
                }}
              >
                {lvl.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 text-[11px] font-bold text-orange-950/85 justify-end">
        <span className="inline-flex items-center gap-1">
          <Flame className="w-3.5 h-3.5 text-orange-600" />
          {snapshot.habitStreakAnyLevel} ימים ברצף
        </span>
        <span className="inline-flex items-center gap-1">
          <Target className="w-3.5 h-3.5 text-emerald-600" />
          {snapshot.habitStreakRecommendedLevel} ימים ביעד
        </span>
        {snapshot.daysUntilLevelUpSuggestion > 0 ? (
          <span className="text-orange-800/70">
            עוד {snapshot.daysUntilLevelUpSuggestion} ימים להצעת עלייה
          </span>
        ) : snapshot.shouldSuggestLevelUp ? (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <ArrowUp className="w-3.5 h-3.5" />
            מוכן/ה לרמה הבאה?
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 justify-end">
        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleFeedback('too_hard')}
          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-red-50 text-red-800 border border-red-200/80 disabled:opacity-50"
        >
          קשה לי
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleFeedback('ok')}
          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-white/80 text-gray-800 border border-gray-200 disabled:opacity-50"
        >
          מתאים לי
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleFeedback('too_easy')}
          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/80 disabled:opacity-50"
        >
          קל לי
        </button>
      </div>

      {localMsg ? (
        <p className="text-[10px] font-semibold text-emerald-800 text-right flex items-center justify-end gap-1">
          <Check className="w-3 h-3" />
          {localMsg}
        </p>
      ) : null}
      {recoveryPlanId ? (
        <div className="flex justify-end">
          <Link
            href="/plans"
            className="text-[11px] font-bold text-emerald-700 underline underline-offset-2"
          >
            לצעד המותאם בהתוכנית שלי →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
