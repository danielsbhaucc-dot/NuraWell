'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { HelpCircle, Sparkles } from 'lucide-react';
import { NuraWellLogo } from '@/components/shared/NuraWellLogo';
import { RegisterStartModal } from './RegisterStartModal';
import { RegisterHowItWorksModal } from './RegisterHowItWorksModal';
import { MentorBubble } from './MentorBubble';

export function RegisterLandingClient() {
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  useEffect(() => {
    void fetch('/api/v1/register-background')
      .then((r) => r.json())
      .then((d: { url?: string | null; has_custom?: boolean }) => {
        if (d.has_custom && d.url) setBgUrl(d.url);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <main
        id="main-content"
        className="relative min-h-[100dvh] flex flex-col overflow-hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {bgUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bgUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-105"
              fetchPriority="high"
            />
            <motion.div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/65 to-emerald-950/85" aria-hidden />
          </>
        ) : (
          <div className="absolute inset-0 bg-mesh" aria-hidden />
        )}

        <div className="relative z-10 flex flex-col flex-1 px-4 py-8 max-w-lg mx-auto w-full">
          <header className="flex justify-center mb-6">
            <NuraWellLogo size="md" />
          </header>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card-dark rounded-3xl p-5 sm:p-6 mb-5 border border-white/15"
          >
            <h1
              className="text-2xl sm:text-3xl font-black text-center leading-tight mb-3"
              style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}
            >
              <span className="text-gradient bg-gradient-to-l from-emerald-300 via-teal-200 to-amber-200 bg-clip-text text-transparent">
                ברוכים הבאים ל־
              </span>
              <br />
              <span className="text-white">NuraWell.ai</span>
            </h1>

            <MentorBubble mentorId="dolev">
              <p>
                היי, אני <strong className="text-emerald-300">דולב</strong> — המנטור שילווה אתכם בהתחלה.{' '}
                <em>Nura</em> זה &quot;אור&quot; בשפה עתיקה. <em>Well</em> — להרגיש טוב, לא לספור קלוריות.
              </p>
              <p className="mt-2 text-white/85 text-sm">
                ביחד: <strong>האור שיוביל אתכם לחיים טובים יותר</strong> ✨ — ליווי אישי, בעברית, בלי אפליקציה קרה.
              </p>
            </MentorBubble>
          </motion.div>

          <div className="mt-auto space-y-3 pb-4">
            <button
              type="button"
              onClick={() => setStartOpen(true)}
              className="w-full min-h-[52px] rounded-2xl font-black text-lg text-white flex items-center justify-center gap-2 shadow-[0_12px_40px_rgba(16,185,129,0.45)] bg-gradient-to-l from-emerald-600 via-emerald-500 to-teal-400 hover:brightness-110 active:scale-[0.98] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
            >
              <Sparkles className="w-5 h-5" aria-hidden />
              בואו נתחיל
            </button>

            <button
              type="button"
              onClick={() => setHowOpen(true)}
              className="w-full min-h-[48px] rounded-2xl font-bold text-white/90 flex items-center justify-center gap-2 border border-white/25 bg-white/10 backdrop-blur-xl hover:bg-white/15 transition-all"
            >
              <HelpCircle className="w-5 h-5" aria-hidden />
              איך זה עובד?
            </button>

            <p className="text-center text-sm text-white/60 pt-1">
              כבר רשומים?{' '}
              <Link href="/login" className="text-emerald-300 font-bold hover:underline">
                כניסה
              </Link>
            </p>
          </div>
        </div>
      </main>

      <RegisterStartModal open={startOpen} onClose={() => setStartOpen(false)} />
      <RegisterHowItWorksModal open={howOpen} onClose={() => setHowOpen(false)} />
    </>
  );
}
