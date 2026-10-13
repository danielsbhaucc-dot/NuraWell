'use client';
import { MessageCircle } from 'lucide-react';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button, Sheet } from '@/components/ui';
import { dispatchOpenAlmogChatWithPrefill } from '@/lib/notifications/open-almog-chat';

/** "קשה לי" / "קל לי" / "לדבר עם אלמוג" for one habit — the only client part of a plan habit. */
export function LadderActions({
  assignmentId,
  title,
  eased,
  canStepDown,
  canStepUp,
  onChanged,
}: {
  assignmentId: string;
  title: string;
  eased: boolean;
  canStepDown: boolean;
  canStepUp: boolean;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<null | 'easier' | 'harder'>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const easierLabel = eased ? 'גם זה קשה לי' : 'קשה לי';

  const submit = (direction: 'easier' | 'harder') =>
    start(async () => {
      setMsg(null);
      const res = await fetch('/api/v1/tasks/level', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId, direction, reason: reason.trim() || undefined }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; level?: { title: string }; reason?: string };
      if (json.ok && json.level) {
        setMsg(`הצעד החדש: ${json.level.title}`);
        setSheet(null);
        setReason('');
        if (onChanged) onChanged();
        else router.refresh();
      } else {
        setMsg(json.reason === 'at_floor' ? 'זה כבר הצעד הקל ביותר. כדאי לדבר איתי על דרך אחרת.' : json.reason === 'at_max' ? 'זה הצעד הגבוה ביותר כרגע.' : 'לא הצלחנו לעדכן, אפשר לנסות שוב.');
      }
    });

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!canStepDown} onClick={() => setSheet('easier')} className="inline-flex min-h-10 flex-auto items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-amber-50 px-2 text-[13px] font-bold text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-100 active:scale-[0.98] disabled:opacity-40">
          <span aria-hidden>🌱</span>
          {easierLabel}
        </button>
        <button type="button" disabled={!canStepUp} onClick={() => setSheet('harder')} className="inline-flex min-h-10 flex-auto items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-emerald-50 px-2 text-[13px] font-bold text-emerald-800 ring-1 ring-emerald-200 transition hover:bg-emerald-100 active:scale-[0.98] disabled:opacity-40">
          <span aria-hidden>💪</span>
          קל לי
        </button>
        <button type="button" onClick={() => dispatchOpenAlmogChatWithPrefill(`לגבי "${title}": `)} className="inline-flex min-h-10 flex-auto items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-linear-to-br from-emerald-600 to-teal-500 px-2 text-[13px] font-bold text-white shadow-[0_4px_12px_rgba(5,150,105,0.25)] transition hover:brightness-105 active:scale-[0.98]">
          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
          לאלמוג
        </button>
      </div>
      {msg ? (
        <p role="status" className="text-sm font-semibold text-primary-800">
          {msg}
        </p>
      ) : null}
      <Sheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet === 'easier' ? easierLabel : 'קל לי'}>
        <p className="text-sm text-primary-800/80">
          {sheet === 'easier'
            ? 'אני אקל צעד אחד, אעקוב אחרי ההצלחה ואחזיר בהדרגה להרגל המלא.'
            : 'אני אעלה צעד אחד. תמיד אפשר לחזור.'}
        </p>
        <label className="flex flex-col gap-1 text-sm font-semibold text-primary-900">
          מה קורה? (לא חובה)
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} className="rounded-2xl border border-primary-200 bg-cream p-2 font-normal" />
        </label>
        <div className="flex gap-2">
          <Button loading={pending} onClick={() => sheet && submit(sheet)}>
            אישור
          </Button>
          <Button variant="ghost" onClick={() => setSheet(null)}>
            ביטול
          </Button>
        </div>
      </Sheet>
    </>
  );
}
