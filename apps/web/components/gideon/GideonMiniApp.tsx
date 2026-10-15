'use client';

import { useEffect, useState } from 'react';

type Bio = {
  inited: boolean;
  isBiometricAvailable: boolean;
  biometricType: 'finger' | 'face' | 'unknown';
  isAccessGranted: boolean;
  deviceId: string;
  init: (cb?: () => void) => void;
  requestAccess: (p: { reason?: string }, cb?: (granted: boolean) => void) => void;
  authenticate: (p: { reason?: string }, cb?: (ok: boolean, token?: string) => void) => void;
  updateBiometricToken: (token: string, cb?: (ok: boolean) => void) => void;
};
type WebApp = { initData: string; ready: () => void; expand: () => void; close: () => void; BiometricManager: Bio; HapticFeedback?: { notificationOccurred: (t: 'success' | 'error') => void } };
declare global { interface Window { Telegram?: { WebApp?: WebApp } } }

const KEY_PREFIX = 'nwg1:'; // stored token = prefix + deviceId + ':' + secret

function waitForTg(): Promise<WebApp | null> {
  return new Promise((resolve) => {
    let n = 0;
    const tick = () => {
      const w = window.Telegram?.WebApp;
      if (w?.initData) return resolve(w);
      if (++n > 40) return resolve(null);
      setTimeout(tick, 100);
    };
    tick();
  });
}

export function GideonMiniApp() {
  const [info, setInfo] = useState<{ purpose: string; summary: string | null } | null>(null);
  const [msg, setMsg] = useState('טוען…');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [tg, setTg] = useState<WebApp | null>(null);
  const token = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('t') ?? '' : '';

  useEffect(() => {
    void (async () => {
      const w = await waitForTg();
      if (!w) return setMsg('הדף הזה נפתח רק מתוך גדעון בטלגרם.');
      w.ready();
      w.expand();
      setTg(w);
      const r = await fetch('/api/v1/ceo/miniapp/info', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: token }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setMsg(d.error ?? 'הכפתור לא תקף.');
      await new Promise<void>((res) => w.BiometricManager.init(() => res()));
      if (!w.BiometricManager.isBiometricAvailable) return setMsg('Face ID / טביעת אצבע לא זמינים במכשיר הזה (או שטלגרם לא מעודכן).');
      setInfo(d);
      setMsg('');
    })();
  }, [token]);

  const finish = (ok: boolean, text: string) => {
    tg?.HapticFeedback?.notificationOccurred(ok ? 'success' : 'error');
    setMsg(text);
    setDone(ok);
    if (ok) setTimeout(() => tg?.close(), 1500);
  };

  const run = async () => {
    if (!tg || !info) return;
    const bio = tg.BiometricManager;
    setBusy(true);
    try {
      if (!bio.isAccessGranted) {
        const granted = await new Promise<boolean>((res) => bio.requestAccess({ reason: 'גדעון משתמש ב-Face ID לאישור פעולות רגישות' }, res));
        if (!granted) return finish(false, 'צריך לאשר גישה ל-Face ID בהגדרות הבוט.');
      }
      if (info.purpose === 'register') {
        const r = await fetch('/api/v1/ceo/miniapp/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: token, initData: tg.initData, label: bio.biometricType === 'face' ? 'Face ID' : 'טביעת אצבע' }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return finish(false, d.error ?? 'הרישום נכשל.');
        const saved = await new Promise<boolean>((res) => bio.updateBiometricToken(`${KEY_PREFIX}${d.deviceId}:${d.secret}`, res));
        if (!saved) return finish(false, 'השמירה ב-Face ID נכשלה. בקש מגדעון רישום מחדש.');
        const c = await fetch('/api/v1/ceo/miniapp/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true, initData: tg.initData, deviceId: d.deviceId, secret: d.secret }) });
        return finish(c.ok, c.ok ? '✅ Face ID נרשם. מעכשיו פעולות רגישות יאושרו כאן.' : 'ההפעלה נכשלה. בקש מגדעון רישום מחדש.');
      }
      const [ok, stored] = await new Promise<[boolean, string | undefined]>((res) => bio.authenticate({ reason: info.summary ?? 'אישור פעולה' }, (a, t) => res([a, t])));
      if (!ok || !stored?.startsWith(KEY_PREFIX)) return finish(false, 'האימות בוטל או שהמכשיר לא רשום.');
      const [deviceId, secret] = stored.slice(KEY_PREFIX.length).split(':');
      const r = await fetch('/api/v1/ceo/miniapp/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: token, initData: tg.initData, deviceId, secret }) });
      const d = await r.json().catch(() => ({}));
      finish(r.ok && d.ok !== false, r.ok ? `✅ ${d.text ?? 'אומת'}` : d.error ?? 'האימות נכשל.');
    } catch {
      finish(false, 'משהו השתבש. נסה שוב.');
    } finally {
      setBusy(false);
    }
  };

  const title = info?.purpose === 'register' ? 'רישום Face ID' : info?.purpose === 'unlock' ? 'שחרור גדעון' : 'אישור עם Face ID';
  return (
    <main dir="rtl" className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="text-5xl">🔐</div>
      <h1 className="text-xl font-bold">{title}</h1>
      {info?.summary ? <p className="rounded-2xl bg-slate-100 px-4 py-3 text-base">{info.summary}</p> : null}
      {info && !done ? (
        <button onClick={run} disabled={busy} className="w-full rounded-2xl bg-emerald-700 px-5 py-4 text-lg font-semibold text-white disabled:opacity-60">
          {busy ? 'מאמת…' : info.purpose === 'register' ? 'רשום Face ID' : 'אשר עם Face ID'}
        </button>
      ) : null}
      {msg ? <p className="whitespace-pre-line text-base text-slate-700">{msg}</p> : null}
    </main>
  );
}
