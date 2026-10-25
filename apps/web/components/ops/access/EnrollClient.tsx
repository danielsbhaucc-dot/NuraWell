'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { Banner, Button, Card, CardTitle, Input, LoadingState } from '@/components/ui';

type Step = 'opening' | 'gone' | 'factor' | 'match' | 'register' | 'done';
async function call(body: Record<string, unknown>): Promise<{ status: number; j: Record<string, unknown> }> {
  const r = await fetch('/api/v1/ops/enroll', { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, j: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

export function EnrollClient({ token }: { token: string }) {
  const [step, setStep] = useState<Step>('opening');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [num, setNum] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    void call({ action: 'open', token }).then(({ status }) => setStep(status === 200 ? 'factor' : 'gone'));
    window.history.replaceState(null, '', '/k/-'); // keep the token out of history
  }, [token]);

  useEffect(() => {
    if (step !== 'match') return;
    const t = setInterval(async () => {
      const { status, j } = await call({ action: 'status' });
      if (status !== 200) { setStep('gone'); return; }
      if (j.stage === 'approved') setStep('register');
      else if (j.stage === 'rejected' || j.stage === 'expired') { setErr('הבקשה נדחתה או שפג תוקפה. בקשו קישור חדש מגדעון.'); setStep('gone'); }
    }, 2000);
    return () => clearInterval(t);
  }, [step]);

  const submitFactor = useCallback(async (method: 'backup' | 'passkey') => {
    setBusy(true); setErr(null);
    try {
      let response: unknown;
      if (method === 'passkey') {
        const o = await call({ action: 'factor_options' });
        if (o.status !== 200) { setErr(String(o.j.error ?? 'לא זמין')); return; }
        response = await startAuthentication({ optionsJSON: o.j.options as never });
      }
      const { status, j } = await call({ action: 'factor', email, password, method, code: method === 'backup' ? code : undefined, response });
      if (status === 200 && typeof j.number === 'number') { setNum(j.number); setStep('match'); }
      else if (status === 404) setStep('gone');
      else setErr(String(j.error ?? 'הפרטים לא אומתו.'));
    } catch { setErr('האימות בוטל או נכשל. נסו שוב.'); } finally { setBusy(false); }
  }, [email, password, code]);

  const register = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const o = await call({ action: 'register_options' });
      if (o.status !== 200) { setErr(String(o.j.error ?? 'לא זמין')); return; }
      const response = await startRegistration({ optionsJSON: o.j.options as never });
      const r = await call({ action: 'register', response });
      if (r.status === 200) setStep('done');
      else setErr(String(r.j.error ?? 'הרישום נכשל.'));
    } catch { setErr('יצירת הפאסקי בוטלה. נסו שוב.'); } finally { setBusy(false); }
  }, []);

  if (step === 'done') return <main dir="rtl" className="mx-auto max-w-md p-6"><Banner tone="success" title="המכשיר נרשם">אפשר להתחבר כרגיל מהמכשיר הזה.</Banner></main>;
  if (step === 'opening') return <main dir="rtl" className="mx-auto max-w-md p-6"><LoadingState /></main>;
  if (step === 'gone') return <main dir="rtl" className="mx-auto max-w-md p-6"><Card><CardTitle>הדף לא נמצא</CardTitle>{err ? <Banner tone="warn" title={err} /> : null}</Card></main>;

  return (
    <main dir="rtl" className="mx-auto max-w-md p-6">
      <Card className="space-y-4">
        <CardTitle>רישום מכשיר</CardTitle>
        {err ? <Banner tone="danger" title={err} /> : null}
        {step === 'factor' ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">הזינו סיסמה ואמתו עם גורם חזק שכבר רשום אצלכם.</p>
            <Input type="email" autoComplete="username" placeholder="אימייל" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
            <Input type="password" autoComplete="current-password" placeholder="סיסמה" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
            <Button variant="primary" loading={busy} disabled={!email || !password} onClick={() => void submitFactor('passkey')} className="w-full">אמתו עם פאסקי או מפתח אבטחה</Button>
            <Input inputMode="text" autoComplete="one-time-code" placeholder="או קוד גיבוי" value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" />
            <Button variant="secondary" loading={busy} disabled={!email || !password || code.length < 8} onClick={() => void submitFactor('backup')} className="w-full">אמתו עם קוד גיבוי</Button>
          </div>
        ) : null}
        {step === 'match' ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-ink-soft">שלחנו בקשת אישור לטלגרם. לחצו שם על המספר הזה:</p>
            <p className="text-5xl font-bold text-ink tabular-nums" aria-live="polite">{num}</p>
            <p className="text-xs text-ink-soft">תוקף שתי דקות. מספר שגוי יבטל את הבקשה.</p>
          </div>
        ) : null}
        {step === 'register' ? (
          <div className="space-y-3">
            <Banner tone="success" title="אושר. נשאר רק ליצור פאסקי למכשיר הזה." />
            <Button variant="primary" loading={busy} onClick={() => void register()} className="w-full">צרו פאסקי וסיימו</Button>
          </div>
        ) : null}
      </Card>
    </main>
  );
}
