'use client';

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
        <Button variant="secondary" size="sm" disabled={!canStepDown} onClick={() => setSheet('easier')}>
          {easierLabel}
        </Button>
        <Button variant="secondary" size="sm" disabled={!canStepUp} onClick={() => setSheet('harder')}>
          קל לי
        </Button>
        <Button variant="ghost" size="sm" onClick={() => dispatchOpenAlmogChatWithPrefill(`לגבי "${title}": `)}>
          לדבר עם אלמוג
        </Button>
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
