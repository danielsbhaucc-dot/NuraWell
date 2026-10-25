'use client';

import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { genderCopy } from '@/lib/onboarding/gender-copy';
import type { OnboardingGender } from '@/lib/onboarding/types';
import { PostVerifyEffects } from './PostVerifyEffects';
import { AuthBackdrop } from './AuthBackdrop';
import { NuraWellLogo } from '@/components/shared/NuraWellLogo';

type RegisterVerifiedClientProps = {
  gender: OnboardingGender | '';
};

export function RegisterVerifiedClient({ gender }: RegisterVerifiedClientProps) {
  const gc = genderCopy(gender);

  return (
    <main
      id="main-content"
      className="onboarding-shell-dark relative min-h-dvh flex flex-col items-center justify-center-safe px-4 pb-[max(6rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]"
    >
      <AuthBackdrop />
      <PostVerifyEffects />
      <section className="onboarding-page-inner max-w-md w-full text-center">
        <header className="flex justify-center mb-5">
          <NuraWellLogo size="lg" tone="dark" />
        </header>
        <div className="onboarding-hero-card-photo rounded-3xl p-6 shadow-[0_16px_48px_rgba(0,0,0,0.28)]">
          <section
            className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-primary-500/25 flex items-center justify-center ring-2 ring-primary-400/40"
            aria-hidden
          >
            <CheckCircle2 className="w-10 h-10 text-primary-300" />
          </section>
          <h1 className="text-2xl font-black text-on-dark mb-3" style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}>
            האימייל אומת בהצלחה!
          </h1>
          <p className="text-primary-50/90 text-[15px] leading-relaxed mb-6">
            מעולה — החשבון פעיל. {gc.sendsYouEmail} עם סיכום מה שמילאתם בהרשמה (אם עדיין לא קיבלתם — {gc.checkSpam} גם
            בתיקיית ספאם).
          </p>
          <Link
            href="/home"
            className="inline-flex items-center justify-center w-full max-w-xs mx-auto rounded-2xl px-6 py-3.5 text-on-dark font-bold text-[15px] bg-linear-135 from-primary-700 to-primary-500 shadow-[0_8px_24px_rgba(16,185,129,0.4)] hover:scale-[1.02] transition-all"
           
          >
            המשך לאפליקציה
          </Link>
          <p className="text-on-dark/45 text-xs mt-6">
            בהתחברות הראשונה דולב {gc.willShowYou} את הנתונים שוב בצורה אישית.
          </p>
        </div>
      </section>
    </main>
  );
}
