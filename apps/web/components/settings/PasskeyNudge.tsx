'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import { Loader2, ShieldCheck, Zap } from 'lucide-react';
import { AnimatedDialog } from '@/components/shared/AnimatedDialog';
import { ToastContainer, useToast } from '@/components/shared/Toast';
import { AFTER_LOGIN_KEY } from '@/lib/auth/passkey-nudge';
import { useGx } from '@/components/providers/UserGenderProvider';

const API = '/api/v1/account/passkey-nudge';
const SEC = '/api/v1/account/security';

const isApple = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

/** Friendly face-scan frame: a gold key whose bow becomes a smiling face inside a scanning frame. */
export function FaceKeyArt() {
  return (
    <div className="pk-art relative mx-auto h-[148px] w-[148px]" aria-hidden>
      <div className="pk-halo absolute inset-0 rounded-full" />
      <svg viewBox="0 0 148 148" className="relative h-full w-full">
        <defs>
          <linearGradient id="pkFace" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5EEAD4" />
            <stop offset="1" stopColor="#10B981" />
          </linearGradient>
          <linearGradient id="pkGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F6D58E" />
            <stop offset="1" stopColor="#C8973A" />
          </linearGradient>
          <clipPath id="pkClip"><rect x="30" y="26" width="88" height="88" rx="26" /></clipPath>
        </defs>
        {/* scan frame corners */}
        <g className="pk-corners" fill="none" stroke="url(#pkGold)" strokeWidth="4" strokeLinecap="round">
          <path d="M30 48 V40 a14 14 0 0 1 14 -14 H52" />
          <path d="M96 26 H104 a14 14 0 0 1 14 14 V48" />
          <path d="M118 92 V100 a14 14 0 0 1 -14 14 H96" />
          <path d="M52 114 H44 a14 14 0 0 1 -14 -14 V92" />
        </g>
        {/* face = key bow */}
        <g className="pk-face">
          <circle cx="74" cy="70" r="27" fill="rgba(16,185,129,0.12)" stroke="url(#pkFace)" strokeWidth="3.5" />
          <circle cx="64.5" cy="65" r="3.2" fill="#A7F3D0" />
          <circle cx="83.5" cy="65" r="3.2" fill="#A7F3D0" />
          <path d="M63 77 q11 10 22 0" fill="none" stroke="#A7F3D0" strokeWidth="3.2" strokeLinecap="round" />
        </g>
        {/* key shaft + teeth (gold), hanging from the face */}
        <g className="pk-key" stroke="#D9AE57" strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M74 97 V132" />
          <path d="M74 118 H84" />
          <path d="M74 127 H81" />
        </g>
        <g clipPath="url(#pkClip)">
          <rect className="pk-scan" x="30" y="26" width="88" height="3" rx="1.5" fill="#5EEAD4" opacity="0.85" />
        </g>
        <circle className="pk-spark" cx="120" cy="22" r="3" fill="#F6D58E" />
        <circle className="pk-spark pk-spark2" cx="24" cy="120" r="2.2" fill="#F6D58E" />
      </svg>
      <style>{`
        .pk-halo{background:radial-gradient(circle at 50% 45%,rgba(45,212,191,.35),rgba(16,185,129,.08) 55%,transparent 70%);animation:pkPulse 3.2s ease-in-out infinite}
        .pk-corners{transform-origin:74px 70px;animation:pkIn .7s cubic-bezier(.2,.9,.3,1.2) both}
        .pk-face{transform-origin:74px 70px;animation:pkPop .6s .15s cubic-bezier(.2,.9,.3,1.3) both}
        .pk-key{animation:pkDrop .6s .35s ease-out both}
        .pk-scan{animation:pkScan 2.4s .8s ease-in-out infinite}
        .pk-spark{animation:pkTw 2.6s ease-in-out infinite}.pk-spark2{animation-delay:1.1s}
        @keyframes pkIn{from{opacity:0;transform:scale(1.25)}to{opacity:1;transform:none}}
        @keyframes pkPop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
        @keyframes pkDrop{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
        @keyframes pkScan{0%{transform:translateY(0);opacity:0}15%{opacity:.85}85%{opacity:.85}100%{transform:translateY(85px);opacity:0}}
        @keyframes pkPulse{0%,100%{transform:scale(.94);opacity:.8}50%{transform:scale(1.04);opacity:1}}
        @keyframes pkTw{0%,100%{opacity:.25}50%{opacity:1}}
        @media (prefers-reduced-motion: reduce){.pk-art *{animation:none!important}.pk-scan{opacity:0}}
      `}</style>
    </div>
  );
}

export function PasskeyNudgeSheet({ open, apple, busy, onEnable, onLater }: { open: boolean; apple: boolean; busy: boolean; onEnable: () => void; onLater: () => void }) {
  const g = useGx();
  const method = apple ? 'Face ID' : 'טביעת אצבע או פתיחת מסך';
  return (
    <AnimatedDialog
      open={open}
      onClose={() => !busy && onLater()}
      variant="sheet"
      mobileChromePadding
      aria-labelledby="pk-nudge-h"
      backdropClassName="absolute inset-0 bg-[#04120E]/60 backdrop-blur-[3px]"
      panelClassName="pk-sheet max-w-md overflow-hidden rounded-t-[28px] p-0 shadow-[0_-12px_48px_rgba(4,18,14,0.45)] sm:rounded-[28px]"
    >
      <div dir="rtl" className="relative px-6 pb-6 pt-3 text-center" style={{ background: 'linear-gradient(165deg,rgba(13,43,37,.94) 0%,rgba(9,32,30,.96) 55%,rgba(7,24,26,.98) 100%)', backdropFilter: 'blur(22px) saturate(160%)', WebkitBackdropFilter: 'blur(22px) saturate(160%)' }}>
        <div aria-hidden className="pointer-events-none absolute inset-0 rounded-t-[28px] ring-1 ring-inset ring-white/10" />
        <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-teal-400/20 blur-3xl" />
        <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-elevated/25 sm:hidden" />
        <FaceKeyArt />
        <h2 id="pk-nudge-h" className="mt-3 text-[22px] font-black leading-tight text-white" style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}>
          {g({ m: 'רוצה', f: 'רוצה', n: 'רוצים' })} להיכנס בפעם הבאה עם <span className="whitespace-nowrap"><span className="text-[#F3CF7A]">{apple ? <bdi>Face ID</bdi> : method}</span>?</span>
        </h2>
        <p className="mx-auto mt-2 max-w-[300px] text-[15px] leading-relaxed text-emerald-50/80">מהיר ובטוח יותר מסיסמה. מבט אחד או נגיעה אחת, ואת הסיסמה אין צורך להקליד.</p>
        <div className="mx-auto mt-4 flex max-w-[320px] items-center justify-center gap-2 text-[12.5px] font-semibold text-emerald-100/85">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-elevated/[.07] px-3 py-1.5 ring-1 ring-white/10"><Zap className="h-3.5 w-3.5 text-[#F3CF7A]" aria-hidden />שנייה אחת</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-elevated/[.07] px-3 py-1.5 ring-1 ring-white/10"><ShieldCheck className="h-3.5 w-3.5 text-[#F3CF7A]" aria-hidden />נשאר רק במכשיר</span>
        </div>
        <div aria-hidden className="mx-auto my-5 h-px w-2/3 bg-[linear-gradient(90deg,transparent,rgba(243,207,122,.55),transparent)]" />
        <button type="button" onClick={onEnable} disabled={busy} className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(180deg,#14B8A6,#0F8F7E)] text-[17px] font-black text-white shadow-[0_10px_28px_rgba(20,184,166,.35),inset_0_1px_0_rgba(255,255,255,.25)] ring-1 ring-[#F3CF7A]/40 transition active:scale-[.98] disabled:opacity-60">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
          להפעיל
        </button>
        <button type="button" onClick={onLater} disabled={busy} className="mt-2 min-h-[46px] w-full rounded-2xl text-[15px] font-bold text-emerald-100/75 transition hover:text-white">
          אולי אחר כך
        </button>
        <p className="mt-1 text-[11.5px] text-emerald-100/45">אפשר לשנות בכל רגע בהגדרות, תחת כניסה ואבטחה</p>
      </div>
    </AnimatedDialog>
  );
}

/** Mounted once in the dashboard layout. Shows only right after a password login, max 3 times, 30 days apart. */
export function PasskeyNudgeHost({ allowed }: { allowed: boolean }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [apple, setApple] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!allowed || started.current || process.env.NEXT_PUBLIC_PASSKEY_NUDGE !== '1') return;
    started.current = true;
    let marker: string | null = null;
    try {
      marker = sessionStorage.getItem(AFTER_LOGIN_KEY);
      sessionStorage.removeItem(AFTER_LOGIN_KEY);
    } catch {}
    if (!marker || Date.now() - Number(marker) > 10 * 60_000) return;
    const t = window.setTimeout(async () => {
      // never on top of another sheet (consent, onboarding, welcome)
      if (document.querySelector('[role="dialog"]')) return;
      if (!browserSupportsWebAuthn()) return;
      const pa = await window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(() => false);
      if (!pa) return;
      const r = await fetch(API, { cache: 'no-store' }).catch(() => null);
      if (!r?.ok || !((await r.json()) as { eligible?: boolean }).eligible) return;
      if (document.querySelector('[role="dialog"]')) return;
      setApple(isApple());
      setOpen(true);
      void fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'shown' }) });
    }, 2500);
    return () => window.clearTimeout(t);
  }, [allowed]);

  const mark = (action: 'dismissed' | 'enrolled') => fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }).catch(() => null);

  const later = useCallback(() => {
    setOpen(false);
    void mark('dismissed');
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const post = (body: unknown) => fetch(SEC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const o = await post({ action: 'register-options' });
      const od = (await o.json().catch(() => ({}))) as { options?: unknown };
      if (!o.ok || !od.options) throw new Error('options');
      let response;
      try {
        response = await startRegistration({ optionsJSON: od.options as never });
      } catch {
        setBusy(false);
        return; // user cancelled the system prompt; keep the sheet so they can choose
      }
      const v = await post({ action: 'register-verify', response });
      if (!v.ok) throw new Error('verify');
      await mark('enrolled');
      setOpen(false);
      toast.success(apple ? 'Face ID מוכן' : 'הכניסה המהירה מוכנה', 'בפעם הבאה נכנסים בלי סיסמה');
    } catch {
      toast.error('ההפעלה לא הצליחה', 'אפשר לנסות שוב בהגדרות, תחת כניסה ואבטחה');
      setOpen(false);
      void mark('dismissed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PasskeyNudgeSheet open={open} apple={apple} busy={busy} onEnable={() => void enable()} onLater={later} />
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
    </>
  );
}
