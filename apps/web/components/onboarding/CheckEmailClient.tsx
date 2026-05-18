'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { VerificationCodeInput, VERIFICATION_CODE_LENGTH } from './VerificationCodeInput';
import { checkEmailCopy } from '@/lib/onboarding/check-email-copy';
import type { OnboardingGender } from '@/lib/onboarding/types';

type CheckEmailClientProps = {
  email: string;
  hasAuthError: boolean;
  firstName: string;
  gender: OnboardingGender | '';
};

export function CheckEmailClient({
  email,
  hasAuthError,
  firstName,
  gender,
}: CheckEmailClientProps) {
  const router = useRouter();
  const copy = checkEmailCopy(gender, firstName);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<string | null>(
    hasAuthError ? 'הקישור לא תקף או שפג תוקף — נסו קוד מהמייל או שליחה מחדש.' : null
  );
  const [success, setSuccess] = useState<string | null>(null);

  const triggerWelcomeEmail = useCallback(async () => {
    try {
      await fetch('/api/v1/auth/post-verify', { method: 'POST' });
    } catch {
      /* ignore */
    }
  }, []);

  const goVerified = useCallback(() => {
    void triggerWelcomeEmail();
    router.push('/register/verified');
    router.refresh();
  }, [router, triggerWelcomeEmail]);

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

  const autoSubmittedRef = useRef('');

  const verifyCode = useCallback(async () => {
    if (code.length !== VERIFICATION_CODE_LENGTH || !email) return;
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
  }, [code, email, goVerified]);

  useEffect(() => {
    if (code.length < VERIFICATION_CODE_LENGTH) {
      autoSubmittedRef.current = '';
      return;
    }
    if (code.length !== VERIFICATION_CODE_LENGTH || !email || verifying) return;
    if (autoSubmittedRef.current === code) return;
    autoSubmittedRef.current = code;
    void verifyCode();
  }, [code, email, verifying, verifyCode]);

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
        {copy.title}
      </h1>
      <p className="text-emerald-50/85 text-[15px] leading-relaxed mb-1">
        {copy.lead}
        {email ? (
          <>
            <br />
            <span className="text-emerald-200/90 text-sm" dir="ltr">
              {email}
            </span>
          </>
        ) : null}
      </p>
      <p className="text-white/45 text-xs mb-6">{copy.autoHint}</p>

      <section className="onboarding-panel-dark rounded-2xl p-5 text-right mb-4">
        <p className="text-sm font-bold text-emerald-100 mb-3 text-center">{copy.codePrompt}</p>
        <VerificationCodeInput value={code} onChange={setCode} disabled={verifying} />
        <button
          type="button"
          onClick={() => void verifyCode()}
          disabled={code.length !== VERIFICATION_CODE_LENGTH || verifying || !email}
          className="mt-4 w-full rounded-xl bg-emerald-600 py-3 font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {copy.verifyButton}
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
        {resending ? copy.resending : copy.resend}
      </button>

      <p className="text-white/50 text-sm mt-8">
        {copy.alreadyVerified}{' '}
        <Link href="/login" className="text-emerald-300 font-bold hover:underline">
          כניסה
        </Link>
      </p>
    </section>
  );
}
