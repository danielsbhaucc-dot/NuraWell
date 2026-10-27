'use client';

import { useState } from 'react';
import { AuthBackdrop } from './AuthBackdrop';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { HelpCircle, Leaf } from 'lucide-react';
import { NuraWellLogo } from '@/components/shared/NuraWellLogo';
import { RegisterStartModal } from './RegisterStartModal';
import { RegisterHowItWorksModal } from './RegisterHowItWorksModal';
import { MentorBubble } from './MentorBubble';

export function RegisterLandingClient() {
  const [startOpen, setStartOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  return (
    <>
      <main
        id="main-content"
        className="onboarding-shell-dark relative flex flex-col overflow-hidden h-dvh max-h-dvh"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <AuthBackdrop />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-center-safe overflow-y-auto overscroll-contain px-4 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))] max-w-md mx-auto w-full">
          <header className="flex justify-center mb-6">
            <NuraWellLogo size="lg" tone="dark" />
          </header>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={[
              'rounded-3xl p-5 sm:p-6 mb-5',
              'onboarding-hero-card-photo shadow-[0_16px_48px_rgba(0,0,0,0.28)]',
            ].join(' ')}
          >
            <h1
              className="text-2xl sm:text-3xl font-black text-center leading-tight mb-4"
              style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}
            >
              <span
                className={
                  'bg-linear-to-l from-primary-300 via-secondary-200 to-accent-200 bg-clip-text text-transparent'
                }
              >
                ברוכים הבאים ל־
              </span>
              <br />
              <span
                className={
                  'bg-linear-to-l from-primary-200 via-secondary-100 to-accent-100 bg-clip-text text-transparent'
                }
              >
                NuraWell
              </span>
              <span className="onboarding-wave-hand mr-1.5" aria-hidden>
                {' '}
                👋
              </span>
            </h1>

            <MentorBubble mentorId="dolev" theme={'dark'}>
              <p>
                היי, אני <strong className={'text-primary-300'}>דולב</strong>, מנהל ההרשמה. אקח מכם כמה פרטים זריזים —
                בלי שיפוט — ואעביר אתכם לאלמוג, המנטור שילווה אתכם אחרי שנסיים.
              </p>
              <p className={`mt-3 text-sm leading-relaxed ${'text-primary-50/95'}`}>
                <strong className={'text-on-dark'}>Nura</strong> — אור. הרגע שהחלטתם לשנות.
                <br />
                <strong className={'text-on-dark'}>Well</strong> — בריאות, איזון, להרגיש טוב. לא דיאטה — חיים טובים
                יותר.
              </p>
              <p className={`mt-2 text-sm ${'text-primary-50/90'}`}>
                זה בנוי בשבילכם — <strong className={'text-on-dark'}>ליווי אישי, לא אפליקציה קרה</strong>.
              </p>
            </MentorBubble>
          </motion.div>

          <div className="space-y-3 pb-4">
            <button
              type="button"
              onClick={() => setStartOpen(true)}
              className="w-full min-h-[52px] rounded-2xl font-black text-lg text-on-dark bg-linear-135 from-primary-700 to-primary-500 shadow-[0_8px_24px_rgba(16,185,129,0.4)] flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              <Leaf className="w-5 h-5" aria-hidden />
              בואו נתחיל
            </button>

            <button
              type="button"
              onClick={() => setHowOpen(true)}
              className={[
                'w-full min-h-[48px] rounded-2xl font-bold flex items-center justify-center gap-2 transition-all',
                'bg-on-dark/10 text-on-dark ring-1 ring-accent-200/50 backdrop-blur hover:bg-on-dark/15',
              ].join(' ')}
            >
              <HelpCircle className="w-5 h-5" aria-hidden />
              איך זה עובד?
            </button>

            <p className={`text-center text-sm pt-1 ${'text-primary-100/80'}`}>
              כבר רשומים?{' '}
              <Link href="/login" className={`font-bold hover:underline ${'text-primary-300'}`}>
                כניסה
              </Link>
            </p>

            <p className={`text-center text-xs leading-relaxed ${'text-primary-100/70'}`}>
              בהרשמה יש לאשר במפורש את{' '}
              <Link href="/terms" className={`font-semibold underline underline-offset-2 ${'text-primary-200'}`}>
                תנאי השימוש
              </Link>{' '}
              ואת{' '}
              <Link href="/privacy" className={`font-semibold underline underline-offset-2 ${'text-primary-200'}`}>
                מדיניות הפרטיות
              </Link>
              , כולל הסכמה למידע בריאותי.
            </p>
          </div>
        </div>
      </main>

      <RegisterStartModal open={startOpen} onClose={() => setStartOpen(false)} />
      <RegisterHowItWorksModal open={howOpen} onClose={() => setHowOpen(false)} />
    </>
  );
}
