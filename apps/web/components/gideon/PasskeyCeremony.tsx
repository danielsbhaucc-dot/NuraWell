'use client';

import { useEffect, useState } from 'react';

const enc = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

/** Same-origin relative path only (no scheme, no //, no backslashes). */
function safeNext(raw: string | null): string | null {
  if (!raw || !/^\/[A-Za-z0-9/_\-?=&.%]*$/.test(raw) || raw.startsWith('//')) return null;
  const u = new URL(raw, window.location.origin);
  return u.origin === window.location.origin ? `${u.pathname}${u.search}` : null;
}

type Opts = { purpose: string; challenge: string; rpId: string; summary?: string | null; allow?: string[]; user?: { id: string; name: string; displayName: string } };

/** Face ID / fingerprint ceremony for a one-time Gideon link (register or verify). */
export function PasskeyCeremony({ mode }: { mode: 'register' | 'verify' }) {
  const [opts, setOpts] = useState<Opts | null>(null);
  const [msg, setMsg] = useState<string>('טוען…');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const token = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('t') ?? '' : '';

  useEffect(() => {
    void (async () => {
      if (!token) return setMsg('הקישור לא תקף.');
      const r = await fetch('/api/v1/ceo/stepup/options', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: token }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setMsg(d.error ?? 'הקישור לא תקף.');
      setOpts(d);
      setMsg('');
    })();
  }, [token]);

  const run = async () => {
    if (!opts) return;
    setBusy(true);
    setMsg('');
    try {
      if (mode === 'register') {
        const cred = (await navigator.credentials.create({
          publicKey: {
            challenge: dec(opts.challenge),
            rp: { id: opts.rpId, name: 'NuraWell Gideon' },
            user: { id: dec(opts.user!.id), name: opts.user!.name, displayName: opts.user!.displayName },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
            authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
            attestation: 'none',
            timeout: 60_000,
          },
        })) as PublicKeyCredential;
        const res = cred.response as AuthenticatorAttestationResponse;
        const pk = res.getPublicKey();
        if (!pk) throw new Error('הדפדפן לא תומך');
        const label = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : 'מחשב';
        const r = await fetch('/api/v1/ceo/stepup/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ t: token, credentialId: enc(cred.rawId), clientDataJSON: enc(res.clientDataJSON), authenticatorData: enc(res.getAuthenticatorData()), publicKey: enc(pk), alg: res.getPublicKeyAlgorithm(), label }),
        });
        const d = await r.json().catch(() => ({}));
        setMsg(r.ok ? '✅ Face ID נרשם. אפשר לסגור את החלון.' : d.error ?? 'הרישום נכשל.');
        setDone(r.ok);
      } else {
        const cred = (await navigator.credentials.get({
          publicKey: { challenge: dec(opts.challenge), rpId: opts.rpId, allowCredentials: (opts.allow ?? []).map((id) => ({ type: 'public-key' as const, id: dec(id) })), userVerification: 'required', timeout: 60_000 },
        })) as PublicKeyCredential;
        const res = cred.response as AuthenticatorAssertionResponse;
        const r = await fetch('/api/v1/ceo/stepup/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ t: token, credentialId: enc(cred.rawId), clientDataJSON: enc(res.clientDataJSON), authenticatorData: enc(res.authenticatorData), signature: enc(res.signature) }),
        });
        const d = await r.json().catch(() => ({}));
        const next = safeNext(new URLSearchParams(window.location.search).get('next'));
        if (r.ok && next) {
          window.location.replace(next);
          return;
        }
        setMsg(r.ok ? `✅ ${d.text ?? 'אומת'}${opts.purpose === 'approve' ? '\nאפשר לחזור לטלגרם.' : ''}` : d.error ?? 'האימות נכשל.');
        setDone(r.ok);
      }
    } catch {
      setMsg('האימות בוטל או נכשל. אפשר לנסות שוב.');
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'register' ? 'רישום Face ID' : opts?.purpose === 'unlock' ? 'שחרור גדעון' : opts?.purpose === 'ops_login' ? 'כניסה ללוח הבקרה' : 'אישור פעולה רגישה';
  return (
    <main dir="rtl" className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="text-5xl">🔐</div>
      <h1 className="text-xl font-bold">{title}</h1>
      {opts?.summary ? <p className="rounded-2xl bg-slate-100 px-4 py-3 text-base">{opts.summary}</p> : null}
      {opts && !done ? (
        <button onClick={run} disabled={busy} className="w-full rounded-2xl bg-emerald-700 px-5 py-4 text-lg font-semibold text-white disabled:opacity-60">
          {busy ? 'מאמת…' : mode === 'register' ? 'רשום עם Face ID / טביעת אצבע' : 'אשר עם Face ID / טביעת אצבע'}
        </button>
      ) : null}
      {msg ? <p className="whitespace-pre-line text-base text-slate-700">{msg}</p> : null}
    </main>
  );
}
