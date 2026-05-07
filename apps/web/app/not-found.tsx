'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Home, Search, Leaf, Sparkles } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-mesh">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full text-center"
      >
        {/* 404 Illustration */}
        <div className="relative mb-8">
          <div className="text-8xl font-black mb-4 text-gradient">404</div>
          <motion.div
            animate={{ rotate: [0, -10, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute -top-4 -right-4 text-4xl"
          >
            🍃
          </motion.div>
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
            className="absolute -bottom-2 -left-4 text-3xl"
          >
            🌿
          </motion.div>
        </div>

        {/* Message Card */}
        <div className="rounded-2xl overflow-hidden mb-8" style={{ border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          {/* Green header */}
          <div className="px-6 py-5" style={{ background: 'linear-gradient(145deg, #047857, #059669, #10b981)' }}>
            <h1 className="text-2xl font-black text-white">
              אופס! הדף לא נמצא 🌱
            </h1>
          </div>
          {/* White body */}
          <div className="p-6 bg-white">
            <p className="text-gray-600 text-lg leading-relaxed mb-4">
              נראה שטיילתם קצת רחוק מדי בדרך לבריאות...
            </p>
            <p className="text-gray-500 text-sm">
              הדף שחיפשתם לא קיים או שהועבר למקום אחר
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Link
            href="/courses"
            className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-bold text-lg text-white transition-all hover:scale-[1.02] active:scale-95"
            style={{ background: 'linear-gradient(135deg, #047857, #10b981)', boxShadow: '0 6px 20px rgba(16,185,129,0.25)' }}
          >
            <Home className="w-5 h-5" />
            <span>חזרה לקורסים</span>
          </Link>

          <div className="flex gap-3">
            <button
              onClick={() => window.history.back()}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all hover:scale-[1.01] active:scale-95"
              style={{ background: 'rgba(0,0,0,0.03)', border: '1.5px solid rgba(0,0,0,0.08)', color: '#4b5563' }}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>חזור אחורה</span>
            </button>

            <Link
              href="/journey"
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all hover:scale-[1.01] active:scale-95"
              style={{ background: 'rgba(0,0,0,0.03)', border: '1.5px solid rgba(0,0,0,0.08)', color: '#4b5563' }}
            >
              <Sparkles className="w-4 h-4" />
              <span>המסע שלי</span>
            </Link>
          </div>
        </div>

        {/* Fun fact */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-10 p-4 rounded-2xl"
          style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}
        >
          <div className="flex items-center justify-center gap-2 text-emerald-700 text-sm font-bold mb-2">
            <Leaf className="w-4 h-4" />
            <span>הידעת?</span>
          </div>
          <p className="text-gray-600 text-sm">
            צמחים גדלים בכיוון האור — גם כשיש נסיגה קטנה, הם תמיד ממשיכים למעלה! 🌱
          </p>
        </motion.div>
      </motion.div>
    </main>
  );
}
