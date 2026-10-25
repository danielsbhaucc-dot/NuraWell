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
        <button type="button" disabled={!canStepDown} onClick={() => setSheet('easier')} className="inline-flex min-h-10 flex-auto items-center justify-center gap-1 whitespace-nowrap rounded-full bg-accent-400/16 px-3 text-[13px] font-bold text-accent-800 ring-1 ring-inset ring-accent-600/25 backdrop-blur-md shadow-[inset_0_1px_0_rgba(238,244,234,0.4),0_4px_14px_-6px_rgba(4,20,14,0.25)] transition duration-200 hover:bg-accent-400/24 motion-safe:active:scale-[0.97] motion-reduce:transition-none disabled:opacity-40">
          <span aria-hidden>🌱</span>
          {easierLabel}
        </button>
        <button type="button" disabled={!canStepUp} onClick={() => setSheet('harder')} className="inline-flex min-h-10 flex-auto items-center justify-center gap-1 whitespace-nowrap rounded-full bg-primary-500/12 px-3 text-[13px] font-bold text-primary-800 ring-1 ring-inset ring-primary-600/20 backdrop-blur-md shadow-[inset_0_1px_0_rgba(238,244,234,0.4),0_4px_14px_-6px_rgba(4,20,14,0.25)] transition duration-200 hover:bg-primary-500/18 motion-safe:active:scale-[0.97] motion-reduce:transition-none disabled:opacity-40">
          <span aria-hidden>💪</span>
          קל לי
        </button>
        <button type="button" onClick={() => dispatchOpenAlmogChatWithPrefill(`לגבי "${title}": `)} className="inline-flex min-h-10 flex-auto items-center justify-center gap-1 whitespace-nowrap rounded-full bg-linear-to-br from-forest-700 to-primary-700 px-3 text-[13px] font-bold text-on-dark ring-1 ring-inset ring-glow/25 shadow-[inset_0_1px_0_rgba(238,244,234,0.2),0_6px_16px_-6px_rgba(4,20,14,0.45)] transition duration-200 hover:brightness-110 motion-safe:active:scale-[0.97] motion-reduce:transition-none">
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
