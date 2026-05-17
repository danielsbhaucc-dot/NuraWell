import Link from 'next/link';
import { Mail } from 'lucide-react';

export const metadata = {
  title: 'אימות אימייל | NuraWell',
};

export default async function RegisterCheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const hasError = sp.error === 'auth';

  return (
    <main
      id="main-content"
      className="onboarding-shell-dark min-h-[100dvh] flex flex-col items-center justify-center px-4 py-12"
    >
      <section className="onboarding-page-inner max-w-md w-full text-center">
        <section
          className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-emerald-500/20 flex items-center justify-center"
          aria-hidden
        >
          <Mail className="w-8 h-8 text-emerald-300" />
        </section>
        <h1 className="text-2xl font-black text-white mb-3" style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}>
          בדוק/י את תיבת האימייל
        </h1>
        <p className="text-emerald-50/85 text-[15px] leading-relaxed mb-2">
          שלחנו קישור לאימות. אחרי הלחיצה תועבר/י לאפליקציה — ואלמוג ישלח ברכה קצרה עם סיכום מה
          שמילאת (באימייל ובאפליקציה).
        </p>
        {hasError ? (
          <p className="text-amber-200 text-sm mt-3">
            הקישור לא תקף או שפג תוקף — נסו להירשם שוב או לבקש מייל חדש.
          </p>
        ) : null}
        <p className="text-white/50 text-sm mt-6">
          כבר אימתת?{' '}
          <Link href="/login" className="text-emerald-300 font-bold hover:underline">
            כניסה
          </Link>
        </p>
      </section>
    </main>
  );
}
