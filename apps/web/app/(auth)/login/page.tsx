'use client';

import { AFTER_LOGIN_KEY } from '@/lib/auth/passkey-nudge';
import { useState, useEffect, useSyncExternalStore, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, LogIn, Fingerprint, KeyRound, QrCode } from 'lucide-react';
import { StepUpDialog } from '@/components/admin/StepUpDialog';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { AnimatedDialog } from '../../../components/shared/AnimatedDialog';
import { createClient } from '../../../lib/supabase/client';
import { NuraWellLogo } from '../../../components/shared/NuraWellLogo';
import { PublicAiPresence } from '@/lib/module-api/agent/components-ai-PublicAiPresence';
import { LegalLinksRow } from '@/lib/module-api/legal/components-legal-LegalLinksRow';
import { useToast, ToastContainer } from '../../../components/shared/Toast';
import { APP_HOME_PATH } from '../../../lib/navigation/app-home-path';

export const dynamic = 'force-dynamic';

/**
 * מאמת ש-redirect הוא נתיב יחסי בטוח של האתר. חוסם open-redirect לאתרים זרים
 * (כולל `https://evil.com`, `//evil.com`, `javascript:`, `data:`).
 * בריג' ל-domain ה-Ops הוא cross-origin — מטופל אך ורק ב-middleware (server side)
 * דרך `isOpsLoginRedirectUrl`; הלקוח לא ינווט ישירות למקור אחר.
 */
function sanitizeRedirectPath(raw: string | null | undefined): string {
  if (!raw) return APP_HOME_PATH;
  if (!raw.startsWith('/')) return APP_HOME_PATH;
  if (raw.startsWith('//')) return APP_HOME_PATH;
  if (raw.startsWith('/\\')) return APP_HOME_PATH;
  return raw;
}

/** Hostname never changes during the page's life — nothing to subscribe to. */
const noopSubscribe = () => () => undefined;
function isOpsHostClient(): boolean {
  const opsHost = process.env.NEXT_PUBLIC_OPS_HOSTNAME?.trim().toLowerCase();
  return Boolean(opsHost) && window.location.hostname.toLowerCase() === opsHost;
}

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = sanitizeRedirectPath(searchParams?.get('redirect'));
  const toast = useToast();

  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [bgMode, setBgMode] = useState<'loading' | 'light' | 'photo'>('loading');
  const [bgReady, setBgReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupEmail, setBackupEmail] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  /** Ops host serves its own admin login (same-origin cookies); hide public-app links there. */
  const isOpsHost = useSyncExternalStore(noopSubscribe, isOpsHostClient, () => false);
  const reason = searchParams?.get('reason');

  useEffect(() => {
    if (reason === 'ops_idle') toast.info('נותקת אחרי זמן ללא פעילות', 'התחבר שוב כדי להמשיך');
    else if (reason === 'no_access') toast.error('אין הרשאה', 'החשבון הזה לא מורשה לגשת לכאן');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason]);

  const hasPhotoBg = bgMode === 'photo' && Boolean(bgUrl);
  const useDarkShell = bgMode === 'photo';
  const isDarkUi = useDarkShell;

  useEffect(() => {
    document.documentElement.classList.add('login-auth-lock');
    document.body.classList.add('login-auth-lock');
    return () => {
      document.documentElement.classList.remove('login-auth-lock');
      document.body.classList.remove('login-auth-lock');
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/v1/login-background')
      .then((r) => r.json())
      .then((d: { url?: string | null; has_custom?: boolean }) => {
        if (cancelled) return;
        if (!d.has_custom || !d.url) {
          setBgMode('light');
          setBgReady(true);
          return;
        }
        setBgMode('photo');
        const img = new Image();
        img.onload = () => {
          if (!cancelled) {
            setBgUrl(d.url!);
            setBgReady(true);
          }
        };
        img.onerror = () => {
          if (!cancelled) {
            setBgMode('light');
            setBgReady(true);
          }
        };
        img.src = d.url;
      })
      .catch(() => {
        if (!cancelled) {
          setBgMode('light');
          setBgReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) {
      toast.error('אימייל לא תקין', 'יש להזין כתובת אימייל עם @');
      return;
    }
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

      void fetch('/api/v1/auth/login-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: !authError }), keepalive: true }).catch(() => undefined);
      if (authError) {
        toast.error('התחברות נכשלה', 'אימייל או סיסמה שגויים');
        return;
      }

      if (isOpsHost) {
        // Full navigation so the proxy re-checks admin + rewrites to the panel on this host.
        window.location.assign(redirect === APP_HOME_PATH ? '/' : redirect);
        return;
      }
      try {
        sessionStorage.setItem(AFTER_LOGIN_KEY, String(Date.now()));
      } catch {}
      toast.success('התחברת בהצלחה!', 'מעבירים אותך לקורסים...');
      setTimeout(() => {
        router.push(redirect);
        router.refresh();
      }, 800);
    } catch (e) {
      console.error('[login] unexpected', e);
      toast.error(
        'שגיאה',
        process.env.NODE_ENV === 'development'
          ? 'משהו השתבש — בדקו שקיים apps/web/.env.local עם Supabase (ראו .env.example)'
          : 'משהו השתבש, נסו שוב'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setPasskeySupported(browserSupportsWebAuthn());
  }, []);

  const afterSignIn = () => {
    // full navigation so the proxy re-checks the session (and, for admins, device approval)
    window.location.assign(isOpsHost && redirect === APP_HOME_PATH ? '/' : redirect);
  };

  const handlePasskey = async () => {
    setPasskeyBusy(true);
    try {
      const o = await fetch('/api/v1/auth/passkey', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'options' }) });
      const od = (await o.json().catch(() => ({}))) as { options?: unknown; error?: string };
      if (!o.ok || !od.options) {
        toast.error('הכניסה לא הצליחה', od.error ?? 'אפשר לנסות שוב');
        return;
      }
      let response;
      try {
        response = await startAuthentication({ optionsJSON: od.options as never });
      } catch {
        toast.info('הכניסה בוטלה', 'אפשר לנסות שוב או להיכנס עם סיסמה');
        return;
      }
      const v = await fetch('/api/v1/auth/passkey', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'verify', response }) });
      const vd = (await v.json().catch(() => ({}))) as { error?: string };
      if (!v.ok) {
        toast.error('הכניסה לא הצליחה', vd.error ?? 'אפשר לנסות שוב');
        return;
      }
      toast.success('התחברת בהצלחה!');
      afterSignIn();
    } finally {
      setPasskeyBusy(false);
    }
  };

  const handleBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBackupBusy(true);
    setBackupError(null);
    try {
      const r = await fetch('/api/v1/auth/backup-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: backupEmail, code: backupCode }) });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setBackupError(d.error ?? 'הכניסה לא הצליחה');
        return;
      }
      setBackupOpen(false);
      toast.success('התחברת בהצלחה!', 'כדאי ליצור קודי גיבוי חדשים בהגדרות');
      afterSignIn();
    } catch {
      setBackupError('משהו השתבש, אפשר לנסות שוב');
    } finally {
      setBackupBusy(false);
    }
  };

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <AnimatedDialog
        open={backupOpen}
        onClose={() => !backupBusy && setBackupOpen(false)}
        variant="sheet"
        aria-labelledby="backup-login-h"
        backdropClassName="absolute inset-0 bg-ink-900/45"
        panelClassName="crystal-surface max-w-md rounded-2xl p-5 shadow-2xl sm:rounded-2xl"
      >
        <form onSubmit={handleBackup} dir="rtl" className="space-y-3" noValidate>
          <h3 id="backup-login-h" className="flex items-center gap-2 text-lg font-black text-ink-900">
            <KeyRound className="w-5 h-5 text-accent-600" aria-hidden />
            כניסה עם קוד גיבוי
          </h3>
          <p className="text-sm text-ink-600 leading-relaxed">כל קוד עובד פעם אחת בלבד. אחרי הכניסה כדאי ליצור קודים חדשים.</p>
          <input type="email" dir="ltr" autoComplete="username" value={backupEmail} onChange={(e) => setBackupEmail(e.target.value)} placeholder="your@email.com" aria-label="כתובת אימייל" className="input-field text-sm" />
          <input dir="ltr" autoComplete="one-time-code" value={backupCode} onChange={(e) => setBackupCode(e.target.value.toUpperCase())} placeholder="XXXXX-XXXXX" maxLength={16} aria-label="קוד גיבוי" className="input-field text-sm font-mono tracking-widest text-center" />
          {backupError ? <p role="alert" className="text-sm font-semibold text-coral-600">{backupError}</p> : null}
          <button type="submit" disabled={backupBusy || !backupEmail || backupCode.replace(/[^A-Za-z0-9]/g, '').length !== 10} className="w-full min-h-[48px] rounded-xl font-bold text-on-dark bg-linear-to-l from-primary-600 to-secondary-500 disabled:opacity-50 flex items-center justify-center gap-2">
            {backupBusy ? <div className="w-5 h-5 border-2 border-on-dark/30 border-t-on-dark rounded-full animate-spin" /> : null}
            כניסה
          </button>
        </form>
      </AnimatedDialog>
      <main
        id="main-content"
        className={[
          'relative flex flex-col overflow-hidden h-dvh max-h-dvh',
          useDarkShell ? 'onboarding-shell-dark' : 'onboarding-shell-light',
        ].join(' ')}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {hasPhotoBg ? (
          <>
            <div className="onboarding-photo-bg" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bgUrl!} alt="" aria-hidden fetchPriority="high" decoding="async" />
            </div>
            <div className="onboarding-photo-overlay" aria-hidden />
          </>
        ) : null}

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: bgReady ? 1 : 0, y: bgReady ? 0 : 12 }}
          transition={{ duration: 0.3, ease: 'easeOut' as const }}
          className="relative z-10 flex min-h-0 flex-1 flex-col justify-center-safe overflow-y-auto overscroll-contain px-4 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))] max-w-md mx-auto w-full"
        >
          <div className="text-center mb-6">
            <div className="flex justify-center mb-3">
              <NuraWellLogo size="lg" tone={isDarkUi ? 'dark' : 'light'} />
            </div>
            <div className="mt-3 mb-2">
              <h1
                className={[
                  'text-3xl font-black leading-tight',
                  isDarkUi
                    ? 'bg-linear-to-l from-primary-200 via-secondary-100 to-accent-100 bg-clip-text text-transparent'
                    : 'text-ink-900',
                ].join(' ')}
                style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}
              >
                ברוכים הבאים
              </h1>
            </div>
            <p
              className={[
                'text-[15px] mt-1.5 font-medium',
                isDarkUi ? 'text-primary-100/90' : 'text-ink-500',
              ].join(' ')}
            >
              התחברו כדי להמשיך את המסע שלכם
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <div
                className="h-px flex-1 max-w-[50px]"
                style={{
                  background: isDarkUi
                    ? 'linear-gradient(to left, rgba(207,208,214,0.5), transparent)'
                    : 'linear-gradient(to left, rgba(16,185,129,0.3), transparent)',
                }}
              />
              <div className={`w-1.5 h-1.5 rounded-full ${isDarkUi ? 'bg-primary-300' : 'bg-primary-500'}`} />
              <div
                className="h-px flex-1 max-w-[50px]"
                style={{
                  background: isDarkUi
                    ? 'linear-gradient(to right, rgba(207,208,214,0.5), transparent)'
                    : 'linear-gradient(to right, rgba(16,185,129,0.3), transparent)',
                }}
              />
            </div>
          </div>

          {!isOpsHost && (
            <div className="mb-5">
              <PublicAiPresence compact />
            </div>
          )}

          <div
            className={[
              'rounded-3xl p-8',
              hasPhotoBg
                ? 'onboarding-hero-card-photo shadow-[0_16px_48px_rgba(0,0,0,0.28)]'
                : 'bg-background-card',
            ].join(' ')}
            style={
              hasPhotoBg
                ? undefined
                : {
                    border: '1px solid rgba(0,0,0,0.06)',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                  }
            }
          >
            <div className="flex items-center gap-3 mb-6">
              <div
                className="w-1.5 h-7 rounded-full"
                style={{ background: 'linear-gradient(to bottom, #34d399, #047857)' }}
              />
              <LogIn className={`w-5 h-5 ${isDarkUi ? 'text-primary-300' : 'text-primary-600'}`} />
              <h2
                className={[
                  'font-black text-xl',
                  isDarkUi ? 'text-on-dark' : 'text-ink-900',
                ].join(' ')}
                style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}
              >
                כניסה לחשבון
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="login-email"
                  className={[
                    'flex items-center gap-1.5 text-sm font-bold mb-2',
                    isDarkUi ? 'text-primary-50' : 'text-ink-700',
                  ].join(' ')}
                >
                  <Mail className={`w-4 h-4 ${isDarkUi ? 'text-primary-300' : 'text-primary-600'}`} />
                  כתובת אימייל
                </label>
                <div className="relative">
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    dir="ltr"
                    className="input-field text-sm"
                    placeholder="your@email.com"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className={[
                    'flex items-center gap-1.5 text-sm font-bold mb-2',
                    isDarkUi ? 'text-primary-50' : 'text-ink-700',
                  ].join(' ')}
                >
                  <Lock className={`w-4 h-4 ${isDarkUi ? 'text-primary-300' : 'text-primary-600'}`} />
                  סיסמה
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    dir="ltr"
                    className="input-field text-sm pl-12"
                    placeholder="••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                    aria-pressed={showPassword}
                    className={[
                      'absolute left-3 top-1/2 -translate-y-1/2 transition-colors p-1',
                      isDarkUi ? 'text-primary-200/70 hover:text-on-dark' : 'text-ink-400 hover:text-ink-600',
                    ].join(' ')}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <div
                  className="h-px w-full mb-4"
                  style={{
                    background: isDarkUi
                      ? 'linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent)'
                      : 'linear-gradient(to right, transparent, rgba(0,0,0,0.06), transparent)',
                  }}
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 rounded-2xl font-bold text-lg text-on-dark transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #047857, #10b981)',
                    boxShadow: '0 8px 24px rgba(16,185,129,0.4)',
                  }}
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-on-dark/30 border-t-on-dark rounded-full animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-5 h-5" />
                      כניסה לחשבון
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="mt-5 space-y-3">
              <div className="flex items-center gap-3" aria-hidden>
                <div className={`h-px flex-1 ${isDarkUi ? 'bg-on-dark/15' : 'bg-accent-300/60'}`} />
                <span className={`text-xs font-bold ${isDarkUi ? 'text-primary-100/70' : 'text-ink-400'}`}>או</span>
                <div className={`h-px flex-1 ${isDarkUi ? 'bg-on-dark/15' : 'bg-accent-300/60'}`} />
              </div>
              {passkeySupported ? (
                <button
                  type="button"
                  onClick={() => void handlePasskey()}
                  disabled={passkeyBusy}
                  className={[
                    'w-full min-h-[52px] rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60',
                    isDarkUi ? 'bg-on-dark/10 text-on-dark ring-1 ring-accent-200/50 backdrop-blur' : 'bg-glass/80 text-primary-800 ring-1 ring-accent-300/70 shadow-[0_6px_18px_rgba(217,119,6,0.12)]',
                  ].join(' ')}
                >
                  {passkeyBusy ? <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : <Fingerprint className="w-5 h-5" aria-hidden />}
                  כניסה עם Face ID או טביעת אצבע
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setQrOpen(true)}
                data-testid="login-qr"
                className={[
                  'w-full min-h-[48px] rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95',
                  isDarkUi ? 'bg-on-dark/5 text-primary-50 ring-1 ring-on-dark/20' : 'bg-glass/50 text-primary-800 ring-1 ring-primary-300/60',
                ].join(' ')}
              >
                <QrCode className="w-5 h-5" aria-hidden />
                כניסה עם הטלפון (סריקת קוד)
              </button>
              <StepUpDialog open={qrOpen} variant="login" purpose="auth.login" reason="סורקים ומאשרים בטלפון" onClose={() => setQrOpen(false)}
                onVerified={() => { setQrOpen(false); toast.success('התחברת בהצלחה!'); afterSignIn(); }} />
              {isOpsHost ? (
              <button
                type="button"
                onClick={() => {
                  setBackupEmail(email);
                  setBackupError(null);
                  setBackupOpen(true);
                }}
                className={`w-full text-xs font-medium opacity-70 underline-offset-4 hover:underline ${isDarkUi ? 'text-primary-100/80' : 'text-ink-500'}`}
              >
                קוד גיבוי
              </button>
              ) : null}
            </div>

            {!isOpsHost && <div className="mt-5 text-center">
              <p className={['text-sm', isDarkUi ? 'text-primary-100/80' : 'text-ink-500'].join(' ')}>
                אין לכם חשבון?{' '}
                <Link
                  href="/register"
                  className={[
                    'font-bold transition-colors',
                    isDarkUi ? 'text-primary-300 hover:text-primary-200' : 'text-primary-600 hover:text-primary-700',
                  ].join(' ')}
                >
                  הרשמה חינם
                </Link>
              </p>
            </div>}
          </div>

          {!isOpsHost && <LegalLinksRow tone={isDarkUi ? 'dark' : 'light'} className="mt-6" />}
        </motion.div>
      </main>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main
          id="main-content"
          className="onboarding-shell-light flex h-dvh max-h-dvh items-center justify-center overflow-hidden"
        >
          <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
        </main>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
