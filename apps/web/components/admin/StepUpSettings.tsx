'use client';

import { sanitizeSvg } from '@/lib/sanitize-lesson-html';
import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, Smartphone } from 'lucide-react';
import { opsGlassBtnClass, opsGlassBtnPrimaryClass, opsGlassCardClass, opsInputClass } from '@/components/admin/OpsPanel';
import { cn } from '@/lib/cn';
import { StepUpDialog } from '@/components/admin/StepUpDialog';

/** Simple factor setup: authenticator app (TOTP) in 3 steps, backup-code status. */
export function StepUpSettings() {
  const [m, setM] = useState<{ totp: boolean; backup_left: number; passkeys: number } | null>(null);
  const [step, setStep] = useState<'idle' | 'verify' | 'scan' | 'done'>('idle');
  const [qr, setQr] = useState<{ svg: string | null; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = () => fetch('/api/v1/ops/stepup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'methods' }) }).then((r) => r.json()).then(setM).catch(() => undefined);
  useEffect(() => { void load(); }, []);

  const begin = async () => {
    setStep('idle'); setErr(null);
    const r = await fetch('/api/v1/ops/stepup/totp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'begin' }) });
    if (!r.ok) { setErr('לא הצלחנו להתחיל. נסו שוב.'); return; }
    const j = await r.json(); setQr({ svg: j.qr_svg, secret: j.secret }); setStep('scan');
  };
  const confirmTotp = async () => {
    setBusy(true); setErr(null);
    const r = await fetch('/api/v1/ops/stepup/totp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'confirm', code }) });
    setBusy(false);
    if (!r.ok) { setErr('הקוד לא תאם. מקלידים את הקוד שמוצג עכשיו באפליקציה.'); return; }
    setQr(null); setStep('done'); void load();
  };

  return (
    <section dir="rtl" className={cn(opsGlassCardClass, 'p-4 sm:p-5')} aria-label="דרכי אימות" data-testid="stepup-settings">
      <h2 className="mb-1 flex items-center gap-2 font-bold text-ink"><Smartphone size={18} className="text-teal-700" />דרכי אימות לפעולות רגישות</h2>
      <p className="mb-3 text-[13px] text-ink-soft">הדרך הראשית: סורקים קוד במחשב ומאשרים עם Face ID בטלפון. אפשר להוסיף אפליקציית קודים כגיבוי.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-gc/50 bg-glass/40 p-3"><p className="text-[11px] font-bold text-ink-faint">טלפון עם Face ID</p><p className="mt-1 text-sm font-bold text-emerald-800">{m ? (m.passkeys ? `${m.passkeys} מחוברים` : 'עוד לא מחובר') : '…'}</p></div>
        <div className="rounded-2xl border border-gc/50 bg-glass/40 p-3"><p className="text-[11px] font-bold text-ink-faint">אפליקציית קודים</p><p className={cn('mt-1 text-sm font-bold', m?.totp ? 'text-emerald-800' : 'text-amber-800')}>{m ? (m.totp ? 'פעילה' : 'לא הוגדרה') : '…'}</p></div>
        <div className="rounded-2xl border border-gc/50 bg-glass/40 p-3"><p className="text-[11px] font-bold text-ink-faint">קודי גיבוי</p><p className="mt-1 text-sm font-bold text-emerald-800"><KeyRound size={13} className="inline" /> {m ? `נשארו ${m.backup_left}` : '…'}</p></div>
      </div>
      {m && !m.totp && step !== 'scan' ? <button type="button" onClick={() => setStep('verify')} className={cn(opsGlassBtnClass, 'mt-3')}>הוספת אפליקציית קודים</button> : null}
      {step === 'scan' && qr ? (
        <div className="mt-3 grid gap-3 rounded-2xl border border-amber-300/50 bg-amber-500/5 p-3 sm:grid-cols-[180px_1fr]">
          <div className="mx-auto h-44 w-44 rounded-2xl bg-amber-50/50 p-2 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: sanitizeSvg(qr.svg) }} />
          <div>
            <p className="text-sm text-ink-soft">1. פותחים אפליקציית קודים (למשל Google Authenticator) וסורקים.<br />2. מקלידים את 6 הספרות שמופיעות.</p>
            <p className="mt-1 text-[11px] text-ink-faint">אין מצלמה? מקלידים ידנית: <span dir="ltr" className="select-all font-mono">{qr.secret}</span></p>
            <div className="mt-2 flex gap-2"><input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} dir="ltr" className={cn(opsInputClass, 'font-mono tracking-widest')} placeholder="123456" />
              <button type="button" onClick={() => void confirmTotp()} disabled={busy || code.length !== 6} className={opsGlassBtnPrimaryClass}>{busy ? <Loader2 size={16} className="animate-spin" /> : 'אישור'}</button></div>
          </div>
        </div>
      ) : null}
      {step === 'done' ? <p className="mt-3 flex items-center gap-2 text-sm font-bold text-emerald-800"><CheckCircle2 size={16} />אפליקציית הקודים פעילה</p> : null}
      {err ? <p role="alert" className="mt-2 text-sm font-semibold text-rose-700">{err}</p> : null}
      <StepUpDialog open={step === 'verify'} purpose="ops.factor" reason="הוספת אפליקציית קודים" onClose={() => setStep('idle')} onVerified={() => void begin()} />
    </section>
  );
}
