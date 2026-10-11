'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button, Card, Sheet } from '@/components/ui';
import { dispatchOpenAlmogChatWithPrefill } from '@/lib/notifications/open-almog-chat';

export type LadderCardTask = {
  id: string;
  title: string;
  emoji: string | null;
  isMain: boolean;
  currentLevel: number;
  levels: { level: number; title: string }[];
  floorLevel: number;
  doneToday: number;
  targetToday: number;
  streakDays: number;
  canStepDown: boolean;
  canStepUp: boolean;
};

/** Main task card: ladder position, today's progress, "קשה לי" / "גם זה קשה לי" / "קל לי". */
export function TaskLadderCard({ task, onChanged }: { task: LadderCardTask; onChanged?: () => void }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<null | 'easier' | 'harder'>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const easierLabel = task.currentLevel < 0 ? 'גם זה קשה לי' : 'קשה לי';

  const submit = (direction: 'easier' | 'harder') =>
    start(async () => {
      setMsg(null);
      const res = await fetch('/api/v1/tasks/level', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId: task.id, direction, reason: reason.trim() || undefined }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; level?: { title: string }; reason?: string };
      if (json.ok && json.level) {
        setMsg(`המשימה החדשה: ${json.level.title}`);
        setSheet(null);
        setReason('');
        if (onChanged) onChanged();
        else router.refresh();
      } else {
        setMsg(json.reason === 'at_floor' ? 'זו כבר הרמה הקלה ביותר — כדאי לדבר עם אלמוג על דרך אחרת.' : json.reason === 'at_max' ? 'זו הרמה הגבוהה ביותר כרגע.' : 'לא הצלחנו לעדכן, נסו שוב.');
      }
    });

  const pct = Math.min(100, Math.round((task.doneToday / Math.max(1, task.targetToday)) * 100));
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="text-3xl" aria-hidden>
          {task.emoji ?? '🎯'}
        </span>
        <div className="min-w-0 flex-1">
          {task.isMain ? <span className="text-xs font-bold text-primary-700">המשימה הראשית</span> : null}
          <h3 className="text-base font-bold text-primary-900">{task.title}</h3>
          <p className="text-sm text-primary-800/80">
            היום {task.doneToday}/{task.targetToday} · רצף {task.streakDays} ימים
          </p>
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-primary-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="התקדמות היום">
        <div className="h-full rounded-full bg-primary-500 transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      {task.levels.length > 1 ? (
        <ol className="flex items-center gap-1" aria-label="סולם הקושי">
          {task.levels.map((l) => (
            <li
              key={l.level}
              title={l.title}
              className={`h-2 flex-1 rounded-full ${l.level === task.currentLevel ? 'bg-accent-500' : l.level < task.currentLevel ? 'bg-primary-300' : 'bg-slate-200'}`}
            >
              <span className="sr-only">{`${l.title}${l.level === task.currentLevel ? ' (הרמה הנוכחית)' : ''}${l.level === 0 ? ' (המשימה המקורית)' : ''}`}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={!task.canStepDown} onClick={() => setSheet('easier')}>
          {easierLabel}
        </Button>
        <Button variant="secondary" size="sm" disabled={!task.canStepUp} onClick={() => setSheet('harder')}>
          קל לי
        </Button>
        <Button variant="ghost" size="sm" onClick={() => dispatchOpenAlmogChatWithPrefill(`לגבי המשימה "${task.title}" — `)}>
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
            ? 'אלמוג יקל צעד אחד, יעקוב אחרי ההצלחה ויחזיר אותך בהדרגה למשימה המקורית.'
            : 'אלמוג יעלה צעד אחד. תמיד אפשר לחזור.'}
        </p>
        <label className="flex flex-col gap-1 text-sm font-semibold text-primary-900">
          מה קורה? (לא חובה)
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} className="rounded-2xl border border-primary-200 p-2 font-normal" />
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
    </Card>
  );
}
