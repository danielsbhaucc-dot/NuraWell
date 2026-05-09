'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { Gamepad2, ArrowLeft, ClipboardList, RotateCcw } from 'lucide-react';
import type { GameItem } from '../../lib/types/journey';
import { AIFeedbackCard } from '../ai/AIFeedbackCard';
import { AlmogInstantFeedback } from './AlmogInstantFeedback';
import { AlmogCompletionHero } from './AlmogPresence';

interface MiniGameProps {
  items: GameItem[];
  existingAnswers: Record<string, boolean>;
  onComplete: (answers: Record<string, boolean>, score: number) => void;
  onResetGame?: () => void;
  stepId?: string;
  userId?: string;
}

export function MiniGame({ items, existingAnswers, onComplete, onResetGame, stepId, userId }: MiniGameProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, boolean>>(existingAnswers);
  const [showResult, setShowResult] = useState(false);
  const [isComplete, setIsComplete] = useState(Object.keys(existingAnswers).length === items.length);
  const [resultsOpen, setResultsOpen] = useState(false);
  const sheetDragControls = useDragControls();
  const [almogNote, setAlmogNote] = useState<string | null>(null);
  const [almogLoading, setAlmogLoading] = useState(false);
  const [almogError, setAlmogError] = useState(false);
  const gameFeedbackRequestedRef = useRef(false);

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
      if (stepId && !gameFeedbackRequestedRef.current) {
        gameFeedbackRequestedRef.current = true;
        const pct = items.length > 0 ? Math.round((finalScore / items.length) * 100) : 0;
        setAlmogLoading(true);
        setAlmogError(false);
        void fetch('/api/v1/ai/lesson-feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            step_id: stepId,
            ...(userId ? { user_id: userId } : {}),
            interaction_type: 'game',
            score: pct,
            summary: `במשחק נכון/לא נכון: ${finalScore} מתוך ${items.length} נכונים`,
          }),
        })
          .then(async (res) => {
            const data = (await res.json()) as { reply?: string };
            if (res.ok && data.reply) setAlmogNote(data.reply);
            else setAlmogError(true);
          })
          .catch(() => {
            setAlmogNote(null);
            setAlmogError(true);
          })
          .finally(() => setAlmogLoading(false));
      }
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

        {stepId && (almogLoading || almogNote || almogError) && (
          <div className="mt-2 mb-2">
            <AIFeedbackCard
              loading={almogLoading}
              text={almogNote}
              error={almogError}
              variant="amber"
            />
          </div>
        )}

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

        <AnimatePresence>
          {resultsOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[180] flex items-end sm:items-center justify-center p-0 sm:p-6"
              style={{ background: 'rgba(15,23,42,0.45)' }}
              onClick={() => setResultsOpen(false)}
            >
              <motion.div
                initial={{ y: 120, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 120, opacity: 0 }}
                transition={{ type: 'spring', damping: 32, stiffness: 380 }}
                drag="y"
                dragControls={sheetDragControls}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 420 }}
                dragElastic={{ top: 0, bottom: 0.22 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 100 || info.velocity.y > 650) {
                    setResultsOpen(false);
                  }
                }}
                className="w-full sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl shadow-[0_-8px_40px_rgba(0,0,0,0.14)] border border-amber-200/50"
                onClick={e => e.stopPropagation()}
              >
                <div
                  className="shrink-0 cursor-grab touch-none select-none active:cursor-grabbing"
                  style={{ background: 'linear-gradient(160deg, #78350f 0%, #b45309 45%, #f59e0b 100%)' }}
                  onPointerDown={(e) => sheetDragControls.start(e)}
                >
                  <div className="pt-2.5 pb-2 flex justify-center">
                    <div className="w-11 h-1.5 rounded-full bg-white/45" />
                  </div>
                  <div className="px-5 pb-4 text-center">
                    <p className="text-white font-black text-lg">מפת האינטואיציה</p>
                    <p className="text-white/90 text-xs mt-1">מה סימנת מול מה שבאמת נכון</p>
                  </div>
                </div>
                <div
                  className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-white p-4 space-y-3 text-right [scrollbar-gutter:stable]"
                  style={{
                    WebkitOverflowScrolling: 'touch',
                    scrollbarWidth: 'thin',
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {items.map((it, i) => {
                    const picked = answers[it.id];
                    const ok = picked === it.is_true;
                    return (
                      <div key={it.id} className="rounded-2xl p-4"
                        style={{ background: 'linear-gradient(165deg, #ffffff 0%, #fffbeb 100%)', border: '1px solid rgba(245,158,11,0.2)', boxShadow: '0 4px 12px rgba(245,158,11,0.08)' }}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-black text-amber-800">משפט {i + 1}</p>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: ok ? 'rgba(16,185,129,0.16)' : 'rgba(239,68,68,0.12)', color: ok ? '#047857' : '#b91c1c' }}>
                            {ok ? 'פגעת בול' : 'שווה חידוד'}
                          </span>
                        </div>
                        <p className="text-sm font-bold mb-2 leading-relaxed" style={{ color: '#1A1730' }}>&ldquo;{it.statement}&rdquo;</p>
                        <p className="text-xs text-gray-600">
                          ענית: <strong style={{ color: ok ? '#059669' : '#dc2626' }}>{picked === true ? 'נכון' : picked === false ? 'לא נכון' : '—'}</strong>
                          {' · '}
                          נכון: <strong className="text-emerald-700">{it.is_true ? 'נכון' : 'לא נכון'}</strong>
                        </p>
                        <p className="text-xs text-gray-600 leading-relaxed mt-2 border-t border-gray-100 pt-2">{it.explanation}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="p-4 shrink-0 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setResultsOpen(false)}
                    className="w-full py-3.5 rounded-2xl font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}
                  >
                    סגירה
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
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
                <AlmogInstantFeedback isCorrect={isCorrect} tone="game">
                  <p className="text-sm leading-relaxed text-gray-800">{item.explanation}</p>
                </AlmogInstantFeedback>
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
