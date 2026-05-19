'use client';

import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { genderCopy } from '@/lib/onboarding/gender-copy';
import type { OnboardingGender } from '@/lib/onboarding/types';
import { PostVerifyEffects } from './PostVerifyEffects';

type RegisterVerifiedClientProps = {
  gender: OnboardingGender | '';
};

export function RegisterVerifiedClient({ gender }: RegisterVerifiedClientProps) {
  const gc = genderCopy(gender);

  return (
    <main
      id="main-content"
      className="onboarding-shell-dark min-h-[100dvh] flex flex-col items-center justify-center px-4 py-12"
    >
      <PostVerifyEffects />
      <section className="onboarding-page-inner max-w-md w-full text-center">
        <section
          className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-emerald-500/25 flex items-center justify-center ring-2 ring-emerald-400/40"
          aria-hidden
        >
          <CheckCircle2 className="w-10 h-10 text-emerald-300" />
        </section>
        <h1
          className="text-2xl font-black text-white mb-3"
          style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}
        >
          האימייל אומת בהצלחה!
        </h1>
        <p className="text-emerald-50/90 text-[15px] leading-relaxed mb-6">
          מעולה — החשבון פעיל. {gc.sendsYouEmail} עם סיכום מה שמילאת בהרשמה (אם עדיין לא קיבלת —{' '}
          {gc.checkSpam} גם בתיקיית ספאם).
        </p>
        <Link
          href="/home"
          className="inline-flex items-center justify-center w-full max-w-xs mx-auto rounded-2xl bg-gradient-to-l from-emerald-600 to-teal-500 px-6 py-3.5 text-white font-bold text-[15px] shadow-lg shadow-emerald-500/25 hover:brightness-110 transition-all"
        >
          המשך לאפליקציה
        </Link>
        <p className="text-white/45 text-xs mt-6">
          בהתחברות הראשונה דולב {gc.willShowYou} את הנתונים שוב בצורה אישית.
        </p>
      </section>
    </main>
  );
}
