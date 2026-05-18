'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { VerificationCodeInput } from './VerificationCodeInput';

type CheckEmailClientProps = {
  email: string;
  hasAuthError: boolean;
};

export function CheckEmailClient({ email, hasAuthError }: CheckEmailClientProps) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<string | null>(
    hasAuthError ? 'הקישור לא תקף או שפג תוקף — נסו קוד מהמייל או שליחה מחדש.' : null
  );
  const [success, setSuccess] = useState<string | null>(null);

  const goVerified = useCallback(() => {
    router.push('/register/verified');
    router.refresh();
  }, [router]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const poll = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled && user?.email_confirmed_at) {
        goVerified();
      }
    };

    void poll();
    const id = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [goVerified]);

  const verifyCode = async () => {
    if (code.length !== 6 || !email) return;
    setVerifying(true);
    setMessage(null);
    setSuccess(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'signup',
    });
    setVerifying(false);
    if (error) {
      setMessage('הקוד לא תקף — בדקו שוב את המייל או בקשו קישור חדש.');
      return;
    }
    setSuccess('מעולה! האימייל אומת.');
    goVerified();
  };

  const resendEmail = async () => {
    if (!email) return;
    setResending(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/register/verified`,
      },
    });
    setResending(false);
    if (error) {
      setMessage('לא הצלחנו לשלוח שוב — נסו בעוד דקה.');
      return;
    }
    setSuccess('שלחנו מייל חדש עם קישור וקוד אימות.');
  };

  return (
    <section className="onboarding-page-inner max-w-md w-full text-center">
      <section
        className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-emerald-500/20 flex items-center justify-center"
        aria-hidden
      >
        <Mail className="w-8 h-8 text-emerald-300" />
      </section>
      <h1
        className="text-2xl font-black text-white mb-3"
        style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}
      >
        בדוק/י את תיבת האימייל
      </h1>
      <p className="text-emerald-50/85 text-[15px] leading-relaxed mb-1">
        שלחנו קישור לאימות{email ? ` ל־${email}` : ''}. אחרי האישור תועבר/י לדף האימות — ודולב
        ישלח ברכה עם סיכום מה שמילאת.
      </p>
      <p className="text-white/45 text-xs mb-6">
        המסך יתעדכן אוטומטית ברגע שתאשר/י את המייל (גם אם נשארת כאן).
      </p>

      <section className="onboarding-panel-dark rounded-2xl p-5 text-right mb-4">
        <p className="text-sm font-bold text-emerald-100 mb-3 text-center">
          או הזן/י את קוד האימות מהמייל
        </p>
        <VerificationCodeInput value={code} onChange={setCode} disabled={verifying} />
        <button
          type="button"
          onClick={() => void verifyCode()}
          disabled={code.length !== 6 || verifying || !email}
          className="mt-4 w-full rounded-xl bg-emerald-600 py-3 font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          אימות עם קוד
        </button>
      </section>

      {message ? <p className="text-amber-200 text-sm mb-2">{message}</p> : null}
      {success ? <p className="text-emerald-300 text-sm mb-2">{success}</p> : null}

      <button
        type="button"
        onClick={() => void resendEmail()}
        disabled={resending || !email}
        className="text-sm text-emerald-300/90 font-semibold hover:underline disabled:opacity-50"
      >
        {resending ? 'שולחים...' : 'שלחו לי שוב את מייל האימות'}
      </button>

      <p className="text-white/50 text-sm mt-8">
        כבר אימתת?{' '}
        <Link href="/login" className="text-emerald-300 font-bold hover:underline">
          כניסה
        </Link>
      </p>
    </section>
  );
}
