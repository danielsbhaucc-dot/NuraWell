'use client';

import { useEffect, useState } from 'react';
import { AlmogInstantFeedback } from './AlmogInstantFeedback';

type Props = {
  isCorrect: boolean;
  tone?: 'quiz' | 'game';
  interactionType: 'quiz' | 'game' | 'commitment';
  score?: number;
  stepId?: string;
  lessonId?: string;
  commitmentText?: string;
  fallback: React.ReactNode;
};

/**
 * משוב אלמוג בשיעור — LLM כשאפשר, fallback סטטי.
 */
export function AlmogLessonFeedback({
  isCorrect,
  tone = 'quiz',
  interactionType,
  score,
  stepId,
  lessonId,
  commitmentText,
  fallback,
}: Props) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const body: Record<string, unknown> = {
          interaction_type: interactionType,
          is_correct: isCorrect,
          score: score ?? (isCorrect ? 85 : 45),
          step_id: stepId,
          lesson_id: lessonId,
        };
        if (interactionType === 'commitment' && commitmentText) {
          body.commitment_text = commitmentText.slice(0, 500);
        }
        const res = await fetch('/api/v1/ai/lesson-feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('feedback_failed');
        const data = (await res.json()) as { reply?: string; feedback?: string };
        const line = (data.reply ?? data.feedback)?.trim();
        if (!cancelled && line) {
          setText(line);
        }
      } catch {
        /* fallback */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [isCorrect, interactionType, score, stepId, lessonId, commitmentText]);

  return (
    <AlmogInstantFeedback isCorrect={isCorrect} tone={tone}>
      <p className="text-sm leading-relaxed text-gray-800">{text ?? fallback}</p>
    </AlmogInstantFeedback>
  );
}
