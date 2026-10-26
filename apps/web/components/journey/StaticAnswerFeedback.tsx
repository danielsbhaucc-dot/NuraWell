'use client';

import { CheckCircle2, Lightbulb } from 'lucide-react';

/** משוב קבוע לתשובה (בלי AI) — נכון/לא נכון + ההסבר מהתוכן. */
export function StaticAnswerFeedback({
  isCorrect,
  explanation,
}: {
  isCorrect: boolean;
  explanation?: string | null;
}) {
  return (
    <div
      className={`mt-3 rounded-2xl p-4 text-start ring-1 ${
        isCorrect ? 'bg-primary-50/90 ring-primary-200' : 'bg-accent-50/90 ring-accent-200'
      }`}
    >
      <p
        className={`mb-1.5 flex items-center gap-1.5 text-sm font-black ${
          isCorrect ? 'text-primary-800' : 'text-accent-800'
        }`}
      >
        {isCorrect ? (
          <CheckCircle2 className="h-4 w-4" aria-hidden />
        ) : (
          <Lightbulb className="h-4 w-4" aria-hidden />
        )}
        {isCorrect ? 'נכון, יפה מאוד!' : 'לא בדיוק — הנה ההסבר'}
      </p>
      {explanation ? <p className="text-sm leading-relaxed text-ink-800">{explanation}</p> : null}
    </div>
  );
}
