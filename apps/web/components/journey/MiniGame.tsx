'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gamepad2, ArrowLeft, ClipboardList, RotateCcw } from 'lucide-react';
import type { GameItem } from '../../lib/types/journey';
import { AlmogLessonFeedback } from './AlmogLessonFeedback';
import { AlmogCompletionHero } from './AlmogPresence';
import { JourneyResultsDrawer } from './JourneyResultsDrawer';

interface MiniGameProps {
  items: GameItem[];
  existingAnswers: Record<string, boolean>;
  onComplete: (answers: Record<string, boolean>, score: number) => void;
  onResetGame?: () => void;
  stepId?: string;
  userId?: string;
}

export function MiniGame({ items, existingAnswers, onComplete, onResetGame, stepId }: MiniGameProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, boolean>>(existingAnswers);
  const [showResult, setShowResult] = useState(false);
  const [isComplete, setIsComplete] = useState(Object.keys(existingAnswers).length === items.length);
  const [resultsOpen, setResultsOpen] = useState(false);

  const item = items[currentIdx];
  const isAnswered = showResult || answers[item?.id] !== undefined;

  const handleAnswer = (userAnswer: boolean) => {
    if (isAnswered) return;
    const newAnswers = { ...answers, [item.id]: userAnswer };
    setAnswers(newAnswers);
    setShowResult(true);
  };

  const handleNext = () => {
    if (currentIdx < items.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setShowResult(false);
    } else {
      const finalScore = items.reduce(
        (acc, it) => acc + (answers[it.id] === it.is_true ? 1 : 0),
        0
      );
      setIsComplete(true);
    }
  };

  const score = items.reduce((acc, it) => acc + ((answers[it.id] === it.is_true) ? 1 : 0), 0);

  if (isComplete) {
    return (
      <div className="text-center py-8">
        <AlmogCompletionHero />
        <h2 className="text-2xl font-black mb-2" style={{ color: '#1A1730' }}>סיימת את המשחק! 🎮</h2>
        <p className="text-gray-500 text-lg mb-4">
          <strong className="text-emerald-600">{score}</strong> מתוך <strong>{items.length}</strong> נכונים
        </p>

        <div className="mt-8 flex flex-col gap-3 max-w-sm mx-auto">
          <button
            type="button"
            onClick={() => setResultsOpen(true)}
            className="w-full py-3.5 rounded-2xl font-bold text-amber-900 flex items-center justify-center gap-2"
            style={{ background: 'rgba(245,158,11,0.15)', border: '1.5px solid rgba(245,158,11,0.35)' }}
          >
            <ClipboardList className="w-5 h-5" />
            <span>מפת האינטואיציה שלי</span>
          </button>
          {onResetGame && (
            <button
              type="button"
              onClick={onResetGame}
              className="w-full py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 text-gray-600"
              style={{ background: 'rgba(0,0,0,0.04)', border: '1.5px solid rgba(0,0,0,0.08)' }}
            >
              <RotateCcw className="w-4 h-4" />
              <span>סיבוב נוסף במשחק</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onComplete(answers, score)}
            className="w-full py-4 rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
            style={{ background: 'linear-gradient(135deg, #047857, #10b981)', boxShadow: '0 6px 20px rgba(16,185,129,0.3)' }}
          >
            <span>המשך לשלב הבא</span>
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>

        <JourneyResultsDrawer
          open={resultsOpen}
          onOpenChange={setResultsOpen}
          variant="game"
          title="מפת האינטואיציה"
          subtitle="מה סימנת מול מה שבאמת נכון"
        >
          {items.map((it, i) => {
            const picked = answers[it.id];
            const ok = picked === it.is_true;
            return (
              <div
                key={it.id}
                className="rounded-2xl p-4"
                style={{
                  background: 'linear-gradient(165deg, #ffffff 0%, #fffbeb 100%)',
                  border: '1px solid rgba(245,158,11,0.2)',
                  boxShadow: '0 4px 12px rgba(245,158,11,0.08)',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-black text-amber-800">משפט {i + 1}</p>
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: ok ? 'rgba(16,185,129,0.16)' : 'rgba(239,68,68,0.12)',
                      color: ok ? '#047857' : '#b91c1c',
                    }}
                  >
                    {ok ? 'פגעת בול' : 'שווה חידוד'}
                  </span>
                </div>
                <p className="text-sm font-bold mb-2 leading-relaxed" style={{ color: '#1A1730' }}>
                  &ldquo;{it.statement}&rdquo;
                </p>
                <p className="text-xs text-gray-600">
                  ענית:{' '}
                  <strong style={{ color: ok ? '#059669' : '#dc2626' }}>
                    {picked === true ? 'נכון' : picked === false ? 'לא נכון' : '—'}
                  </strong>
                  {' · '}
                  נכון: <strong className="text-emerald-700">{it.is_true ? 'נכון' : 'לא נכון'}</strong>
                </p>
                <p className="text-xs text-gray-600 leading-relaxed mt-2 border-t border-gray-100 pt-2">{it.explanation}</p>
              </div>
            );
          })}
        </JourneyResultsDrawer>
      </div>
    );
  }

  const userAnswer = answers[item?.id];
  const isCorrect = userAnswer === item?.is_true;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-3"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <Gamepad2 className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-bold text-amber-700">נכון או לא?</span>
        </div>
        <p className="text-sm text-gray-500">{currentIdx + 1} מתוך {items.length}</p>
      </div>

      <div className="flex justify-center gap-2">
        {items.map((_, i) => (
          <div key={i} className="w-2.5 h-2.5 rounded-full transition-all"
            style={{
              background: i < currentIdx ? '#10b981' : i === currentIdx ? '#f59e0b' : '#d1d5db',
              transform: i === currentIdx ? 'scale(1.3)' : 'scale(1)',
            }} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentIdx}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}
        >
          <div className="px-6 py-5 text-center" style={{ background: 'linear-gradient(145deg, #047857, #059669, #10b981)' }}>
            <p className="text-lg font-bold leading-relaxed text-white">
              &ldquo;{item.statement}&rdquo;
            </p>
          </div>

          <div className="p-5 bg-white">
            {!isAnswered && (
              <div className="flex gap-3 justify-center">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleAnswer(true)}
                  className="flex-1 max-w-[150px] py-4 rounded-xl font-bold text-lg transition-all"
                  style={{ background: 'rgba(16,185,129,0.08)', border: '2px solid rgba(16,185,129,0.25)', color: '#059669' }}>
                  ✓ נכון
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleAnswer(false)}
                  className="flex-1 max-w-[150px] py-4 rounded-xl font-bold text-lg transition-all"
                  style={{ background: 'rgba(239,68,68,0.06)', border: '2px solid rgba(239,68,68,0.2)', color: '#dc2626' }}>
                  ✗ לא נכון
                </motion.button>
              </div>
            )}

            {showResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4"
              >
                <AlmogLessonFeedback
                  isCorrect={isCorrect}
                  tone="game"
                  interactionType="game"
                  score={isCorrect ? 88 : 42}
                  stepId={stepId}
                  fallback={
                    <p className="text-sm leading-relaxed text-gray-800">{item.explanation}</p>
                  }
                />
              </motion.div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {showResult && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleNext}
          className="w-full py-4 rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
          style={{ background: 'linear-gradient(135deg, #047857, #10b981)', boxShadow: '0 6px 20px rgba(16,185,129,0.3)' }}>
          <span>{currentIdx < items.length - 1 ? 'הבא' : 'סיום המשחק'}</span>
          <ArrowLeft className="w-5 h-5" />
        </motion.button>
      )}
    </div>
  );
}
