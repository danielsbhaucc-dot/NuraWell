'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, CheckCircle2, ArrowLeft, Sparkles } from 'lucide-react';
import type { CommitmentData } from '../../lib/types/journey';

interface CommitmentSectionProps {
  commitment: CommitmentData;
  isAccepted: boolean;
  onAccept: () => void;
}

export function CommitmentSection({ commitment, isAccepted, onAccept }: CommitmentSectionProps) {
  const [accepted, setAccepted] = useState(isAccepted);

  const handleAccept = () => {
    setAccepted(true);
    onAccept();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-3"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
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

      {/* Commitment card — green header + white body */}
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
        {/* Green gradient header */}
        <div className="px-6 py-5 text-center" style={{ background: 'linear-gradient(145deg, #047857, #059669, #10b981)' }}>
          <div className="text-5xl mb-3">{commitment.emoji}</div>
          <p className="text-lg font-black leading-relaxed text-white">
            {commitment.text}
          </p>
        </div>
        {/* White body */}
        <div className="p-6 bg-white text-center">
        <p className="text-sm text-gray-500 leading-relaxed mb-6">
          {commitment.description}
        </p>

        {accepted ? (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="space-y-3"
          >
            <div className="inline-flex items-center gap-2 px-6 py-3 rounded-xl"
              style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)' }}>
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span className="text-emerald-700 font-bold">קיבלת על עצמך! 🌟</span>
            </div>
            <div className="flex items-center justify-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-gray-500">אתה יכול לעשות את זה!</span>
              <Sparkles className="w-4 h-4 text-amber-500" />
            </div>
          </motion.div>
        ) : (
          <div className="space-y-3">
            <button onClick={handleAccept}
              className="w-full py-4 rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
              style={{ background: 'linear-gradient(135deg, #047857, #10b981)', boxShadow: '0 6px 20px rgba(16,185,129,0.3)' }}>
              <Heart className="w-5 h-5" fill="white" />
              <span>אני מתחייב/ת!</span>
            </button>
            <button onClick={handleAccept}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
              אולי בפעם הבאה →
            </button>
          </div>
        )}
        </div>{/* end white body */}
      </motion.div>

      {/* Auto-continue for accepted */}
      {accepted && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <p className="text-center text-sm text-gray-400">ממשיכים אוטומטית לסיכום...</p>
        </motion.div>
      )}
    </div>
  );
}
