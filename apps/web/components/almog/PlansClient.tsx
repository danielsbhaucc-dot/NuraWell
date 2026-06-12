'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Loader2,
  Repeat,
  Snowflake,
  Sparkles,
} from 'lucide-react';
import { glassCardStyle, glassPanelStyle } from '@/components/media-manager/glass-styles';

type Assignment = {
  id: string;
  title: string;
  reason: string | null;
  detail: string | null;
  status: 'active' | 'frozen' | 'completed' | 'dropped';
  schedule: 'one_time' | 'daily' | 'weekly';
  given_at: string;
  due_at: string | null;
  last_done_at: string | null;
  done_count: number;
  source_excerpt: string | null;
};

type Reminder = {
  id: string;
  kind: 'reminder' | 'followup' | 'check_progress';
  title: string;
  body: string;
  status: 'pending' | 'sent' | 'cancelled' | 'skipped';
  fire_at: string;
  sent_at: string | null;
};

type Focus = {
  id: string;
  status: 'proposed' | 'active' | 'ended' | 'declined';
  reason: string | null;
  paused_scope: 'reminders' | 'reminders_and_dim';
  started_at: string | null;
  ends_at: string | null;
  user_confirmed: boolean;
};

type Blocker = {
  id: string;
  description: string;
  strategy: string | null;
  status: 'open' | 'improving' | 'resolved';
  identified_at: string;
  last_checked_at: string | null;
  next_check_at: string | null;
};

type Payload = {
  tables_ready: boolean;
  assignments: Assignment[];
  completed: Assignment[];
  reminders: Reminder[];
  blockers: Blocker[];
  focus: Focus | null;
};

const SCHEDULE_LABEL: Record<Assignment['schedule'], string> = {
  one_time: 'חד-פעמי',
  daily: 'יומי',
  weekly: 'שבועי',
};

const REMINDER_KIND: Record<Reminder['kind'], string> = {
  reminder: 'תזכורת',
  followup: 'בדיקה',
  check_progress: 'מעקב חסם',
};

function fmt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

async function postAction(body: Record<string, string>) {
  const res = await fetch('/api/v1/almog-assignments', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? 'הפעולה נכשלה');
  }
}

export function PlansClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/almog-assignments', {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = (await res.json()) as Payload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'שגיאה בטעינה');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת טעינה');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הפעולה נכשלה');
    } finally {
      setBusyId(null);
    }
  };

  const pendingReminders = (data?.reminders ?? []).filter((r) => r.status === 'pending');
  const sentReminders = (data?.reminders ?? []).filter((r) => r.status === 'sent');

  return (
    <div className="container-mobile space-y-4 pb-8">
      <section className="rounded-3xl overflow-hidden" style={glassPanelStyle}>
        <div className="px-4 py-5 border-b border-white/40">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl text-emerald-700"
              style={glassCardStyle}
            >
              <Sparkles className="w-5 h-5" aria-hidden />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900">התוכנית שלי</h1>
              <p className="text-xs text-slate-600/90 leading-relaxed">
                משימות, תזכורות ומעקב שאלמוג סיכם איתך — עם דיווח ביצוע אמיתי
              </p>
            </div>
          </div>
        </div>

        <div className="p-4">
          {loading ? (
            <p className="flex justify-center py-10">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
            </p>
          ) : error ? (
            <p className="text-sm text-red-700 text-center py-8">{error}</p>
          ) : !data?.tables_ready ? (
            <p className="text-sm text-slate-600 text-center py-8">
              מערכת התוכניות עדיין לא מוכנה בשרת. נסה שוב מאוחר יותר.
            </p>
          ) : (
            <div className="space-y-5">
              {data.focus ? (
                <FocusCard
                  focus={data.focus}
                  busy={busyId === data.focus.id}
                  onConfirm={() =>
                    run(data.focus!.id, () =>
                      postAction({ action: 'confirm_focus', focus_id: data.focus!.id })
                    )
                  }
                  onDecline={() =>
                    run(data.focus!.id, () =>
                      postAction({ action: 'decline_focus', focus_id: data.focus!.id })
                    )
                  }
                  onEnd={() =>
                    run(data.focus!.id, () =>
                      postAction({ action: 'end_focus', focus_id: data.focus!.id })
                    )
                  }
                />
              ) : null}

              {data.assignments.length > 0 ? (
                <Section title="משימות פעילות" icon={Sparkles} tint="text-emerald-700">
                  {data.assignments.map((a) => (
                    <AssignmentCard
                      key={a.id}
                      assignment={a}
                      busy={busyId === a.id}
                      onDone={() => run(a.id, () => postAction({ action: 'done', assignment_id: a.id }))}
                      onDrop={() => run(a.id, () => postAction({ action: 'drop', assignment_id: a.id }))}
                    />
                  ))}
                </Section>
              ) : (
                <EmptyHint text="אין כרגע משימות פעילות מאלמוג. כשתסכימו על משהו בצ׳אט — הוא יופיע כאן." />
              )}

              {pendingReminders.length > 0 ? (
                <Section title="תזכורות קרובות" icon={Bell} tint="text-amber-700">
                  {pendingReminders.map((r) => (
                    <li key={r.id} className="rounded-2xl px-3 py-3" style={glassCardStyle}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-amber-800">{REMINDER_KIND[r.kind]}</span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                          <Clock className="w-3 h-3" />
                          {fmt(r.fire_at)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-900 leading-relaxed">{r.body}</p>
                    </li>
                  ))}
                </Section>
              ) : null}

              {data.blockers.length > 0 ? (
                <Section title="חסמים במעקב" icon={AlertTriangle} tint="text-rose-700">
                  {data.blockers.map((b) => (
                    <li key={b.id} className="rounded-2xl px-3 py-3" style={glassCardStyle}>
                      <p className="text-sm font-bold text-slate-900 leading-relaxed">{b.description}</p>
                      {b.strategy ? (
                        <p className="text-xs text-slate-600 mt-1">דרך להתגבר: {b.strategy}</p>
                      ) : null}
                      <p className="text-[10px] text-slate-400 mt-1">
                        זוהה {fmt(b.identified_at)}
                        {b.next_check_at ? ` · בדיקה הבאה ${fmt(b.next_check_at)}` : ''}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ActionButton
                          label="יש שיפור"
                          variant="soft"
                          busy={busyId === `${b.id}-improve`}
                          onClick={() =>
                            run(`${b.id}-improve`, () =>
                              postAction({ action: 'improve_blocker', blocker_id: b.id })
                            )
                          }
                        />
                        <ActionButton
                          label="נפתר"
                          variant="primary"
                          busy={busyId === `${b.id}-resolve`}
                          onClick={() =>
                            run(`${b.id}-resolve`, () =>
                              postAction({ action: 'resolve_blocker', blocker_id: b.id })
                            )
                          }
                        />
                      </div>
                    </li>
                  ))}
                </Section>
              ) : null}

              {data.completed.length > 0 ? (
                <Section title="הושלמו לאחרונה" icon={CheckCircle2} tint="text-teal-700">
                  {data.completed.map((a) => (
                    <li key={a.id} className="rounded-2xl px-3 py-3" style={glassCardStyle}>
                      <p className="text-sm font-bold text-slate-900">{a.title}</p>
                      {a.reason ? <p className="text-xs text-slate-600 mt-0.5">למה: {a.reason}</p> : null}
                      <p className="text-[10px] text-slate-400 mt-1">
                        בוצע {fmt(a.last_done_at)} · {a.done_count}×
                      </p>
                    </li>
                  ))}
                </Section>
              ) : null}

              {sentReminders.length > 0 ? (
                <Section title="תזכורות שנשלחו" icon={Bell} tint="text-slate-600">
                  {sentReminders.slice(0, 6).map((r) => (
                    <li key={r.id} className="rounded-2xl px-3 py-3 opacity-90" style={glassCardStyle}>
                      <p className="text-sm text-slate-800">{r.body}</p>
                      <p className="text-[10px] text-slate-400 mt-1">נשלחה {fmt(r.sent_at)}</p>
                    </li>
                  ))}
                </Section>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  tint,
  children,
}: {
  title: string;
  icon: typeof Sparkles;
  tint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500">
        <Icon className={`w-3.5 h-3.5 ${tint}`} aria-hidden />
        {title}
      </p>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-2xl px-4 py-5 text-center text-sm text-slate-500" style={glassCardStyle}>
      {text}
    </div>
  );
}

function AssignmentCard({
  assignment,
  busy,
  onDone,
  onDrop,
}: {
  assignment: Assignment;
  busy: boolean;
  onDone: () => void;
  onDrop: () => void;
}) {
  return (
    <li className="rounded-2xl px-3 py-3" style={glassCardStyle}>
      <div className="flex flex-wrap items-center gap-1.5 mb-1">
        <span className="text-[10px] font-bold text-emerald-800">
          {assignment.schedule === 'one_time' ? (
            <span className="inline-flex items-center gap-0.5">
              <Sparkles className="w-3 h-3" />
              {SCHEDULE_LABEL[assignment.schedule]}
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5">
              <Repeat className="w-3 h-3" />
              {SCHEDULE_LABEL[assignment.schedule]}
            </span>
          )}
        </span>
        {assignment.done_count > 0 ? (
          <span className="text-[10px] font-bold text-emerald-700">בוצע {assignment.done_count}×</span>
        ) : null}
      </div>
      <p className="text-sm font-black text-slate-900 leading-relaxed">{assignment.title}</p>
      {assignment.reason ? <p className="text-xs text-slate-600 mt-1">למה: {assignment.reason}</p> : null}
      {assignment.detail ? <p className="text-xs text-slate-500 mt-0.5">{assignment.detail}</p> : null}
      <p className="text-[10px] text-slate-400 mt-1">
        ניתנה {fmt(assignment.given_at)}
        {assignment.last_done_at ? ` · בוצע לאחרונה ${fmt(assignment.last_done_at)}` : ''}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <ActionButton label="עשיתי" variant="primary" busy={busy} onClick={onDone} />
        <ActionButton label="לא מתאים לי" variant="soft" busy={busy} onClick={onDrop} />
      </div>
    </li>
  );
}

function FocusCard({
  focus,
  busy,
  onConfirm,
  onDecline,
  onEnd,
}: {
  focus: Focus;
  busy: boolean;
  onConfirm: () => void;
  onDecline: () => void;
  onEnd: () => void;
}) {
  return (
    <div className="rounded-2xl px-3 py-3 border border-sky-200/70" style={glassCardStyle}>
      <div className="flex items-center gap-2 mb-1">
        <Snowflake className="w-4 h-4 text-sky-700" />
        <p className="text-sm font-black text-slate-900">מצב פוקוס מאלמוג</p>
      </div>
      {focus.reason ? <p className="text-sm text-slate-700 leading-relaxed">{focus.reason}</p> : null}
      <p className="text-[10px] text-slate-400 mt-1">
        {focus.status === 'proposed' ? 'ממתין לאישור שלך' : 'פעיל'}
        {focus.ends_at ? ` · עד ${fmt(focus.ends_at)}` : ''}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {focus.status === 'proposed' ? (
          <>
            <ActionButton label="מאשר" variant="primary" busy={busy} onClick={onConfirm} />
            <ActionButton label="לא עכשיו" variant="soft" busy={busy} onClick={onDecline} />
          </>
        ) : (
          <ActionButton label="חזרתי לשגרה" variant="primary" busy={busy} onClick={onEnd} />
        )}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  variant,
  busy,
  onClick,
}: {
  label: string;
  variant: 'primary' | 'soft';
  busy: boolean;
  onClick: () => void;
}) {
  const cls =
    variant === 'primary'
      ? 'bg-emerald-600 text-white border-emerald-500/40'
      : 'bg-white/45 text-slate-700 border-white/60';
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`rounded-xl px-3 py-2 text-xs font-bold border backdrop-blur-md transition disabled:opacity-60 ${cls}`}
    >
      {busy ? 'שומר...' : label}
    </button>
  );
}
