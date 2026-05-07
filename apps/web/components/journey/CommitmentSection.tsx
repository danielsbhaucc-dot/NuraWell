'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, CheckCircle2, ArrowLeft, Sparkles } from 'lucide-react';
import type { CommitmentData } from '../../lib/types/journey';
import { AIFeedbackCard } from '../ai/AIFeedbackCard';

interface CommitmentSectionProps {
  commitment: CommitmentData;
  isAccepted: boolean;
  onAccept: () => void;
  onChoose?: (accepted: boolean) => void;
  stepId?: string;
  userId?: string;
}

export function CommitmentSection({
  commitment,
  isAccepted,
  onAccept,
  onChoose,
  stepId,
  userId,
}: CommitmentSectionProps) {
  const [accepted, setAccepted] = useState(isAccepted);
  const [feedbackFlow, setFeedbackFlow] = useState(false);
  const [almogLoading, setAlmogLoading] = useState(false);
  const [almogText, setAlmogText] = useState<string | null>(null);
  const [almogError, setAlmogError] = useState(false);
  const pendingChoiceRef = useRef<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setAccepted(isAccepted);
  }, [isAccepted]);

  const runLessonFeedback = async (acceptedChoice: boolean) => {
    if (!stepId) return;
    setAlmogLoading(true);
    setAlmogText(null);
    setAlmogError(false);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch('/api/v1/ai/lesson-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ac.signal,
        body: JSON.stringify({
          step_id: stepId,
          ...(userId ? { user_id: userId } : {}),
          interaction_type: 'commitment',
          commitment_text: acceptedChoice ? commitment.text : undefined,
          summary: acceptedChoice ? undefined : 'אני ממשיך בלי התחייבות כרגע',
        }),
      });
      const data = (await res.json()) as { reply?: string };
      if (res.ok && data.reply) setAlmogText(data.reply);
      else setAlmogError(true);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setAlmogError(true);
    } finally {
      setAlmogLoading(false);
      abortRef.current = null;
    }
  };

  const handleAccept = () => {
    setAccepted(true);
    if (!stepId) {
      if (onChoose) onChoose(true);
      else onAccept();
      return;
    }
    pendingChoiceRef.current = true;
    setFeedbackFlow(true);
    void runLessonFeedback(true);
  };

  const handleContinueWithoutCommitment = () => {
    setAccepted(false);
    if (!stepId) {
      if (onChoose) onChoose(false);
      return;
    }
    pendingChoiceRef.current = false;
    setFeedbackFlow(true);
    void runLessonFeedback(false);
  };

  const handleContinueAfterAlmog = () => {
    const c = pendingChoiceRef.current;
    if (c === true) {
      if (onChoose) onChoose(true);
      else onAccept();
    } else if (c === false && onChoose) {
      onChoose(false);
    }
  };

  const handleUndoCommitment = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setFeedbackFlow(false);
    setAlmogLoading(false);
    setAlmogText(null);
    setAlmogError(false);
    setAccepted(false);
    pendingChoiceRef.current = null;
  };

  const showChoiceButtons = !feedbackFlow;
  const showAlmogCard = feedbackFlow && !!stepId;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-3"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}
        >
          <Heart className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-bold text-amber-700">התחייבות</span>
        </div>
        <h2 className="text-2xl font-black" style={{ color: '#1A1730', fontFamily: "'Rubik','Heebo',sans-serif" }}>
          הגיע הזמן להתחייב 💪
        </h2>
        <p className="text-sm text-gray-500 mt-2 max-w-xs mx-auto">
          מחקרים מראים שהתחייבות מפורשת מגבירה את הסיכוי ליצור הרגל חדש פי 3
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl overflow-hidden"
        style={{
          border: accepted ? '2px solid rgba(16,185,129,0.3)' : '1px solid rgba(0,0,0,0.06)',
          boxShadow: accepted ? '0 4px 20px rgba(16,185,129,0.1)' : '0 4px 20px rgba(0,0,0,0.06)',
        }}
      >
        <div
          className="px-6 py-5 text-center"
          style={{ background: 'linear-gradient(145deg, #047857, #059669, #10b981)' }}
        >
          <div className="text-5xl mb-3">{commitment.emoji}</div>
          <p className="text-lg font-black leading-relaxed text-white">{commitment.text}</p>
        </div>
        <div className="p-6 bg-white text-center">
          <p className="text-sm text-gray-500 leading-relaxed mb-6">{commitment.description}</p>

          {feedbackFlow && !accepted && (
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">מחכים למילה קצרה מאלמוג לפני שממשיכים.</p>
          )}

          {showChoiceButtons && accepted ? (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="space-y-3"
            >
              <div
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl"
                style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)' }}
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="text-emerald-700 font-bold">קיבלת על עצמך! 🌟</span>
              </div>
              <div className="flex items-center justify-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="text-sm text-gray-500">אתה יכול לעשות את זה!</span>
                <Sparkles className="w-4 h-4 text-amber-500" />
              </div>
            </motion.div>
          ) : null}

          {showChoiceButtons && !accepted ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleAccept}
                className="w-full py-4 rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #047857, #10b981)',
                  boxShadow: '0 6px 20px rgba(16,185,129,0.3)',
                }}
              >
                <Heart className="w-5 h-5" fill="white" />
                <span>אני מתחייב/ת וממשיך/ה</span>
              </button>
              <button
                type="button"
                onClick={handleContinueWithoutCommitment}
                className="w-full py-3 rounded-xl text-sm text-gray-500 hover:text-gray-700 transition-colors"
                style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)' }}
              >
                להמשיך בלי התחייבות כרגע
              </button>
            </div>
          ) : null}

          {feedbackFlow && accepted && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="space-y-3"
            >
              <div
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl"
                style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)' }}
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="text-emerald-700 font-bold">קיבלת על עצמך! 🌟</span>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      {showAlmogCard && (
        <AIFeedbackCard
          loading={almogLoading}
          text={almogText}
          error={almogError}
          variant="amber"
          action={
            !almogLoading ? (
              <button
                type="button"
                onClick={handleContinueAfterAlmog}
                className="w-full py-3.5 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: 'linear-gradient(135deg, #047857, #10b981)',
                  boxShadow: '0 6px 20px rgba(16,185,129,0.28)',
                }}
              >
                <span>המשך לשלב הבא</span>
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : null
          }
        />
      )}

      {(accepted || feedbackFlow) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex justify-center"
        >
          <button
            type="button"
            onClick={handleUndoCommitment}
            disabled={almogLoading}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors underline underline-offset-2 disabled:opacity-40"
          >
            התחרטתי — בטל/י התחייבות
          </button>
        </motion.div>
      )}
    </div>
  );
}
