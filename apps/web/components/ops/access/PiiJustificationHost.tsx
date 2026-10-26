'use client';
import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Dialog, Input } from '@/components/ui';
import { PII_EVENT, type PiiAsk } from '@/lib/platform/access/pii-fetch';

const MIN = 15;

/** One dialog for the whole Ops area: "why do you need this person's data?" → 30-minute grant for that person only. */
export function PiiJustificationHost() {
  const [ask, setAsk] = useState<PiiAsk | null>(null);
  const [reason, setReason] = useState('');
  const [ticket, setTicket] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const queue = useRef<PiiAsk[]>([]);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<PiiAsk>).detail;
      (e as unknown as { handled?: boolean }).handled = true;
      setAsk((cur) => { if (cur) { queue.current.push(d); return cur; } return d; });
    };
    window.addEventListener(PII_EVENT, on);
    return () => window.removeEventListener(PII_EVENT, on);
  }, []);

  const finish = (ok: boolean) => {
    if (!ask) return;
    const same = queue.current.filter((q) => q.subjectId === ask.subjectId);
    queue.current = queue.current.filter((q) => q.subjectId !== ask.subjectId);
    ask.resolve(ok);
    same.forEach((q) => q.resolve(ok));
    setReason(''); setTicket(''); setErr(null);
    setAsk(queue.current.shift() ?? null);
  };

  const submit = async () => {
    if (!ask || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/v1/ops/pii-access', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'grant', subjectId: ask.subjectId, reason, ticketRef: ticket.trim() || undefined }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? 'לא הצלחנו לפתוח גישה. נסו שוב.'); return; }
      finish(true);
    } catch { setErr('אין חיבור כרגע. נסו שוב.'); } finally { setBusy(false); }
  };

  const left = Math.max(0, MIN - reason.trim().length);
  return (
    <Dialog open={Boolean(ask)} onClose={() => finish(false)} title="למה צריך את המידע האישי?">
      <div dir="rtl" className="space-y-4">
        <p className="text-[13px] leading-relaxed text-ink-soft">
          הגישה נפתחת ל-30 דקות ולמשתמש הזה בלבד. הסיבה וכל צפייה נרשמות ביומן שאי אפשר למחוק, ונבדקות בבדיקת האבטחה הלילית.
        </p>
        <label className="block space-y-1.5">
          <span className="text-[11px] font-bold text-primary-700">סיבה</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="למשל: פנייה בנושא ייצוא נתונים, בודקים שהקובץ הושלם"
            className="w-full rounded-2xl bg-surface-sunken/80 px-4 py-3 text-base text-ink ring-1 ring-hairline placeholder:text-ink-faint focus:outline-hidden focus:ring-2 focus:ring-primary-500/60"
          />
          <span className="text-[11px] text-ink-faint">{left > 0 ? `עוד ${left} תווים לפחות` : 'מצוין'}</span>
        </label>
        <label className="block space-y-1.5">
          <span className="text-[11px] font-bold text-primary-700">מספר פנייה (לא חובה)</span>
          <Input value={ticket} onChange={(e) => setTicket(e.target.value)} maxLength={40} dir="ltr" placeholder="#1234" />
        </label>
        {err ? <Banner tone="danger" title={err} /> : null}
        <div className="flex gap-2">
          <Button variant="primary" onClick={submit} loading={busy} disabled={left > 0}>פתיחת גישה ל-30 דקות</Button>
          <Button variant="ghost" onClick={() => finish(false)}>ביטול</Button>
        </div>
      </div>
    </Dialog>
  );
}
