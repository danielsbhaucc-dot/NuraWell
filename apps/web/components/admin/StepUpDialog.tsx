'use client';

import { sanitizeSvg } from '@/lib/sanitize-lesson-html';
import { useCallback, useEffect, useRef, useState } from 'react';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { CheckCircle2, Fingerprint, KeyRound, Loader2, ShieldCheck, Smartphone, X } from 'lucide-react';
import { opsGlassBtnClass, opsGlassBtnPrimaryClass, opsInputClass } from '@/components/admin/OpsPanel';
import { cn } from '@/lib/cn';

/**
 * Step-up sheet for sensitive Ops actions. Primary: QR → approve with Face ID on the phone.
 * Also: Face ID / passkey on this device, authenticator-app code, one-time backup code.
 * On success the server sets a single-use grant cookie for `purpose`; call the protected route right after.
 * Usage: <StepUpDialog open purpose="ops.sensitive" reason="יצירת גיבוי מפתחות" onClose={..} onVerified={..} />
 */
type Methods = { totp: boolean; backup_left: number; passkeys: number };
export type StepUpVariant = 'ops' | 'user' | 'login';
const APIS: Record<StepUpVariant, string> = { ops: '/api/v1/ops/stepup', user: '/api/v1/account/stepup', login: '/api/v1/auth/qr' };

export function StepUpDialog({ open, purpose, reason, onClose, onVerified, variant = 'ops', eyebrow }: { open: boolean; purpose: string; reason: string; onClose: () => void; onVerified: () => void; variant?: StepUpVariant; eyebrow?: string }) {
  const API = APIS[variant];
  const post = useCallback((b: unknown) => fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }), [API]);
  const [m, setM] = useState<Methods | null>(null);
  const [mode, setMode] = useState<'qr' | 'totp' | 'backup'>('qr');
  const [qr, setQr] = useState<{ id: string; svg: string; expires: number; match: string } | null>(null);
  const [left, setLeft] = useState(0);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const finish = useCallback(() => { setDone(true); if (poll.current) clearInterval(poll.current); setTimeout(onVerified, 650); }, [onVerified]);

  const startQr = useCallback(async () => {
    setErr(null); setQr(null);
    const r = await post(variant === 'login' ? { op: 'start' } : { op: 'start', purpose });
    if (r.status === 409) { setErr('כדי לאשר מהטלפון צריך קודם להוסיף בו מפתח גישה (Face ID) בהגדרות האבטחה.'); return; }
    if (!r.ok) { setErr('לא הצלחנו ליצור קוד. נסו שוב.'); return; }
    const d = (await r.json()) as { id: string; url: string; expires_at: string; match_code: string };
    const QR = await import('qrcode');
    const svg = await QR.toString(d.url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b2a25', light: '#00000000' } });
    setQr({ id: d.id, svg, expires: Date.parse(d.expires_at), match: d.match_code });
    if (poll.current) clearInterval(poll.current);
    poll.current = setInterval(async () => {
      const p = await post({ op: 'poll', id: d.id }).then((x) => x.json()).catch(() => null) as { status?: string } | null;
      if (p?.status === 'approved') finish();
      else if (p?.status === 'denied') { if (poll.current) clearInterval(poll.current); setErr('הבקשה בוטלה בטלפון.'); }
      else if (p?.status === 'expired') { if (poll.current) clearInterval(poll.current); }
    }, 1500);
  }, [purpose, finish, post, variant]);

  useEffect(() => {
    if (!open) { if (poll.current) clearInterval(poll.current); setDone(false); setCode(''); setErr(null); return; }
    if (variant !== 'login') post({ op: 'methods' }).then((r) => r.json()).then(setM).catch(() => undefined);
    void startQr();
    return () => { if (poll.current) clearInterval(poll.current); };
  }, [open, startQr, post, variant]);
  useEffect(() => {
    if (!qr) return;
    const t = setInterval(() => setLeft(Math.max(0, Math.round((qr.expires - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [qr]);

  const passkeyHere = async () => {
    setErr(null); setBusy(true);
    try {
      const c = await post({ op: 'passkey_challenge' });
      const { options } = await c.json();
      const response = await startAuthentication({ optionsJSON: options });
      const r = await post({ op: 'passkey', purpose, response });
      if (!r.ok) throw new Error();
      finish();
    } catch { setErr('האימות לא הושלם. אפשר לנסות שוב או לבחור דרך אחרת.'); } finally { setBusy(false); }
  };
  const submitCode = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await post({ op: mode === 'totp' ? 'totp' : 'backup', purpose, code });
      if (r.status === 429) { setErr('יותר מדי ניסיונות. נסו שוב בעוד רבע שעה.'); return; }
      if (!r.ok) { setErr('הקוד לא נכון. בודקים ומקלידים שוב.'); return; }
      finish();
    } finally { setBusy(false); }
  };

  if (!open) return null;
  const tab = (k: typeof mode, label: string, show = true) => show ? <button type="button" onClick={() => { setMode(k); setErr(null); setCode(''); }} className={cn('flex-1 rounded-2xl px-3 py-2 text-[13px] font-bold transition', mode === k ? 'bg-primary-800 text-accent-50 shadow' : 'text-ink-soft hover:bg-glass/50')}>{label}</button> : null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-end bg-primary-950/45 backdrop-blur-sm sm:place-items-center" role="dialog" aria-modal="true" aria-label="אימות זהות" dir="rtl" data-testid="stepup-dialog">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[30px] border border-accent-200/40 bg-[linear-gradient(160deg,rgba(232,232,237,0.95),rgba(242,242,246,0.93))] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl sm:rounded-[30px]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-wide text-accent-700">{eyebrow ?? (variant === 'login' ? 'כניסה עם הטלפון' : 'אימות לפני פעולה רגישה')}</p>
            <h3 className="font-[Rubik] text-lg font-bold text-ink">{reason}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="סגירה" className="rounded-full p-1.5 text-ink-soft hover:bg-glass/50"><X size={18} /></button>
        </div>
        {done ? (
          <div className="grid place-items-center gap-2 py-10 text-primary-800"><CheckCircle2 size={44} /><p className="font-bold">אומת. ממשיכים…</p></div>
        ) : (
          <>
            {variant === 'ops' && (m?.totp || (m?.backup_left ?? 0) > 0) ? (
              <div className="mb-4 flex gap-1 rounded-3xl border border-gc/50 bg-glass/30 p-1">
              {tab('qr', 'עם הטלפון')}{tab('totp', 'אפליקציית קודים', variant === 'ops' && !!m?.totp)}{tab('backup', 'קוד גיבוי', variant === 'ops' && (m?.backup_left ?? 0) > 0)}
              </div>
            ) : null}
            {mode === 'qr' ? (
              <div className="text-center">
                <p className="mb-3 text-sm text-ink-soft">{variant === 'login' ? 'סורקים במצלמה של טלפון שכבר מחובר לחשבון, ומאשרים שם עם Face ID. המסך הזה ייכנס לבד.' : 'סורקים במצלמה של הטלפון שלך ומאשרים שם עם Face ID. המסך הזה ימשיך לבד.'}</p>
                <div className="mx-auto grid h-52 w-52 place-items-center rounded-[26px] border border-accent-300/50 bg-accent-50/40 p-3 shadow-inner" data-testid="stepup-qr">
                  {qr ? <div className="h-full w-full [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: sanitizeSvg(qr.svg) }} /> : <Loader2 className="animate-spin text-ink-faint" />}
                </div>
                {qr?.match ? (
                  <div className="mx-auto mt-3 flex w-fit items-center gap-3 rounded-2xl border border-primary-700/25 bg-primary-900/[0.06] px-4 py-2" data-testid="stepup-match">
                    <span className="text-[13px] font-bold text-ink-soft">בטלפון בוחרים את המספר</span>
                    <span className="font-[Rubik] text-3xl font-bold tabular-nums tracking-wider text-primary-900" dir="ltr">{qr.match}</span>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap justify-center gap-2 text-[11.5px] font-bold">
                  {qr && left > 0 ? <span className="rounded-full border border-primary-300/60 bg-primary-500/10 px-2.5 py-1 text-primary-800">בתוקף עוד {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
                    : qr ? <button type="button" onClick={() => void startQr()} className="rounded-full border border-accent-300/60 bg-accent-500/10 px-2.5 py-1 text-accent-800">הקוד פג. ליצור חדש</button> : null}
                  <span className="rounded-full border border-primary-300/60 bg-primary-500/10 px-2.5 py-1 text-primary-800"><ShieldCheck size={12} className="inline" /> קשור למסך הזה בלבד · חד-פעמי</span>
                </div>
                {variant !== 'login' && browserSupportsWebAuthn() ? (
                  <button type="button" onClick={() => void passkeyHere()} disabled={busy} className={cn(opsGlassBtnClass, 'mt-4 w-full justify-center gap-2')}>
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <Fingerprint size={16} />}Face ID או טביעת אצבע במכשיר הזה
                  </button>
                ) : null}
              </div>
            ) : (
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm text-ink-soft">{mode === 'totp' ? <><Smartphone size={16} />מקלידים את 6 הספרות מאפליקציית הקודים</> : <><KeyRound size={16} />מקלידים אחד מקודי הגיבוי. כל קוד עובד פעם אחת.</>}</p>
                <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && code) void submitCode(); }} inputMode={mode === 'totp' ? 'numeric' : 'text'} autoComplete="one-time-code" dir="ltr" maxLength={mode === 'totp' ? 6 : 12}
                  placeholder={mode === 'totp' ? '123456' : 'ABCDE-FGHJK'} className={cn(opsInputClass, 'text-center font-mono text-xl tracking-[0.35em]')} data-testid="stepup-code" />
                <button type="button" onClick={() => void submitCode()} disabled={busy || !code} className={cn(opsGlassBtnPrimaryClass, 'mt-3 w-full justify-center')}>{busy ? <Loader2 size={16} className="animate-spin" /> : 'אימות'}</button>
                {mode === 'backup' && m ? <p className="mt-2 text-center text-[11px] text-ink-faint">נשארו {m.backup_left} קודים</p> : null}
              </div>
            )}
            {err ? <p role="alert" className="mt-3 rounded-xl border border-coral-300/60 bg-coral-100/50 px-3 py-2 text-sm font-semibold text-coral-800">{err}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}
