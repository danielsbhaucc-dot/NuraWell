'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, CheckCircle2 } from 'lucide-react';
import type { CommitmentData } from '../../lib/types/journey';
import { commitmentCopy } from '../../lib/onboarding/gender-copy';
import { AlmogLessonFeedback } from './AlmogLessonFeedback';

interface CommitmentSectionProps {
  commitment: CommitmentData;
  isAccepted: boolean;
  onAccept: () => void;
  onChoose?: (accepted: boolean) => void;
  stepId?: string;
  userId?: string;
  /** מגדר המשתמש מהפרופיל — לפתיח "אני מתחייב/מתחייבת" מותאם */
  gender?: 'male' | 'female' | null;
}

export function CommitmentSection({
  commitment,
  isAccepted,
  onAccept,
  onChoose,
  stepId,
  gender,
}: CommitmentSectionProps) {
  const [accepted, setAccepted] = useState(isAccepted);
  const copy = commitmentCopy(gender);

  useEffect(() => {
    setAccepted(isAccepted);
  }, [isAccepted]);

  const handleAccept = () => {
    setAccepted(true);
    if (onChoose) onChoose(true);
    else onAccept();
  };

  const handleContinueWithoutCommitment = () => {
    setAccepted(false);
    if (onChoose) onChoose(false);
  };

  const handleUndoCommitment = () => {
    setAccepted(false);
  };

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
          בואו נדבר על ההתחייבות 💪
        </h2>
        <p className="text-sm text-amber-900/75 mt-2 max-w-xs mx-auto font-medium leading-relaxed">
          אני יודע שזה לא תמיד קל — אבל התחייבות קטנה וברורה יכולה לשנות הכל.
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
          <p className="text-sm font-bold text-white/85 mb-1">{copy.prefix}:</p>
          <p className="text-lg font-black leading-relaxed text-white">{commitment.text}</p>
        </div>
        <div className="p-6 bg-white text-center">
          <p className="text-sm text-gray-500 leading-relaxed mb-6">{commitment.description}</p>

          {accepted ? (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="space-y-3"
            >
              <motion.div
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl"
                style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)' }}
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="text-emerald-700 font-bold">קיבלת על עצמך! 🌟</span>
              </motion.div>
              <AlmogLessonFeedback
                isCorrect
                tone="quiz"
                interactionType="commitment"
                commitmentText={commitment.text}
                stepId={stepId}
                fallback={
                  <span className="text-sm text-gray-600">
                    התחייבות חזקה — צעד קטן היום מספיק לנעוץ את זה.
                  </span>
                }
              />
            </motion.div>
          ) : (
            <motion.div className="space-y-3">
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
                <span>{copy.button}</span>
              </button>
              <button
                type="button"
                onClick={handleContinueWithoutCommitment}
                className="w-full py-3 rounded-xl text-sm text-gray-500 hover:text-gray-700 transition-colors"
                style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)' }}
              >
                להמשיך בלי התחייבות כרגע
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>

      {accepted && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex justify-center"
        >
          <button
            type="button"
            onClick={handleUndoCommitment}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors underline underline-offset-2"
          >
            התחרטתי — בטל/י התחייבות
          </button>
        </motion.div>
      )}
    </div>
  );
}
