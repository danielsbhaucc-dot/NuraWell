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

  const hasPhotoBg = Boolean(bgUrl);

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
        className={[
          'relative flex flex-col overflow-hidden',
          hasPhotoBg ? 'min-h-[100dvh]' : 'onboarding-shell-light min-h-[100dvh]',
        ].join(' ')}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {hasPhotoBg ? (
          <>
            <div className="onboarding-photo-bg" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bgUrl!} alt="" fetchPriority="high" />
            </div>
            <div className="onboarding-photo-overlay" aria-hidden />
          </>
        ) : null}

        <div className="relative z-10 flex flex-col flex-1 px-4 py-8 max-w-lg mx-auto w-full">
          <header className="flex justify-center mb-6">
            <NuraWellLogo size="md" />
          </header>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={[
              'rounded-3xl p-5 sm:p-6 mb-5',
              hasPhotoBg
                ? 'onboarding-hero-card-photo shadow-[0_16px_48px_rgba(0,0,0,0.28)]'
                : 'glass-card-strong shadow-[0_8px_32px_rgba(4,120,87,0.12)]',
            ].join(' ')}
          >
            <h1
              className="text-2xl sm:text-3xl font-black text-center leading-tight mb-4"
              style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}
            >
              <span
                className={
                  hasPhotoBg
                    ? 'bg-gradient-to-l from-emerald-300 via-teal-200 to-amber-200 bg-clip-text text-transparent'
                    : 'bg-gradient-to-l from-emerald-700 via-emerald-600 to-teal-600 bg-clip-text text-transparent'
                }
              >
                ברוכים הבאים ל־
              </span>
              <span className="onboarding-wave-hand mr-1.5" aria-hidden>
                👋
              </span>
              <br />
              <span
                className={
                  hasPhotoBg
                    ? 'bg-gradient-to-l from-emerald-200 via-teal-100 to-amber-100 bg-clip-text text-transparent'
                    : 'bg-gradient-to-l from-emerald-800 via-emerald-700 to-teal-700 bg-clip-text text-transparent'
                }
              >
                NuraWell.ai
              </span>
            </h1>

            <MentorBubble mentorId="dolev" theme={hasPhotoBg ? 'dark' : 'light'}>
              <p>
                היי, אני{' '}
                <strong className={hasPhotoBg ? 'text-emerald-300' : 'text-emerald-700'}>דולב</strong>
                . אני כאן רק כדי להכיר אתכם — בלי שיפוט, בלי בושה. אחר כך אלמוג ילווה אתכם
                באמת.
              </p>
              <p className={`mt-3 text-sm leading-relaxed ${hasPhotoBg ? 'text-emerald-50/95' : 'text-slate-600'}`}>
                <strong className={hasPhotoBg ? 'text-white' : 'text-emerald-800'}>Nura</strong> — מארמית,
                אחת השפות העתיקות בעולם. משמעותה <em>אור</em>. כי כל שינוי אמיתי מתחיל מרגע של הארה —
                הרגע שהחלטת לשנות.
                <br />
                <strong className={hasPhotoBg ? 'text-white' : 'text-emerald-800'}>Well</strong> — באנגלית:
                בריאות, איזון, להרגיש טוב. לא דיאטה, לא ספירת קלוריות — חיים טובים יותר.
              </p>
              <p className={`mt-2 text-sm ${hasPhotoBg ? 'text-emerald-50/90' : 'text-slate-600'}`}>
                ביחד זה אומר:{' '}
                <strong className={hasPhotoBg ? 'text-white' : 'text-emerald-800'}>
                  האור שיוביל אותך לחיים טובים יותר
                </strong>
                . כמו מאמן אמיתי שיש לך — לא אפליקציה קרה.
              </p>
            </MentorBubble>
          </motion.div>

          <div className="mt-auto space-y-3 pb-4">
            <button
              type="button"
              onClick={() => setStartOpen(true)}
              className="w-full min-h-[52px] rounded-2xl font-black text-lg text-white flex items-center justify-center gap-2 shadow-[0_12px_40px_rgba(16,185,129,0.4)] bg-gradient-to-l from-emerald-600 via-emerald-500 to-teal-500 hover:brightness-110 active:scale-[0.98] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
            >
              <Sparkles className="w-5 h-5" aria-hidden />
              בואו נתחיל
            </button>

            <button
              type="button"
              onClick={() => setHowOpen(true)}
              className={[
                'w-full min-h-[48px] rounded-2xl font-bold flex items-center justify-center gap-2 transition-all',
                hasPhotoBg
                  ? 'text-white border border-white/30 bg-white/10 backdrop-blur-xl hover:bg-white/15'
                  : 'text-emerald-800 border border-emerald-200 bg-white hover:bg-emerald-50 shadow-sm',
              ].join(' ')}
            >
              <HelpCircle className="w-5 h-5" aria-hidden />
              איך זה עובד?
            </button>

            <p
              className={`text-center text-sm pt-1 ${hasPhotoBg ? 'text-emerald-100/80' : 'text-slate-600'}`}
            >
              כבר רשומים?{' '}
              <Link
                href="/login"
                className={`font-bold hover:underline ${hasPhotoBg ? 'text-emerald-300' : 'text-emerald-700'}`}
              >
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
