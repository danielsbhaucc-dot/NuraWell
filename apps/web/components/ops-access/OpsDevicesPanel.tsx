'use client';

import { useCallback, useEffect, useState } from 'react';
import { confirmDialog } from '@/components/shared/dialogs';

type Device = { id: string; label: string; via: string; created_at: string; last_seen_at: string };
const fmt = (s: string) => new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(s));
const VIA: Record<string, string> = { bootstrap: 'הפעלה ראשונה', approval: 'אישור', handoff: 'מעבר מהאתר' };

async function post(body: Record<string, unknown>) {
  const r = await fetch('/api/v1/ops/device', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return (await r.json().catch(() => ({}))) as { ok?: boolean; codes?: string[]; error?: string };
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

  const regen = async () => {
    if (unused > 0 && !(await confirmDialog({ title: 'ליצור קודים חדשים?', message: 'הקודים הקיימים יבוטלו.', tone: 'warning', confirmLabel: 'צור קודים' }))) return;
    const j = await post({ action: 'regenerate_codes' });
    if (j.codes) { setCodes(j.codes); setBanner(false); void load(); }
  };

  return (
    <section className="space-y-4">
      {banner && !codes && (
        <div className="rounded-3xl border border-accent-300 bg-accent-50 p-4 text-sm text-accent-900">
          <b>שמור קודי שחזור.</b> אם תאבד גישה לטלגרם ולמייל, קוד שחזור יכניס אותך ממכשיר חדש.
          <button type="button" onClick={regen} className="mt-3 block rounded-2xl bg-[#0f3d2e] px-4 py-2 font-semibold text-[#f6f1e7]">צור קודי שחזור</button>
        </div>
      )}
      {codes && (
        <div className="rounded-3xl border border-[#c9a227] bg-[#fbf6e6] p-4">
          <p className="mb-2 text-sm font-semibold text-[#0f3d2e]">הקודים מוצגים פעם אחת בלבד. שמור אותם במקום בטוח (מנהל סיסמאות / דף מודפס).</p>
          <ol dir="ltr" className="grid grid-cols-2 gap-2 font-mono text-base">{codes.map((c) => <li key={c} className="rounded-xl bg-gc px-3 py-2 text-center shadow-sm">{c}</li>)}</ol>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => navigator.clipboard?.writeText(codes.join('\n'))} className="rounded-2xl border border-hairline bg-gc px-4 py-2 text-sm">העתק</button>
            <button type="button" onClick={() => setCodes(null)} className="rounded-2xl bg-[#0f3d2e] px-4 py-2 text-sm font-semibold text-[#f6f1e7]">שמרתי</button>
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded-3xl border border-forest-950/5 bg-gc shadow-[0_4px_20px_rgba(15,61,46,0.06)]">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="font-bold text-[#0f3d2e]">מכשירים מאושרים</h2>
          <span className="text-xs text-ink-faint">קודי שחזור זמינים: {unused}</span>
        </div>
        <ul className="divide-y divide-ink-100">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div><div className="font-medium">{d.label || 'מכשיר'}</div><div className="text-xs text-ink-faint">{VIA[d.via] ?? d.via} · נראה לאחרונה {fmt(d.last_seen_at)}</div></div>
              <button type="button" onClick={async () => { if (await confirmDialog({ title: 'לבטל את המכשיר?', message: 'הוא יצטרך אישור מחדש.', danger: true, confirmLabel: 'בטל מכשיר' })) { await post({ action: 'revoke', id: d.id }); void load(); } }} className="rounded-xl px-3 py-1.5 text-coral-700 hover:bg-coral-50">בטל</button>
            </li>
          ))}
          {!devices.length && <li className="px-4 py-3 text-sm text-ink-faint">אין מכשירים.</li>}
        </ul>
        <div className="border-t border-hairline/60 px-4 py-3"><button type="button" onClick={regen} className="text-sm font-semibold text-[#0b6b4b]">צור קודי שחזור חדשים</button></div>
      </div>
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
    <div dir="rtl" role="alertdialog" className="fixed inset-x-3 bottom-4 z-[60] mx-auto max-w-md rounded-3xl border border-forest-950/5 bg-gc p-4 shadow-[0_12px_40px_rgba(15,61,46,0.18)]">
      <p className="font-bold text-[#0f3d2e]">🔐 ניסיון כניסה ממכשיר חדש</p>
      <p className="mt-1 text-sm text-ink-soft">{r.label} · {r.location} · {fmt(r.created_at)}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => decide(true)} className="flex-1 rounded-2xl bg-[#0f3d2e] py-2.5 font-semibold text-[#f6f1e7]">אשר כניסה</button>
        <button type="button" onClick={() => decide(false)} className="flex-1 rounded-2xl border border-coral-200 py-2.5 font-semibold text-coral-700">זה לא אני</button>
      </div>
    </div>
  );
}
