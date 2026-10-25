'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, LockKeyhole, Sparkles } from 'lucide-react';

type Preview = {
  guest_name: string | null;
  reason: string;
  expires_at: string;
  requires_password: boolean;
  welcome_image_url: string | null;
  target_display_name: string | null;
  headline: string;
};

type Props = {
  token: string;
};

const DEMO_LOCK = 'demo-welcome-lock';

export function DemoWelcomeClient({ token }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [claimError, setClaimError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const localHour = useMemo(() => new Date().getHours(), []);

  useEffect(() => {
    document.documentElement.classList.add(DEMO_LOCK);
    document.body.classList.add(DEMO_LOCK);
    return () => {
      document.documentElement.classList.remove(DEMO_LOCK);
      document.body.classList.remove(DEMO_LOCK);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/v1/demo-access/preview?token=${encodeURIComponent(token)}&hour=${localHour}`,
          { credentials: 'omit' },
        );
        const data = (await res.json()) as Preview & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data.error ?? 'הקישור אינו זמין.');
          return;
        }
        setPreview(data);
      } catch {
        if (!cancelled) setLoadError('לא הצלחנו לטעון את הקישור.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, localHour]);

  const enter = () => {
    setClaimError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/v1/demo-access/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            token,
            password: password || null,
            local_hour: localHour,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; redirect?: string; error?: string };
        if (!res.ok || !data.redirect) {
          setClaimError(data.error ?? 'לא ניתן להיכנס כרגע.');
          return;
        }
        window.location.href = data.redirect;
      } catch {
        setClaimError('שגיאת רשת. נסו שוב.');
      }
    });
  };

  const expiresLabel = preview?.expires_at
    ? new Date(preview.expires_at).toLocaleString('he-IL', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  return (
    <div className="fixed inset-0 z-[1] overflow-hidden bg-[#0b1f1c] text-on-dark" dir="rtl">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {preview?.welcome_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview.welcome_image_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-50"
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,rgba(45,212,191,0.35),transparent_55%),radial-gradient(ellipse_at_80%_0%,rgba(251,191,36,0.18),transparent_45%),linear-gradient(160deg,#06201c_0%,#0f3d36_45%,#12352f_100%)]" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-[#041512] via-[#06201c]/70 to-[#06201c]/40" />
        <div className="absolute -inset-s-16 top-24 h-64 w-64 rounded-full bg-secondary-400/20 blur-3xl" />
        <div className="absolute -inset-e-10 bottom-20 h-72 w-72 rounded-full bg-accent-300/12 blur-3xl" />
      </div>

      <main className="relative z-10 mx-auto flex h-full w-full max-w-lg flex-col justify-end px-5 pb-10 pt-16 sm:justify-center sm:pb-16">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-[2rem] border border-on-dark/12 bg-[#071a17]/55 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.4)] backdrop-blur-2xl sm:p-8"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.12, duration: 0.45 }}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-secondary-200/25 bg-secondary-500/10 px-3 py-1 text-xs font-semibold tracking-wide text-secondary-50/95"
          >
            <Sparkles className="h-3.5 w-3.5" />
            גישה זמנית · NuraWell
          </motion.div>

          {loadError ? (
            <p className="text-lg font-bold text-coral-100">{loadError}</p>
          ) : !preview ? (
            <div className="flex items-center gap-2 text-secondary-50/90">
              <Loader2 className="h-5 w-5 animate-spin" />
              טוען את הקישור…
            </div>
          ) : (
            <>
              <h1 className="font-display text-3xl font-black leading-tight tracking-tight text-on-dark sm:text-4xl">
                {preview.headline}
              </h1>
              <p className="mt-4 text-[15px] leading-relaxed text-secondary-50/88">
                זהו קישור זמני שנפתח למטרה{' '}
                <span className="font-semibold text-accent-100">«{preview.reason}»</span>.
                לחיצה על הכפתור תוביל אתכם למערכת עם משתמש דמו
                {preview.target_display_name ? (
                  <>
                    {' '}
                    (<span className="font-semibold">{preview.target_display_name}</span>)
                  </>
                ) : null}
                — בלי הרשאות מנהל, ועם תוקף מוגבל.
              </p>
              {expiresLabel ? (
                <p className="mt-3 text-xs font-medium text-secondary-100/65">בתוקף עד {expiresLabel}</p>
              ) : null}

              {preview.requires_password ? (
                <label className="mt-6 block">
                  <span className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-secondary-50">
                    <LockKeyhole className="h-4 w-4" />
                    סיסמה זמנית
                  </span>
                  <input
                    type="password"
                    autoComplete="one-time-code"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      preview.guest_name
                        ? `היי ${preview.guest_name}, נא להקליד סיסמה זמנית`
                        : 'נא להקליד סיסמה זמנית'
                    }
                    className="w-full rounded-2xl border border-on-dark/18 bg-forest-950/30 px-4 py-3 text-base text-on-dark placeholder:text-on-dark/40 outline-hidden ring-secondary-300/35 focus:ring-2"
                  />
                </label>
              ) : null}

              {claimError ? (
                <p className="mt-3 text-sm font-semibold text-coral-200">{claimError}</p>
              ) : null}

              <motion.button
                type="button"
                disabled={isPending || (preview.requires_password && password.trim().length < 4)}
                onClick={enter}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.985 }}
                className="group relative mt-7 inline-flex w-full min-h-[3.25rem] items-center justify-center overflow-hidden rounded-2xl bg-primary-700 px-5 py-3.5 text-base font-bold text-on-dark shadow-[0_14px_36px_rgba(4,120,87,0.45)] ring-1 ring-primary-400/30 transition disabled:opacity-50 enabled:hover:bg-primary-600 enabled:hover:ring-primary-300/40"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.16)_0%,transparent_42%,rgba(0,0,0,0.12)_100%)]"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 -start-1/3 w-1/3 skew-x-[-18deg] bg-on-dark/15 transition-transform duration-700 group-hover:translate-x-[320%]"
                />
                <span className="relative inline-flex items-center gap-2.5">
                  {isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      נכנסים…
                    </>
                  ) : (
                    <>
                      כניסה למערכת כמשתמש דמו
                      <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-0.5" />
                    </>
                  )}
                </span>
              </motion.button>
            </>
          )}
        </motion.div>
      </main>
    </div>
  );
}
