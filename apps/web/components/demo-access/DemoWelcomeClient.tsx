'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { Loader2, LockKeyhole, Sparkles } from 'lucide-react';

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

export function DemoWelcomeClient({ token }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [claimError, setClaimError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const localHour = useMemo(() => new Date().getHours(), []);

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
    <div className="relative min-h-dvh overflow-hidden bg-[#0b1f1c] text-white" dir="rtl">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {preview?.welcome_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview.welcome_image_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-45"
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,rgba(45,212,191,0.35),transparent_55%),radial-gradient(ellipse_at_80%_0%,rgba(251,191,36,0.22),transparent_45%),linear-gradient(160deg,#06201c_0%,#0f3d36_45%,#12352f_100%)]" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-[#041512]/95 via-[#06201c]/55 to-[#06201c]/35" />
        <div className="absolute -inset-s-16 top-24 h-64 w-64 rounded-full bg-teal-400/20 blur-3xl" />
        <div className="absolute -inset-e-10 bottom-20 h-72 w-72 rounded-full bg-amber-300/15 blur-3xl" />
      </div>

      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-end px-5 pb-10 pt-16 sm:justify-center sm:pb-16">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-3xl border border-white/15 bg-white/10 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.12, duration: 0.45 }}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-teal-200/30 bg-teal-400/15 px-3 py-1 text-xs font-semibold text-teal-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            גישה זמנית · NuraWell
          </motion.div>

          {loadError ? (
            <p className="text-lg font-bold text-rose-100">{loadError}</p>
          ) : !preview ? (
            <div className="flex items-center gap-2 text-teal-50/90">
              <Loader2 className="h-5 w-5 animate-spin" />
              טוען את הקישור…
            </div>
          ) : (
            <>
              <h1 className="font-display text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">
                {preview.headline}
              </h1>
              <p className="mt-4 text-[15px] leading-relaxed text-teal-50/90">
                זהו קישור זמני שנפתח למטרה{' '}
                <span className="font-semibold text-amber-100">«{preview.reason}»</span>.
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
                <p className="mt-3 text-xs font-medium text-teal-100/70">בתוקף עד {expiresLabel}</p>
              ) : null}

              {preview.requires_password ? (
                <label className="mt-6 block">
                  <span className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-teal-50">
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
                    className="w-full rounded-2xl border border-white/20 bg-black/25 px-4 py-3 text-base text-white placeholder:text-white/40 outline-hidden ring-teal-300/40 focus:ring-2"
                  />
                </label>
              ) : null}

              {claimError ? (
                <p className="mt-3 text-sm font-semibold text-rose-200">{claimError}</p>
              ) : null}

              <motion.button
                type="button"
                disabled={isPending || (preview.requires_password && password.trim().length < 4)}
                onClick={enter}
                whileTap={{ scale: 0.98 }}
                className="mt-7 inline-flex w-full min-h-12 items-center justify-center gap-2 rounded-2xl bg-linear-to-l from-teal-400 via-emerald-400 to-amber-300 px-5 py-3.5 text-base font-black text-emerald-950 shadow-[0_12px_40px_rgba(45,212,191,0.35)] transition disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    נכנסים…
                  </>
                ) : (
                  'כניסה למערכת כמשתמש דמו'
                )}
              </motion.button>
            </>
          )}
        </motion.div>
      </main>
    </div>
  );
}
