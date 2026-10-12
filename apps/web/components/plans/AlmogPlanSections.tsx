'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { PlanSection } from './PlanSection';
import { PlanAccordion } from './PlanAccordion';
import { dispatchOpenAlmogChatWithPrefill } from '@/lib/notifications/open-almog-chat';

/**
 * Everything Almog manages besides ladder tasks (ported from the old /plans/details):
 * focus mode, proposed steps, active Almog steps (+ difficulty rating), open blockers,
 * scheduled reminders and completed steps. Same APIs as before (/api/v1/almog-assignments, /almog-blockers).
 */
type Assignment = {
  id: string;
  title: string;
  reason: string | null;
  detail: string | null;
  status: 'proposed' | 'active' | 'frozen' | 'completed' | 'dropped';
  schedule: 'one_time' | 'daily' | 'weekly';
  done_count: number;
  last_done_at: string | null;
};
type Reminder = { id: string; kind: 'reminder' | 'followup' | 'check_progress'; title: string; body: string; status: string; fire_at: string };
type Focus = { id: string; status: 'proposed' | 'active' | 'ended' | 'declined'; reason: string | null; ends_at: string | null };
type Blocker = { id: string; description: string; strategy: string | null; status: 'open' | 'improving' | 'resolved' };
type Payload = {
  tables_ready: boolean;
  assignments: Assignment[];
  proposed?: Assignment[];
  completed: Assignment[];
  reminders: Reminder[];
  blockers: Blocker[];
  focus: Focus | null;
};

const SCHEDULE: Record<Assignment['schedule'], string> = { one_time: 'חד-פעמי', daily: 'כל יום', weekly: 'שבועי' };
const REMINDER_KIND: Record<Reminder['kind'], string> = { reminder: 'תזכורת', followup: 'בדיקה קטנה', check_progress: 'מעקב' };

async function post(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; needs_rating?: boolean };
  if (!res.ok) throw new Error(json.error ?? 'הפעולה נכשלה');
  return json;
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function AlmogPlanSections({ n = 2, gender = 'other' }: { n?: number; gender?: 'female' | 'male' | 'other' } = {}) {
  const g = (f: string, m: string, o: string) => (gender === 'female' ? f : gender === 'male' ? m : o);
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rateFor, setRateFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/almog-assignments', { credentials: 'include' });
      if (res.ok) {
        const json = (await res.json()) as Payload;
        // only upcoming reminders, soonest first (past-due pending rows cluttered the plan with ~30 lines)
        const cutoff = Date.now() - 60_000;
        json.reminders = (json.reminders ?? [])
          .filter((r) => new Date(r.fire_at).getTime() >= cutoff)
          .sort((a, b) => a.fire_at.localeCompare(b.fire_at));
        setData(json);
      }
    } catch {
      /* section stays hidden */
    }
  }, []);

  useEffect(() => {
    void load();
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הפעולה נכשלה');
    } finally {
      setBusy(null);
    }
  };
  const act = (body: Record<string, unknown>) => post('/api/v1/almog-assignments', body);
  const blockerAct = (body: Record<string, unknown>) => post('/api/v1/almog-blockers', body);

  if (!data?.tables_ready) return null;
  const focus = data.focus && (data.focus.status === 'proposed' || data.focus.status === 'active') ? data.focus : null;
  const proposed = data.proposed ?? [];
  const active = data.assignments.filter((a) => a.status === 'active');
  const blockers = data.blockers.filter((b) => b.status === 'open');
  const reminders = data.reminders.filter((r) => r.status === 'pending').slice(0, 3);
  if (!focus && !proposed.length && !active.length && !blockers.length && !reminders.length && !data.completed.length) return null;

  return (
    <PlanSection n={n} id="almog-plan-title" title="מה אלמוג מלווה מעבר להרגלים" hint="צעדים קטנים, חסמים ותזכורות">
      {error ? (
        <p role="alert" className="text-sm text-energy-700">
          {error}
        </p>
      ) : null}

      {focus ? (
        <Card className="flex flex-col gap-2">
          <h3 className="font-bold text-primary-900">{focus.status === 'proposed' ? 'אלמוג מציע לקחת רגע פוקוס' : 'מצב פוקוס פעיל'}</h3>
          {focus.reason ? <p className="text-sm text-primary-800/80">{focus.reason}</p> : null}
          {focus.ends_at ? <p className="text-xs text-primary-700">עד {fmt(focus.ends_at)}</p> : null}
          <div className="flex flex-wrap gap-2">
            {focus.status === 'proposed' ? (
              <>
                <Button size="sm" loading={busy === focus.id} onClick={() => run(focus.id, () => act({ action: 'confirm_focus', focus_id: focus.id }))}>
                  {g('כן, בואי נתמקד', 'כן, בוא נתמקד', 'כן, נתמקד')}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy === focus.id} onClick={() => run(focus.id, () => act({ action: 'decline_focus', focus_id: focus.id }))}>
                  לא עכשיו
                </Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" loading={busy === focus.id} onClick={() => run(focus.id, () => act({ action: 'end_focus', focus_id: focus.id }))}>
                לסיים פוקוס
              </Button>
            )}
          </div>
        </Card>
      ) : null}

      {proposed.map((a) => (
        <Card key={a.id} className="flex flex-col gap-2">
          <span className="text-xs font-bold text-primary-700">הצעה של אלמוג</span>
          <h3 className="font-bold text-primary-900">{a.title}</h3>
          {a.reason ? <p className="text-sm text-primary-800/80">{a.reason}</p> : null}
          <div className="flex gap-2">
            <Button size="sm" loading={busy === a.id} onClick={() => run(a.id, () => act({ action: 'approve', assignment_id: a.id }))}>
              כן, מתאים לי
            </Button>
            <Button size="sm" variant="ghost" disabled={busy === a.id} onClick={() => run(a.id, () => act({ action: 'decline', assignment_id: a.id }))}>
              לא מתאים לי
            </Button>
          </div>
        </Card>
      ))}

      {active.map((a) => (
        <Card key={a.id} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-primary-900">{a.title}</h3>
            <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary-800">{SCHEDULE[a.schedule]}</span>
          </div>
          {a.detail || a.reason ? <p className="text-sm text-primary-800/80">{a.detail || a.reason}</p> : null}
          {a.done_count > 0 ? <p className="text-xs text-primary-700">בוצע {a.done_count} פעמים</p> : null}
          {rateFor === a.id ? (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="איך היה?">
              <span className="text-sm font-semibold text-primary-900">איך היה?</span>
              {(
                [
                  ['easy', 'קל'],
                  ['ok', 'בסדר'],
                  ['hard', 'קשה'],
                ] as const
              ).map(([rating, label]) => (
                <Button
                  key={rating}
                  size="sm"
                  variant="secondary"
                  disabled={busy === a.id}
                  onClick={() =>
                    run(a.id, async () => {
                      await act({ action: 'rate_difficulty', assignment_id: a.id, rating });
                      setRateFor(null);
                    })
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                size="sm"
                loading={busy === a.id}
                onClick={() =>
                  run(a.id, async () => {
                    const r = await act({ action: 'done', assignment_id: a.id });
                    if (r?.needs_rating) setRateFor(a.id);
                  })
                }
              >
                עשיתי ✓
              </Button>
              <Button size="sm" variant="ghost" disabled={busy === a.id} onClick={() => run(a.id, () => act({ action: 'drop', assignment_id: a.id }))}>
                להוריד
              </Button>
            </div>
          )}
        </Card>
      ))}

      {blockers.map((b) => (
        <Card key={b.id} className="flex flex-col gap-2">
          <span className="text-xs font-bold text-primary-700">אלמוג כאן בשבילך</span>
          <p className="font-semibold text-primary-900">{b.description}</p>
          {b.strategy ? <p className="text-sm text-primary-800/80">{b.strategy}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              loading={busy === b.id}
              onClick={() =>
                run(b.id, async () => {
                  await blockerAct({ action: 'coach', blocker_id: b.id });
                  dispatchOpenAlmogChatWithPrefill(`אלמוג, אני רוצה לדבר על: ${b.description}`);
                })
              }
            >
              לדבר עם אלמוג
            </Button>
            <Button size="sm" variant="secondary" disabled={busy === b.id} onClick={() => run(b.id, () => blockerAct({ action: 'coach_pivot', blocker_id: b.id }))}>
              צעד קטן יותר
            </Button>
            <Button size="sm" variant="ghost" disabled={busy === b.id} onClick={() => run(b.id, () => blockerAct({ action: 'helped', blocker_id: b.id }))}>
              זה עזר לי
            </Button>
          </div>
        </Card>
      ))}

      {reminders.length ? (
        <PlanAccordion title="התזכורות הקרובות" meta={`${reminders.length} מתוזמנות`}>
          <ul className="flex flex-col gap-2">
            {reminders.map((r) => (
              <li key={r.id} className="text-sm text-primary-900">
                <span className="font-semibold">{REMINDER_KIND[r.kind] ?? 'תזכורת'}:</span> {r.title}{' '}
                <span className="text-xs text-primary-700">({fmt(r.fire_at)})</span>
              </li>
            ))}
          </ul>
        </PlanAccordion>
      ) : null}

      {data.completed.length ? (
        <PlanAccordion title={g('מה כבר עשית', 'מה כבר עשית', 'מה כבר בוצע')} meta={`${data.completed.length} צעדים`}>
          <ul className="flex flex-col gap-1 text-sm text-primary-800">
            {data.completed.map((a) => (
              <li key={a.id}>✓ {a.title}</li>
            ))}
          </ul>
        </PlanAccordion>
      ) : null}
    </PlanSection>
  );
}
