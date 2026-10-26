'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import { Check, Copy, Download, Fingerprint, KeyRound, Loader2, RefreshCw, ShieldCheck, Smartphone, Trash2, TriangleAlert } from 'lucide-react';
import { AnimatedDialog } from '@/components/shared/AnimatedDialog';
import { ToastContainer, useToast } from '@/components/shared/Toast';
import { createClient } from '@/lib/supabase/client';
import { StepUpDialog } from '@/components/admin/StepUpDialog';

type Passkey = { id: string; label: string; device_type: string; backed_up: boolean; created_at: string; last_used_at: string | null };
type State = { passkeys: Passkey[]; backup_codes_left: number; backup_codes_enabled?: boolean; fresh: boolean; device_ok: boolean };

const API = '/api/v1/account/security';
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }) : 'עוד לא');

async function post(body: Record<string, unknown>) {
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, data };
}

function Divider() {
  return <div aria-hidden className="h-px w-full bg-linear-to-l from-transparent via-accent-300/70 to-transparent" />;
}

export function SecuritySettingsClient() {
  const toast = useToast();
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<'reauth' | 'device' | null>(null);
  const [stepUp, setStepUp] = useState(false);
  const pending = useRef<(() => Promise<void>) | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(API, { cache: 'no-store' });
      if (!r.ok) throw new Error();
      setState((await r.json()) as State);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
    void load();
  }, [load]);

  const handleBlocked = (data: Record<string, unknown>) => {
    if (data.error === 'reauth' || data.error === 'device') {
      setBlocked(data.error);
      return true;
    }
    return false;
  };

  const addPasskey = async () => {
    pending.current = addPasskey;
    setBusy('add');
    try {
      const { res, data } = await post({ action: 'register-options' });
      if (!res.ok) {
        if (!handleBlocked(data)) toast.error('לא הצלחנו להתחיל', String(data.error ?? 'אפשר לנסות שוב'));
        return;
      }
      let response;
      try {
        response = await startRegistration({ optionsJSON: data.options as never });
      } catch {
        toast.info('ההוספה בוטלה', 'אפשר לנסות שוב מתי שנוח');
        return;
      }
      const v = await post({ action: 'register-verify', response });
      if (!v.res.ok) {
        if (!handleBlocked(v.data)) toast.error('ההוספה לא הצליחה', String(v.data.error ?? ''));
        return;
      }
      toast.success('מפתח הגישה נוסף', 'מעכשיו אפשר להיכנס בלי סיסמה');
      await load();
    } finally {
      setBusy(null);
    }
  };

  const removePasskey = async () => {
    if (!removeId) return;
    setBusy('remove');
    try {
      const { res, data } = await post({ action: 'revoke', id: removeId });
      if (!res.ok) toast.error('ההסרה לא הצליחה', String(data.error ?? ''));
      else toast.success('מפתח הגישה הוסר');
      setRemoveId(null);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const regenerate = async () => {
    pending.current = regenerate;
    setBusy('codes');
    try {
      const { res, data } = await post({ action: 'regenerate-codes' });
      setRegenOpen(false);
      if (!res.ok) {
        if (!handleBlocked(data)) toast.error('לא הצלחנו ליצור קודים', 'אפשר לנסות שוב');
        return;
      }
      setSaved(false);
      setCopied(false);
      setCodes(data.codes as string[]);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const copyCodes = async () => {
    if (!codes) return;
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
    } catch {
      toast.error('ההעתקה לא הצליחה', 'אפשר להוריד קובץ במקום');
    }
  };
  const downloadCodes = () => {
    if (!codes) return;
    const text = ['NuraWell · קודי גיבוי לכניסה', 'כל קוד עובד פעם אחת בלבד. כדאי לשמור במקום בטוח.', '', ...codes, ''].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nurawell-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  };

  const reauth = async () => {
    await createClient().auth.signOut({ scope: 'local' });
    window.location.assign('/login?redirect=/settings/security');
  };

  return (
    <div className="container-mobile py-6 pt-6 md:pt-16 pb-10 space-y-5" dir="rtl">
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />

      <header className="relative overflow-hidden rounded-3xl p-6 text-on-dark shadow-[0_18px_50px_rgba(4,120,87,0.28)] bg-linear-to-br from-primary-700 via-secondary-600 to-primary-500">
        <div aria-hidden className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-accent-300/30 blur-3xl" />
        <div aria-hidden className="absolute -bottom-12 right-6 h-36 w-36 rounded-full bg-secondary-200/30 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-on-dark/15 ring-1 ring-accent-200/60 backdrop-blur">
            <ShieldCheck className="h-6 w-6 text-accent-200" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-black" style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}>כניסה ואבטחה</h1>
            <p className="text-sm text-primary-50/90">כניסה מהירה עם הפנים או האצבע, וקודי גיבוי לשעת הצורך</p>
          </div>
        </div>
      </header>

      {blocked ? (
        <section role="alert" className="crystal-surface rounded-2xl border border-accent-300/70 p-5 space-y-3">
          <h2 className="flex items-center gap-2 font-bold text-ink">
            <TriangleAlert className="h-4 w-4 text-accent-600" aria-hidden />
            {blocked === 'reauth' ? 'צריך להתחבר שוב' : 'צריך מכשיר מאושר'}
          </h2>
          <p className="text-sm leading-relaxed text-ink-soft">
            {blocked === 'reauth'
              ? 'כדי להוסיף דרך כניסה חדשה, החיבור צריך להיות מהרבע שעה האחרונה. זה מגן על החשבון אם מישהו אחר משתמש במכשיר.'
              : 'לחשבון ניהול אפשר להוסיף דרכי כניסה רק ממכשיר שכבר אושר. המכשיר הזה עוד לא אושר.'}
          </p>
          {blocked === 'reauth' && (state?.passkeys.length ?? 0) > 0 ? (
            <button type="button" onClick={() => setStepUp(true)} data-testid="security-stepup" className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-linear-to-l from-primary-600 to-secondary-500 font-bold text-on-dark">
              <Smartphone className="h-4 w-4" aria-hidden />לאשר עם Face ID או עם הטלפון
            </button>
          ) : null}
          {blocked === 'reauth' ? (
            <button type="button" onClick={() => void reauth()} className={(state?.passkeys.length ?? 0) > 0 ? 'min-h-[44px] w-full rounded-xl font-bold text-primary-800 ring-1 ring-primary-300/70' : 'min-h-[44px] w-full rounded-xl bg-linear-to-l from-primary-600 to-secondary-500 font-bold text-on-dark'}>
              להתחבר מחדש
            </button>
          ) : null}
          <StepUpDialog open={stepUp} variant="user" purpose="account.security" reason="אישור שינוי בהגדרות האבטחה" onClose={() => setStepUp(false)}
            onVerified={() => { setStepUp(false); setBlocked(null); const next = pending.current; if (next) void next(); }} />
        </section>
      ) : null}

      {loadError ? (
        <section className="crystal-surface rounded-2xl p-5 text-sm font-semibold text-coral-600">
          לא הצלחנו לטעון את ההגדרות.{' '}
          <button type="button" className="underline" onClick={() => void load()}>
            לנסות שוב
          </button>
        </section>
      ) : !state ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary-600" aria-label="טוען" />
        </div>
      ) : (
        <>
          <section className="crystal-surface rounded-2xl p-5 space-y-4" aria-labelledby="pk-h">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-primary-100 to-accent-100 ring-1 ring-accent-300/60">
                <Fingerprint className="h-5 w-5 text-primary-700" aria-hidden />
              </div>
              <div>
                <h2 id="pk-h" className="font-black text-ink" style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}>
                  Face ID וטביעת אצבע
                </h2>
                <p className="text-sm leading-relaxed text-ink-soft">
                  מפתח גישה נשמר רק במכשיר שלך. הכניסה מאושרת בפנים, באצבע או בקוד המכשיר, והמידע הביומטרי לא מגיע אלינו אף פעם.
                </p>
              </div>
            </div>
            <Divider />
            {state.passkeys.length === 0 ? (
              <p className="rounded-xl bg-primary-50/70 p-3 text-sm text-primary-900">עוד אין מפתחות גישה בחשבון.</p>
            ) : (
              <ul className="space-y-2">
                {state.passkeys.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-xl border border-[#cfd0d6] bg-glass/70 backdrop-blur-md p-3">
                    <Smartphone className="h-5 w-5 shrink-0 text-secondary-600" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">{p.label}</p>
                      <p className="text-xs text-ink-faint">
                        נוסף ב־{fmt(p.created_at)} · שימוש אחרון: {fmt(p.last_used_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRemoveId(p.id)}
                      aria-label={`הסרת ${p.label}`}
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-coral-600 hover:bg-coral-50"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {supported ? (
              <button
                type="button"
                onClick={() => void addPasskey()}
                disabled={busy !== null}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-linear-to-l from-primary-600 to-secondary-500 font-bold text-on-dark shadow-[0_8px_24px_rgba(16,185,129,0.35)] disabled:opacity-60"
              >
                {busy === 'add' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Fingerprint className="h-5 w-5" aria-hidden />}
                הוספת מפתח גישה במכשיר הזה
              </button>
            ) : (
              <p className="rounded-xl bg-accent-50 p-3 text-sm text-accent-900">הדפדפן הזה לא תומך במפתחות גישה. אפשר להוסיף מטלפון או ממחשב עדכני.</p>
            )}
          </section>

          {state.backup_codes_enabled ? (
          <section className="crystal-surface rounded-2xl p-5 space-y-4" aria-labelledby="bc-h">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-accent-100 to-secondary-100 ring-1 ring-accent-300/60">
                <KeyRound className="h-5 w-5 text-accent-700" aria-hidden />
              </div>
              <div>
                <h2 id="bc-h" className="font-black text-ink" style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}>
                  קודי גיבוי
                </h2>
                <p className="text-sm leading-relaxed text-ink-soft">
                  10 קודים חד־פעמיים לכניסה כשהמכשיר לא בהישג יד. כל קוד עובד פעם אחת בלבד, ואנחנו שומרים רק גרסה מוצפנת שלו.
                </p>
              </div>
            </div>
            <Divider />
            <div className="flex items-center justify-between rounded-xl border border-[#cfd0d6] bg-glass-hi/80 p-3">
              <span className="text-sm font-bold text-ink">קודים שנשארו</span>
              <span className={`text-lg font-black ${state.backup_codes_left <= 2 ? 'text-coral-600' : 'text-primary-700'}`}>
                {state.backup_codes_left} / 10
              </span>
            </div>
            <button
              type="button"
              onClick={() => (state.backup_codes_left > 0 ? setRegenOpen(true) : void regenerate())}
              disabled={busy !== null}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-accent-400/70 bg-glass/80 backdrop-blur-md font-bold text-accent-800 disabled:opacity-60"
            >
              {busy === 'codes' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
              {state.backup_codes_left > 0 ? 'יצירת קודים חדשים' : 'יצירת קודי גיבוי'}
            </button>
          </section>
          ) : null}
        </>
      )}

      <AnimatedDialog open={removeId !== null} onClose={() => busy === null && setRemoveId(null)} variant="sheet" mobileChromePadding aria-labelledby="rm-h" backdropClassName="absolute inset-0 bg-ink-900/45" panelClassName="crystal-surface max-w-md rounded-2xl p-5 shadow-2xl sm:rounded-2xl">
        <h3 id="rm-h" className="text-lg font-black text-ink">להסיר את מפתח הגישה?</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">אחרי ההסרה לא יהיה אפשר להיכנס איתו. תמיד אפשר להוסיף אותו שוב.</p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={() => void removePasskey()} disabled={busy !== null} className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-coral-600 font-bold text-on-dark disabled:opacity-50">
            {busy === 'remove' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            כן, להסיר
          </button>
          <button type="button" onClick={() => setRemoveId(null)} disabled={busy !== null} className="min-h-[44px] rounded-xl border border-hairline px-4 font-bold text-ink-soft">
            ביטול
          </button>
        </div>
      </AnimatedDialog>

      <AnimatedDialog open={regenOpen} onClose={() => busy === null && setRegenOpen(false)} variant="sheet" mobileChromePadding aria-labelledby="rg-h" backdropClassName="absolute inset-0 bg-ink-900/45" panelClassName="crystal-surface max-w-md rounded-2xl p-5 shadow-2xl sm:rounded-2xl">
        <h3 id="rg-h" className="text-lg font-black text-ink">ליצור קודים חדשים?</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">כל הקודים הקודמים יפסיקו לעבוד מיד, ויוצגו 10 קודים חדשים פעם אחת בלבד.</p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={() => void regenerate()} disabled={busy !== null} className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-linear-to-l from-accent-500 to-accent-600 font-bold text-on-dark disabled:opacity-50">
            {busy === 'codes' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            כן, ליצור חדשים
          </button>
          <button type="button" onClick={() => setRegenOpen(false)} disabled={busy !== null} className="min-h-[44px] rounded-xl border border-hairline px-4 font-bold text-ink-soft">
            ביטול
          </button>
        </div>
      </AnimatedDialog>

      <AnimatedDialog open={codes !== null} onClose={() => saved && setCodes(null)} dismissOnBackdrop={false} variant="center" aria-labelledby="codes-h" backdropClassName="absolute inset-0 bg-ink-900/55" panelClassName="crystal-surface max-w-md rounded-3xl p-6 shadow-2xl">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-accent-200 to-primary-200 ring-1 ring-accent-400/60">
          <KeyRound className="h-6 w-6 text-accent-800" aria-hidden />
        </div>
        <h3 id="codes-h" className="text-center text-xl font-black text-ink" style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}>
          קודי הגיבוי שלך
        </h3>
        <p className="mt-1 text-center text-sm text-ink-soft">הם מוצגים עכשיו בפעם היחידה. כדאי לשמור אותם במקום בטוח.</p>
        <div className="my-4 h-px bg-linear-to-l from-transparent via-accent-300/80 to-transparent" aria-hidden />
        <ol dir="ltr" className="grid grid-cols-2 gap-2">
          {(codes ?? []).map((c) => (
            <li key={c} className="rounded-xl border border-[#cfd0d6] bg-glass/85 backdrop-blur-md py-2 text-center font-mono text-[15px] font-bold tracking-wider text-ink">
              {c}
            </li>
          ))}
        </ol>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void copyCodes()} className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-primary-300 bg-glass/80 backdrop-blur-md font-bold text-primary-800">
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? 'הועתק' : 'העתקה'}
          </button>
          <button type="button" onClick={downloadCodes} className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-primary-300 bg-glass/80 backdrop-blur-md font-bold text-primary-800">
            <Download className="h-4 w-4" aria-hidden />
            הורדה
          </button>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-ink-soft">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="h-4 w-4 accent-primary-600" />
          שמרתי את הקודים במקום בטוח
        </label>
        <button type="button" onClick={() => setCodes(null)} disabled={!saved} className="mt-3 min-h-[48px] w-full rounded-xl bg-linear-to-l from-primary-600 to-secondary-500 font-bold text-on-dark disabled:opacity-40">
          סיום
        </button>
      </AnimatedDialog>
    </div>
  );
}
