'use client';

import { useCallback, useEffect, useState } from 'react';
import { confirmDialog } from '@/components/shared/dialogs';
import { Badge, Banner, Button, Card } from '@/components/ui';
import { StepUpDialog } from '@/components/admin/StepUpDialog';
import { emergencyCardHtml, emergencyCardText } from '@/lib/ops/emergency-card';

type Device = { id: string; label: string; via: string; created_at: string; last_seen_at: string; browser?: string | null; last_ip_masked?: string | null; last_country?: string | null; passkey?: boolean };
const fmt = (s: string) => new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(s));
const VIA: Record<string, string> = { bootstrap: 'הפעלה ראשונה', approval: 'אישור', handoff: 'מעבר מהאתר' };

async function post(body: Record<string, unknown>) {
  const r = await fetch('/api/v1/ops/device', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return (await r.json().catch(() => ({}))) as { ok?: boolean; codes?: string[]; error?: string; stepUp?: boolean };
}

/** Ops → security: trusted devices (revoke) + recovery codes (shown once). */
export function OpsDevicesPanel() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [unused, setUnused] = useState(0);
  const [banner, setBanner] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const load = useCallback(async () => {
    const j = await fetch('/api/v1/ops/device?view=devices').then((r) => r.json()).catch(() => null);
    if (!j) return;
    setDevices(j.devices ?? []);
    setUnused(j.unusedCodes ?? 0);
    setBanner(Boolean(j.showCodesBanner) || (j.unusedCodes ?? 0) === 0);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const [stepUp, setStepUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [issued, setIssued] = useState<Date | null>(null);

  const generate = async () => {
    setBusy(true); setErr(null);
    try {
      const j = await post({ action: 'regenerate_codes' });
      if (j.stepUp) { setStepUp(true); return; }
      if (j.codes) { setCodes(j.codes); setIssued(new Date()); setBanner(false); void load(); return; }
      setErr(j.error ?? 'לא הצלחנו ליצור קודים. נסו שוב.');
    } catch {
      setErr('אין חיבור. נסו שוב.');
    } finally {
      setBusy(false);
    }
  };
  const regen = async () => {
    if (busy) return;
    if (unused > 0 && !(await confirmDialog({ title: 'ליצור 10 קודי גיבוי חדשים?', message: `${unused} הקודים הקיימים יבוטלו מיד.`, tone: 'warning', confirmLabel: 'יצירת 10 קודי גיבוי' }))) return;
    await generate();
  };
  const download = () => {
    if (!codes || !issued) return;
    const url = URL.createObjectURL(new Blob([emergencyCardText(codes, issued)], { type: 'text/plain;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'nurawell-emergency-card.txt' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const print = () => {
    if (!codes || !issued) return;
    const f = Object.assign(document.createElement('iframe'), { srcdoc: emergencyCardHtml(codes, issued) });
    f.style.cssText = 'position:fixed;width:0;height:0;border:0';
    f.onload = () => { f.contentWindow?.print(); setTimeout(() => f.remove(), 60_000); };
    document.body.appendChild(f);
  };
  const regenLabel = busy ? 'יוצר קודים…' : 'יצירת 10 קודי גיבוי';

  const revoke = async (d: Device) => {
    if (!(await confirmDialog({ title: 'לבטל את המכשיר?', message: 'החיבורים של המכשיר הזה יתנתקו מיד, והוא יצטרך רישום מחדש. מכשירים אחרים לא יושפעו.', danger: true, confirmLabel: 'ביטול המכשיר' }))) return;
    const j = await post({ action: 'revoke', id: d.id });
    if (!j.ok) setErr(j.error ?? 'הביטול נכשל. נסו שוב.');
    void load();
  };
  const revokeAll = async () => {
    if (!(await confirmDialog({ title: 'לנתק את כל החיבורים?', message: 'כל החיבורים בכל המכשירים יתנתקו, כולל זה. המכשירים יישארו רשומים.', danger: true, confirmLabel: 'ניתוק הכול' }))) return;
    const j = await post({ action: 'revoke_all' });
    if (!j.ok) setErr(j.error ?? 'הניתוק נכשל. נסו שוב.');
  };

  return (
    <section className="space-y-4">
      {banner && !codes && (
        <Banner tone="warn" icon="🔑" title={unused === 0 ? 'אין קודי גיבוי פעילים.' : 'כדאי לשמור קודי גיבוי.'}
          action={<Button size="sm" variant="dark" onClick={regen} loading={busy}>{regenLabel}</Button>}>
          אם הגישה לטלגרם ולמייל תאבד, קוד גיבוי יאפשר כניסה ממכשיר חדש.
        </Banner>
      )}
      {err && <Banner tone="danger" title={err} />}
      <StepUpDialog open={stepUp} purpose="ops.sensitive" reason="יצירת 10 קודי גיבוי" onClose={() => setStepUp(false)} onVerified={() => { setStepUp(false); void generate(); }} />
      {codes && (
        <Card tone="dark" accent className="space-y-3">
          <p className="text-sm font-semibold text-on-dark">הקודים מוצגים פעם אחת בלבד. כל הקודים הקודמים בוטלו. הדפיסו או הורידו את כרטיס החירום עכשיו.</p>
          <ol dir="ltr" className="grid grid-cols-2 gap-2 font-mono text-base">{codes.map((c) => <li key={c} className="rounded-xl bg-forest-950/40 px-3 py-2 text-center text-on-dark ring-1 ring-glow/15">{c}</li>)}</ol>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={print}>הדפסת כרטיס חירום</Button>
            <Button size="sm" variant="secondary" onClick={download}>הורדה</Button>
            <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}>העתקה</Button>
            <Button size="sm" variant="primary" onClick={() => setCodes(null)}>שמרנו</Button>
          </div>
        </Card>
      )}
      <Card tone="dark" className="space-y-1 p-0">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="font-display text-[17px] font-extrabold text-on-dark">מכשירים מאושרים</h2>
          <span className="text-xs text-on-dark-soft">קודי שחזור זמינים: {unused}</span>
        </div>
        <ul className="divide-y divide-glow/10">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <div className="truncate font-bold text-on-dark">{d.browser || d.label || 'מכשיר'}{d.passkey ? <Badge tone="brand" className="ms-2">מפתח גישה</Badge> : null}</div>
                <div className="truncate text-xs text-on-dark-soft">{VIA[d.via] ?? d.via} · נראה לאחרונה {fmt(d.last_seen_at)}{d.last_country ? ` · ${d.last_country}` : ''}{d.last_ip_masked ? ` · ${d.last_ip_masked}` : ''}</div>
              </div>
              <Button size="sm" variant="danger" onClick={() => void revoke(d)}>ביטול</Button>
            </li>
          ))}
          {!devices.length && <li className="px-4 py-3 text-sm text-on-dark-soft">אין מכשירים.</li>}
        </ul>
        <div className="flex flex-wrap gap-2 border-t border-glow/10 px-4 py-3">
          <Button size="sm" variant="secondary" onClick={regen} loading={busy}>{regenLabel}</Button>
          <Button size="sm" variant="secondary" onClick={() => void revokeAll()}>ניתוק כל החיבורים</Button>
        </div>
      </Card>
    </section>
  );
}

/** Floating alert in Ops: a new device is waiting for approval (live polling). */
export function OpsPendingLoginAlert() {
  const [reqs, setReqs] = useState<{ id: string; label: string; location: string; created_at: string }[]>([]);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const j = await fetch('/api/v1/ops/device?view=pending').then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (alive && j) setReqs(j.requests ?? []);
    };
    void tick();
    const t = setInterval(tick, 10_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!reqs.length) return null;
  const r = reqs[0];
  const decide = async (approve: boolean) => {
    if (!approve && !(await confirmDialog({ title: 'לחסום?', message: 'כל החיבורים יתנתקו וגדעון יכובה.', danger: true, confirmLabel: 'חסום' }))) return;
    await post({ action: 'decide', id: r.id, approve });
    setReqs((x) => x.slice(1));
  };
  return (
    <Card tone="dark" dir="rtl" role="alertdialog" className="fixed inset-x-3 bottom-4 z-[60] mx-auto max-w-md">
      <p className="font-bold text-on-dark">🔐 ניסיון כניסה ממכשיר חדש</p>
      <p className="mt-1 text-sm text-on-dark-soft">{r.label} · {r.location} · {fmt(r.created_at)}</p>
      <div className="mt-3 flex gap-2">
        <Button variant="primary" className="flex-1" onClick={() => void decide(true)}>אישור כניסה</Button>
        <Button variant="danger" className="flex-1" onClick={() => void decide(false)}>זה לא אנחנו</Button>
      </div>
    </Card>
  );
}
