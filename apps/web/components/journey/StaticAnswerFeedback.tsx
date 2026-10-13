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
        isCorrect ? 'bg-emerald-50/90 ring-emerald-200' : 'bg-amber-50/90 ring-amber-200'
      }`}
    >
      <p
        className={`mb-1.5 flex items-center gap-1.5 text-sm font-black ${
          isCorrect ? 'text-emerald-800' : 'text-amber-800'
        }`}
      >
        {isCorrect ? (
          <CheckCircle2 className="h-4 w-4" aria-hidden />
        ) : (
          <Lightbulb className="h-4 w-4" aria-hidden />
        )}
        {isCorrect ? 'נכון, יפה מאוד!' : 'לא בדיוק — הנה ההסבר'}
      </p>
      {explanation ? <p className="text-sm leading-relaxed text-gray-800">{explanation}</p> : null}
    </div>
  );
}
