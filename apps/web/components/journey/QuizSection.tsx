'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, ArrowLeft, HelpCircle, Sparkles, ClipboardList, RotateCcw } from 'lucide-react';
import type { QuizQuestion } from '../../lib/types/journey';

interface QuizSectionProps {
  questions: QuizQuestion[];
  existingAnswers: Record<string, number>;
  onComplete: (answers: Record<string, number>, score: number) => void;
  onResetQuiz?: () => void;
}

export function QuizSection({ questions, existingAnswers, onComplete, onResetQuiz }: QuizSectionProps) {
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>(existingAnswers);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isComplete, setIsComplete] = useState(Object.keys(existingAnswers).length === questions.length);
  const [resultsOpen, setResultsOpen] = useState(false);

  const question = questions[currentQ];
  const isAnswered = selectedOption !== null || answers[question?.id] !== undefined;
  const currentAnswer = selectedOption ?? answers[question?.id];
  const isCorrect = currentAnswer === question?.correct_index;

  const score = questions.reduce((acc, q) => acc + (answers[q.id] === q.correct_index ? 1 : 0), 0);

  const handleSelect = (index: number) => {
    if (isAnswered) return;
    setSelectedOption(index);
    setShowExplanation(true);
    const newAnswers = { ...answers, [question.id]: index };
    setAnswers(newAnswers);
  };

  const handleNext = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
      setSelectedOption(null);
      setShowExplanation(false);
    } else {
      setIsComplete(true);
    }
  };

  if (isComplete) {
    return (
      <div className="text-center py-8">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-5"
          style={{ background: 'rgba(16,185,129,0.12)', border: '2px solid rgba(16,185,129,0.3)' }}>
          <Sparkles className="w-10 h-10 text-emerald-600" />
        </motion.div>
        <h2 className="text-2xl font-black mb-2" style={{ color: '#1A1730' }}>כל הכבוד! 🎉</h2>
        <p className="text-gray-500 text-lg mb-2">
          ענית נכון על <strong className="text-emerald-600">{score}</strong> מתוך <strong>{questions.length}</strong> שאלות
        </p>
        <div className="mt-4 flex justify-center gap-2 flex-wrap">
          {questions.map((q, i) => (
            <div key={q.id} className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
              style={{
                background: answers[q.id] === q.correct_index ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.1)',
                color: answers[q.id] === q.correct_index ? '#059669' : '#dc2626',
                border: `1.5px solid ${answers[q.id] === q.correct_index ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.2)'}`,
              }}>
              {i + 1}
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-3 max-w-sm mx-auto">
          <button
            type="button"
            onClick={() => setResultsOpen(true)}
            className="w-full py-3.5 rounded-2xl font-bold text-emerald-800 flex items-center justify-center gap-2"
            style={{ background: 'rgba(16,185,129,0.12)', border: '1.5px solid rgba(16,185,129,0.28)' }}
          >
            <ClipboardList className="w-5 h-5" />
            <span>מפת התשובות שלי</span>
          </button>
          {onResetQuiz && (
            <button
              type="button"
              onClick={onResetQuiz}
              className="w-full py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 text-gray-600"
              style={{ background: 'rgba(0,0,0,0.04)', border: '1.5px solid rgba(0,0,0,0.08)' }}
            >
              <RotateCcw className="w-4 h-4" />
              <span>לעשות את החידון מחדש</span>
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
                transition={{ type: 'spring', damping: 28 }}
                className="w-full sm:max-w-md max-h-[85vh] overflow-hidden rounded-t-3xl sm:rounded-3xl flex flex-col"
                style={{
                  background: '#fff',
                  boxShadow: '0 -8px 40px rgba(0,0,0,0.12)',
                  border: '1px solid rgba(16,185,129,0.15)',
                }}
                onClick={e => e.stopPropagation()}
              >
                <div className="px-5 py-4 text-center shrink-0" style={{ background: 'linear-gradient(145deg, #047857, #10b981)' }}>
                  <p className="text-white font-black text-lg">מפת התשובות</p>
                  <p className="text-white/85 text-xs mt-1">מה ענית בכל שאלה</p>
                </div>
                <div className="overflow-y-auto p-4 space-y-3 text-right">
                  {questions.map((q, i) => {
                    const picked = answers[q.id];
                    const ok = picked === q.correct_index;
                    return (
                      <div key={q.id} className="rounded-2xl p-4" style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)' }}>
                        <p className="text-xs font-bold text-emerald-700 mb-1">שאלה {i + 1}</p>
                        <p className="text-sm font-bold mb-2" style={{ color: '#1A1730' }}>{q.question}</p>
                        <p className="text-xs text-gray-500 mb-1">
                          תשובתך: <strong style={{ color: ok ? '#059669' : '#dc2626' }}>{picked !== undefined ? q.options[picked] : '—'}</strong>
                        </p>
                        {!ok && (
                          <p className="text-xs text-gray-500 mb-1">
                            נכון: <strong className="text-emerald-700">{q.options[q.correct_index]}</strong>
                          </p>
                        )}
                        <p className="text-xs text-gray-600 leading-relaxed mt-2 border-t border-gray-100 pt-2">{q.explanation}</p>
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

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-3"
          style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <HelpCircle className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-bold text-emerald-700">שאלות הבנה</span>
        </div>
        <p className="text-sm text-gray-500">שאלה {currentQ + 1} מתוך {questions.length}</p>
      </div>

      <div className="flex justify-center gap-2">
        {questions.map((_, i) => (
          <div key={i} className="w-2.5 h-2.5 rounded-full transition-all"
            style={{
              background: i < currentQ ? '#10b981' : i === currentQ ? '#047857' : '#d1d5db',
              transform: i === currentQ ? 'scale(1.3)' : 'scale(1)',
            }} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentQ}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}
        >
          <div className="px-5 py-4" style={{ background: 'linear-gradient(145deg, #047857, #059669, #10b981)' }}>
            <h3 className="text-lg font-black leading-snug text-white">
              {question.question}
            </h3>
          </div>

          <div className="p-5 bg-white">
            <div className="space-y-2.5">
              {question.options.map((option, i) => {
                const isSelected = currentAnswer === i;
                const isCorrectAnswer = i === question.correct_index;
                const showResult = showExplanation;

                return (
                  <motion.button
                    key={i}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelect(i)}
                    disabled={isAnswered}
                    className="w-full text-right p-4 rounded-xl font-medium text-[15px] transition-all flex items-center gap-3"
                    style={{
                      background: showResult && isCorrectAnswer
                        ? 'rgba(16,185,129,0.1)'
                        : showResult && isSelected && !isCorrectAnswer
                          ? 'rgba(239,68,68,0.08)'
                          : isSelected
                            ? 'rgba(16,185,129,0.06)'
                            : 'rgba(0,0,0,0.02)',
                      border: showResult && isCorrectAnswer
                        ? '1.5px solid rgba(16,185,129,0.5)'
                        : showResult && isSelected && !isCorrectAnswer
                          ? '1.5px solid rgba(239,68,68,0.3)'
                          : '1.5px solid rgba(0,0,0,0.06)',
                      color: '#1A1730',
                    }}
                  >
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{
                        background: showResult && isCorrectAnswer ? '#10b981' : showResult && isSelected ? '#ef4444' : 'rgba(0,0,0,0.06)',
                        color: (showResult && (isCorrectAnswer || isSelected)) ? '#fff' : '#6b7280',
                      }}>
                      {showResult && isCorrectAnswer ? <CheckCircle2 className="w-4 h-4" /> :
                       showResult && isSelected ? <XCircle className="w-4 h-4" /> :
                       String.fromCharCode(1488 + i)}
                    </span>
                    <span className="flex-1">{option}</span>
                  </motion.button>
                );
              })}
            </div>

            <AnimatePresence>
              {showExplanation && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 p-4 rounded-xl"
                  style={{
                    background: isCorrect ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
                    border: `1px solid ${isCorrect ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
                  }}>
                  <p className="text-sm font-bold mb-1" style={{ color: isCorrect ? '#059669' : '#d97706' }}>
                    {isCorrect ? '✓ תשובה נכונה!' : '✗ לא בדיוק...'}
                  </p>
                  <p className="text-sm text-gray-600 leading-relaxed">{question.explanation}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </AnimatePresence>

      {isAnswered && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleNext}
          className="w-full py-4 rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
          style={{ background: 'linear-gradient(135deg, #047857, #10b981)', boxShadow: '0 6px 20px rgba(16,185,129,0.3)' }}>
          <span>{currentQ < questions.length - 1 ? 'שאלה הבאה' : 'סיום השאלות'}</span>
          <ArrowLeft className="w-5 h-5" />
        </motion.button>
      )}
    </div>
  );
}
