'use client';

import { useCallback, useEffect, useState } from 'react';
import { confirmDialog } from '@/components/shared/dialogs';
import { StepUpDialog } from '@/components/admin/StepUpDialog';

type Row = { from_id: string; status: 'pending' | 'allowed' | 'blocked' | 'expired'; attempts: number; created_at: string; decided_at: string | null; decided_by: string | null; reason: string | null };
type Act = { action: 'allow' | 'block' | 'unblock'; from_id: string };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '—');
const tail = (id: string) => `…${id.slice(-4)}`;
const LABEL: Record<Row['status'], string> = { pending: '⏳ ממתין לאימות', allowed: '✅ מאומת', blocked: '🚫 חסום', expired: '⌛ פג תוקף (ייחסם)' };
const WHY: Record<string, string> = { failed: '3 קודים שגויים', timeout: 'לא אומת בזמן', ops: 'נחסם ב-Ops' };

/** Extra Telegram accounts for Gideon: verify, block, unblock. Approve/unblock need Face ID or phone QR. */
export function GideonTelegramIdentities() {
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState<Act | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/v1/admin/ceo/telegram-identities', { credentials: 'include' });
    const d = await r.json().catch(() => ({}));
    if (r.ok) setRows(d.identities ?? []);
  }, []);
  useEffect(() => {
    void load();
    // cost: no polling from hidden tabs (each tick = one admin-guarded function invocation).
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const run = async (a: Act) => {
    setNote(null);
    const r = await fetch('/api/v1/admin/ceo/telegram-identities', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(a) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 403 && d.stepUp) return setPending(a);
    setNote(r.ok ? 'בוצע ✓' : d.error ?? 'הפעולה נכשלה');
    await load();
  };

  return (
    <section className="rounded-3xl border border-ink-200 bg-glass/85 backdrop-blur-md p-5" dir="rtl">
      <h2 className="text-lg font-bold">חשבונות טלגרם נוספים</h2>
      <p className="mt-1 text-sm text-ink-600">חשבון לא מוכר מקבל קוד חד-פעמי למייל שלך (10 דקות, 3 ניסיונות). נכשל? נחסם, וגדעון שותק מולו. שחרור רק מכאן.</p>
      {note ? <p className="mt-2 rounded-xl bg-ink-100 px-3 py-2 text-sm">{note}</p> : null}
      <ul className="mt-3 space-y-2 text-sm">
        {rows.length ? rows.map((r) => (
          <li key={r.from_id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-glass/60 px-3 py-2">
            <span>
              {LABEL[r.status]} · חשבון {tail(r.from_id)} · {fmt(r.created_at)}
              {r.status === 'blocked' && r.reason ? ` · ${WHY[r.reason] ?? r.reason}` : ''}
            </span>
            <span className="flex gap-2">
              {r.status === 'pending' || r.status === 'expired' ? (
                <button className="rounded-xl bg-primary-700 px-3 py-1.5 text-on-dark" onClick={() => run({ action: 'allow', from_id: r.from_id })}>✅ זה אני, אשר</button>
              ) : null}
              {r.status !== 'blocked' ? (
                <button className="rounded-xl border border-coral-200 px-3 py-1.5 text-coral-700" onClick={async () => { if (await confirmDialog({ title: 'לחסום את החשבון?', message: 'גדעון יפסיק לענות לו לגמרי.', danger: true, confirmLabel: 'חסום' })) void run({ action: 'block', from_id: r.from_id }); }}>🚫 חסום</button>
              ) : (
                <button className="rounded-xl border px-3 py-1.5" onClick={() => run({ action: 'unblock', from_id: r.from_id })}>🔓 שחרר חסימה</button>
              )}
            </span>
          </li>
        )) : <li className="text-ink-600">אין חשבונות נוספים.</li>}
      </ul>
      <StepUpDialog
        open={!!pending}
        purpose="ops.sensitive"
        reason={pending?.action === 'unblock' ? 'שחרור חסימה של חשבון טלגרם' : 'אישור חשבון טלגרם חדש לגדעון'}
        onClose={() => setPending(null)}
        onVerified={() => { const a = pending; setPending(null); if (a) void run(a); }}
      />
    </section>
  );
}
