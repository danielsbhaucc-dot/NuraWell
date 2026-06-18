'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Clock,
  Loader2,
  MessageCircle,
  Repeat,
  Snowflake,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { AlmogAvatarChip } from '@/components/journey/AlmogPresence';
import { createClient } from '@/lib/supabase/client';
import { dispatchOpenAlmogChatWithPrefill } from '@/lib/notifications/open-almog-chat';
import type { BlockerCoachState, BlockerProposal } from '@/lib/ai/almog-commitments/types';

type AssignmentRelation = 'standalone' | 'replaces' | 'eases' | 'supports';
type AssignmentHistoryEntry = {
  at: string;
  action: 'done' | 'frozen' | 'dropped' | 'reactivated';
  note?: string;
};

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
  relation: AssignmentRelation | null;
  parent_assignment_id: string | null;
  history?: AssignmentHistoryEntry[] | null;
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
  metadata: Record<string, unknown> | null;
  related_assignment_id: string | null;
};

type RecoveryPlan = {
  blocker: Blocker;
  microStep: Assignment;
  original: Assignment | null;
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
  daily: 'כל יום',
  weekly: 'שבועי',
};

const REMINDER_KIND: Record<Reminder['kind'], string> = {
  reminder: 'תזכורת',
  followup: 'בדיקה קטנה',
  check_progress: 'מעקב',
};
const RECOVERY_GOOD_DAYS_TARGET = 3;

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

function fmtDay(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  } catch {
    return iso;
  }
}

function consecutiveDoneDays(assignment: Assignment): number {
  const entries = Array.isArray(assignment.history) ? assignment.history : [];
  if (!entries.length) return 0;
  const doneDates = new Set(
    entries.filter((e) => e.action === 'done' && e.at).map((e) => e.at.slice(0, 10))
  );
  if (!doneDates.size) return 0;
  if (assignment.last_done_at) doneDates.add(assignment.last_done_at.slice(0, 10));
  const startIso = assignment.last_done_at ?? null;
  if (!startIso) return 0;

  let streak = 0;
  const cursor = new Date(startIso);
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (!doneDates.has(key)) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'בוקר טוב';
  if (h < 17) return 'צהריים טובים';
  if (h < 21) return 'ערב טוב';
  return 'לילה טוב';
}


async function postBlockerAction(body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch('/api/v1/almog-blockers', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? 'הפעולה נכשלה');
  }
  return (await res.json()) as Record<string, unknown>;
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

export function PlansClient({ userId, firstName }: { userId: string; firstName?: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);
  const [showAllStandalone, setShowAllStandalone] = useState(false);
  const firstLoad = useRef(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/almog-assignments', {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = (await res.json()) as Payload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'שגיאה בטעינה');
      setData(json);
      if (!firstLoad.current && silent) {
        setJustUpdated(true);
        window.setTimeout(() => setJustUpdated(false), 1800);
      }
      firstLoad.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת טעינה');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── עדכון לייב: Supabase realtime על טבלאות אלמוג + פולבק פולינג ──
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const ping = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void load(true), 350);
    };

    const channel = supabase.channel(`plans-live-${userId}-${Date.now()}`);
    for (const table of [
      'almog_assignments',
      'scheduled_reminders',
      'almog_blockers',
      'almog_interventions',
      'almog_focus_periods',
    ]) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
        ping
      );
    }
    channel.subscribe((status) => {
      setLive(status === 'SUBSCRIBED');
    });

    const poll = window.setInterval(() => void load(true), 45_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (debounce) clearTimeout(debounce);
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      const result = await action();
      await load(true);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הפעולה נכשלה');
      throw e;
    } finally {
      setBusyId(null);
    }
  };

  const pendingReminders = (data?.reminders ?? []).filter((r) => r.status === 'pending');
  const sentReminders = (data?.reminders ?? []).filter((r) => r.status === 'sent');
  const name = firstName?.trim() || '';

  // ── Recovery-plan grouping ──────────────────────────────────────────
  // כל blocker ב-improving שיש לו related_assignment_id → קיבוץ עם המיקרו-סטפ
  // ועם ה-assignment המקורי המוקפא (parent_assignment_id).
  const recoveryPlans: RecoveryPlan[] = (data?.blockers ?? [])
    .filter((b) => b.status === 'improving' && b.related_assignment_id)
    .map((b) => {
      const microStep = (data?.assignments ?? []).find((a) => a.id === b.related_assignment_id) ?? null;
      const original = microStep?.parent_assignment_id
        ? (data?.assignments ?? []).find((a) => a.id === microStep.parent_assignment_id) ?? null
        : null;
      return microStep ? ({ blocker: b, microStep, original } as RecoveryPlan) : null;
    })
    .filter((rp): rp is RecoveryPlan => rp !== null);

  const recoveryStepIds = new Set(recoveryPlans.map((rp) => rp.microStep.id));

  // משימות פעילות שאינן חלק מתוכנית החזרה
  const standaloneTasks = (data?.assignments ?? []).filter(
    (a) => a.status === 'active' && !recoveryStepIds.has(a.id)
  );
  const visibleStandaloneTasks = showAllStandalone ? standaloneTasks : standaloneTasks.slice(0, 4);
  const hiddenStandaloneCount = Math.max(0, standaloneTasks.length - visibleStandaloneTasks.length);

  // חסמים פתוחים שטרם קיבלו אסטרטגיה (מצב coach)
  const openBlockers = (data?.blockers ?? []).filter((b) => b.status === 'open');

  const activeCount = standaloneTasks.length + recoveryPlans.length;
  const blockerCount = openBlockers.length;
  const reminderCount = pendingReminders.length;

  // גלילה חלקה לפריט + הבהוב קצר שמסמן בדיוק מה דורש תשומת לב.
  const jumpTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const prev = el.style.boxShadow;
    el.style.transition = 'box-shadow 0.35s ease';
    el.style.boxShadow = '0 0 0 3px rgba(244,63,94,0.5), 0 10px 30px rgba(244,63,94,0.18)';
    window.setTimeout(() => {
      el.style.boxShadow = prev;
    }, 1500);
  };

  // פריטים דחופים שדורשים תשובה — לשורת הסיכום שבראש.
  const actionItems: { id: string; label: string; tint: Tint }[] = [];
  if (data?.focus?.status === 'proposed') {
    actionItems.push({ id: 'plan-focus', label: 'אלמוג מציע לקחת רגע פוקוס', tint: 'indigo' });
  }

  return (
    <div dir="rtl" className="relative min-h-[calc(100vh-9rem)] overflow-hidden">
      <SoftBackground />

      {/* ── HERO ברוחב מלא (full-bleed) ── */}
      <Hero
        name={name}
        live={live}
        pulsing={justUpdated}
        active={activeCount}
        reminders={reminderCount}
        blockers={blockerCount}
      />

      <div className="container-mobile relative z-10 space-y-6 pb-12 pt-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          </div>
        ) : error && !data ? (
          <Card tint="rose">
            <p className="py-5 text-center text-sm text-rose-700">{error}</p>
          </Card>
        ) : !data?.tables_ready ? (
          <Card tint="emerald">
            <p className="py-5 text-center text-sm text-emerald-800/90">
              עוד רגע מתארגנים. ברגע שנסכם משהו בצ׳אט — הוא יופיע כאן.
            </p>
          </Card>
        ) : (
          <>
            {error ? (
              <p className="rounded-2xl bg-rose-100 px-3 py-2 text-center text-xs font-semibold text-rose-700">
                {error}
              </p>
            ) : null}

            {actionItems.length > 0 ? (
              <ActionNeeded items={actionItems} onJump={jumpTo} />
            ) : null}

            <AnimatePresence initial={false}>
              {data.focus ? (
                <FocusCard
                  key={data.focus.id}
                  focus={data.focus}
                  busy={busyId === data.focus.id}
                  onConfirm={() =>
                    run(data.focus!.id, () => postAction({ action: 'confirm_focus', focus_id: data.focus!.id }))
                  }
                  onDecline={() =>
                    run(data.focus!.id, () => postAction({ action: 'decline_focus', focus_id: data.focus!.id }))
                  }
                  onEnd={() =>
                    run(data.focus!.id, () => postAction({ action: 'end_focus', focus_id: data.focus!.id }))
                  }
                />
              ) : null}
            </AnimatePresence>

            {/* ── תוכניות חזרה (PRIMARY) ── */}
            {recoveryPlans.length > 0 ? (
              <Section
                icon={Repeat}
                title="בדרך חזרה"
                tint="amber"
                count={recoveryPlans.length}
                explain="אנחנו עובדים בצעדים קטנים כדי לחזור להרגל המקורי. סמן כל צעד כשתעשה אותו — ואני אעדכן את התוכנית."
              >
                <AnimatePresence initial={false}>
                  {recoveryPlans.map((rp, i) => (
                    <RecoveryPlanCard
                      key={rp.blocker.id}
                      plan={rp}
                      index={i + 1}
                      busy={(busyId?.startsWith(rp.blocker.id) ?? false) || busyId === rp.microStep.id}
                      onDoneStep={() =>
                        run(rp.microStep.id, () =>
                          postAction({ action: 'done', assignment_id: rp.microStep.id })
                        )
                      }
                      onPivot={() =>
                        run(`${rp.blocker.id}-p`, async () => {
                          await postBlockerAction({ action: 'coach_pivot', blocker_id: rp.blocker.id });
                          await postBlockerAction({ action: 'accept', blocker_id: rp.blocker.id });
                        })
                      }
                      onAsk={() =>
                        dispatchOpenAlmogChatWithPrefill(
                          `אלמוג, לגבי "${rp.blocker.description}" — אפשר שנדבר על זה?`
                        )
                      }
                    />
                  ))}
                </AnimatePresence>
              </Section>
            ) : null}

            {/* ── משימות עצמאיות (PRIMARY) ── */}
            <Section
              icon={Sparkles}
              title="הצעדים שלך"
              tint="emerald"
              count={standaloneTasks.length}
              defaultOpen
              explain="אלה הדברים שסיכמנו לעשות עכשיו. אחד בכל פעם, בלי לחץ — וכל סימון פה הוא ניצחון אמיתי. 🌱"
            >
              {standaloneTasks.length > 0 ? (
                <AnimatePresence initial={false}>
                  {visibleStandaloneTasks.map((a, i) => (
                    <AssignmentCard
                      key={a.id}
                      assignment={a}
                      index={i + 1}
                      busy={busyId === a.id}
                      onDone={() => run(a.id, () => postAction({ action: 'done', assignment_id: a.id }))}
                      onDrop={() => run(a.id, () => postAction({ action: 'drop', assignment_id: a.id }))}
                    />
                  ))}
                </AnimatePresence>
              ) : null}
              {hiddenStandaloneCount > 0 ? (
                <li>
                  <button
                    type="button"
                    onClick={() => setShowAllStandalone((v) => !v)}
                    className="w-full rounded-2xl border border-emerald-200/70 bg-white/55 px-3 py-2.5 text-[12.5px] font-bold text-emerald-700 transition active:scale-[0.99]"
                  >
                    {showAllStandalone
                      ? 'הצג פחות צעדים'
                      : `יש עוד ${hiddenStandaloneCount} צעדים — הצג הכול`}
                  </button>
                </li>
              ) : null}
              {standaloneTasks.length === 0 ? (
                recoveryPlans.length > 0 ? (
                  <EmptyHint text="כרגע כל המאמץ מוכוון לתוכנית החזרה שלמעלה. 🌿" />
                ) : (
                  <EmptyHint text="אין כרגע צעד פתוח. כשנסכם משהו בשיחה — אשים אותו פה בשבילך." />
                )
              ) : null}
            </Section>

            {/* ── שיחת מאמן — חסמים פתוחים (SECONDARY) ── */}
            {openBlockers.length > 0 ? (
              <Section
                icon={MessageCircle}
                title="אלמוג כאן בשבילך"
                tint="rose"
                count={openBlockers.length}
                explain="כשמשהו תקוע, פה אנחנו פותרים את זה ביחד. בלי שיפוט — צעד אחד קטן בכל פעם."
              >
                {openBlockers.map((b, i) => (
                  <BlockerCoachCard
                    key={b.id}
                    blocker={b}
                    index={i + 1}
                    busy={busyId?.startsWith(b.id) ?? false}
                    onCoach={() =>
                      run(`${b.id}-c`, () =>
                        postBlockerAction({ action: 'coach', blocker_id: b.id })
                      ) as Promise<Record<string, unknown>>
                    }
                    onAccept={() =>
                      run(`${b.id}-a`, () =>
                        postBlockerAction({ action: 'accept', blocker_id: b.id })
                      ) as Promise<Record<string, unknown>>
                    }
                    onPivot={() =>
                      run(`${b.id}-p`, () =>
                        postBlockerAction({ action: 'coach_pivot', blocker_id: b.id })
                      ) as Promise<Record<string, unknown>>
                    }
                    onHelped={() =>
                      run(`${b.id}-h`, () =>
                        postBlockerAction({ action: 'helped', blocker_id: b.id })
                      ) as Promise<Record<string, unknown>>
                    }
                    onAsk={() => {
                      dispatchOpenAlmogChatWithPrefill(
                        `אלמוג, לגבי "${b.description}" — אפשר שנדבר על זה?`
                      );
                    }}
                  />
                ))}
              </Section>
            ) : null}

            {/* ── תזכורות (SECONDARY) ── */}
            {pendingReminders.length > 0 ? (
              <Section
                icon={Bell}
                title="אזכיר לך"
                tint="amber"
                count={pendingReminders.length}
                explain="פה אני שומר את התזכורות שלקחתי על עצמי. לא תצטרך לזכור לבד — אני אדאג להזכיר בזמן."
              >
                {pendingReminders.map((r, i) => (
                  <ReminderRow key={r.id} reminder={r} index={i + 1} />
                ))}
              </Section>
            ) : null}

            {/* ── הושלמו (SECONDARY) ── */}
            {data.completed.length > 0 ? (
              <Section
                icon={CheckCircle2}
                title="כבר עשית את זה"
                tint="teal"
                count={data.completed.length}
                explain="כל מה שכבר סימנת. שווה להציץ אחורה מדי פעם — זה דלק להמשך, ואני גאה בכל אחד מהם. 💪"
              >
                {data.completed.map((a, i) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2.5 rounded-2xl border border-teal-100 bg-teal-50/70 px-3 py-2.5"
                  >
                    <NumBadge n={i + 1} rgb={TINT.teal.rgb} />
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-500" />
                    <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-teal-900/80 line-through decoration-teal-400/50">
                      {a.title}
                    </p>
                    <span className="shrink-0 text-[10px] font-semibold text-teal-600/70">
                      {fmtDay(a.last_done_at)}
                    </span>
                  </li>
                ))}
              </Section>
            ) : null}

            {/* ── תזכורות שנשלחו (טריוויה) ── */}
            {sentReminders.length > 0 ? (
              <details className="group px-1">
                <summary className="cursor-pointer list-none text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  תזכורות שכבר שלחתי ({sentReminders.length})
                </summary>
                <ul className="mt-2 space-y-2">
                  {sentReminders.slice(0, 8).map((r, i) => (
                    <li
                      key={r.id}
                      className="flex items-start gap-2.5 rounded-2xl border border-white/40 px-3 py-2.5"
                      style={{
                        background: 'rgba(255,255,255,0.3)',
                        backdropFilter: 'blur(12px) saturate(150%)',
                        WebkitBackdropFilter: 'blur(12px) saturate(150%)',
                      }}
                    >
                      <NumBadge n={i + 1} rgb="148,163,184" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-slate-700">{r.body}</p>
                        <p className="mt-1 text-[10px] text-slate-400">נשלחה {fmt(r.sent_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            <EncouragementCard name={name} />
          </>
        )}
      </div>
    </div>
  );
}

const ALMOG_NUDGES: readonly string[] = [
  'צמחים גדלים לכיוון האור — גם אחרי נסיגה קטנה הם ממשיכים למעלה. ככה גם אתה. 🌱',
  'לא צריך מושלם, צריך עקבי. צעד קטן היום שווה יותר מקפיצה גדולה שלא קורית.',
  'כל פעם שאתה מסמן משהו פה — אתה מוכיח לעצמך שאתה שומר מילה. זה בונה אמון עצמי.',
  'אני לא סופר כמה נפלת, אני סופר כמה קמת. ואתה קם שוב ושוב. 💪',
  'התקדמות אמיתית היא לא קו ישר. ימים טובים, ימים פחות — שניהם חלק מהדרך.',
  'אתה לא צריך למצוא מוטיבציה כל בוקר. אתה צריך רק להתחיל, והמוטיבציה תבוא תוך כדי.',
  'הצעד הכי חשוב הוא הבא. לא זה שפספסת אתמול. 🌿',
  'גם אם היום עשית 1% — זה 1% שלא היה לך אתמול. זה מצטבר, אני מבטיח.',
  'תהיה עדין עם עצמך. אתה עושה משהו קשה, ואתה עושה אותו בכל זאת.',
  'הרגלים נבנים בשקט, יום אחרי יום. אתה כבר באמצע הבנייה — אל תעצור עכשיו.',
  'אני כאן כל הדרך, לא רק כשהכול מושלם. במיוחד כשקשה. 💙',
  'הגרסה שלך מחר תודה לך על הצעד הקטן שתעשה היום.',
  'אל תשווה את ההתחלה שלך לאמצע של מישהו אחר. הקצב שלך הוא הקצב הנכון.',
  'נפילה היא לא סוף. היא רק חלק מהסיפור שבו אתה קם. ואתה תמיד קם.',
  'מספיק לעשות מעט, אבל לעשות את זה הרבה פעמים. ככה משתנים באמת.',
];

function EncouragementCard({ name }: { name: string }) {
  // מתחיל מניואנס יומי יציב, ואז מתחלף בעדינות כדי שהדף ירגיש חי.
  const [idx, setIdx] = useState(() => new Date().getDate() % ALMOG_NUDGES.length);
  useEffect(() => {
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % ALMOG_NUDGES.length);
    }, 9000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="relative overflow-hidden rounded-[22px] p-4 backdrop-blur-md"
      style={{
        ...glassStyle('emerald'),
        background: 'linear-gradient(160deg, rgba(255,255,255,0.82) 0%, rgba(236,253,245,0.55) 100%)',
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full ring-2 ring-emerald-100">
          <AlmogAvatarChip size={28} />
        </span>
        <span className="text-[12px] font-black text-emerald-700">מילה ממני{name ? `, ${name}` : ''}</span>
      </div>
      <div className="relative min-h-[42px]">
        <AnimatePresence mode="wait">
          <motion.p
            key={idx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4 }}
            className="text-[13.5px] leading-relaxed text-slate-600"
          >
            {ALMOG_NUDGES[idx]}
          </motion.p>
        </AnimatePresence>
      </div>
      {/* נקודות התקדמות עדינות */}
      <div className="mt-3 flex justify-center gap-1" aria-hidden>
        {ALMOG_NUDGES.slice(0, 6).map((_, i) => (
          <span
            key={i}
            className="h-1 rounded-full transition-all duration-300"
            style={{
              width: i === idx % 6 ? '14px' : '5px',
              background: i === idx % 6 ? '#10b981' : 'rgba(16,185,129,0.25)',
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

/* ───────────────────────── רקע רך ───────────────────────── */

function SoftBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(170deg, #ecfdf5 0%, #f0fdfa 28%, #eff6ff 52%, #faf5ff 76%, #ffffff 100%)',
        }}
      />
      {/* מארג ברי-זוהר עדין בסגנון Apple — כתמי צבע רכים שצפים ברקע */}
      <motion.div
        className="absolute -right-28 -top-24 h-[22rem] w-[22rem] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(16,185,129,0.26), transparent 68%)',
          filter: 'blur(56px)',
        }}
        animate={{ y: [0, 18, 0], x: [0, -10, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -left-32 top-1/3 h-[26rem] w-[26rem] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(99,102,241,0.16), transparent 70%)',
          filter: 'blur(64px)',
        }}
        animate={{ y: [0, -22, 0], x: [0, 14, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(45,212,191,0.18), transparent 70%)',
          filter: 'blur(56px)',
        }}
        animate={{ y: [0, -14, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div
        className="absolute bottom-1/4 left-1/3 h-64 w-64 rounded-full opacity-60"
        style={{
          background: 'radial-gradient(circle, rgba(251,191,36,0.12), transparent 70%)',
          filter: 'blur(52px)',
        }}
      />
      {/* גרעיניות עדינה (noise) — נותנת עומק ומונעת באנדינג בגרדיאנט */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}

/* ───────────────────────── HERO ───────────────────────── */

function Hero({
  name,
  live,
  pulsing,
  active,
  reminders,
  blockers,
}: {
  name: string;
  live: boolean;
  pulsing: boolean;
  active: number;
  reminders: number;
  blockers: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-10 w-full overflow-hidden rounded-b-[40px] pb-14 pt-14"
      style={{
        background:
          'linear-gradient(155deg, #034d3a 0%, #059669 35%, #0d9488 65%, #10b981 85%, #34d399 100%)',
        boxShadow: '0 20px 60px rgba(6,78,59,0.36), inset 0 1px 0 rgba(255,255,255,0.22)',
      }}
    >
      {/* שכבת ברק עליונה — מדמה השתקפות זכוכית על ה-hero */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-2/3"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0) 100%)',
        }}
      />
      {/* קו זוהר תחתון */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)' }}
      />
      {/* זוהר אור פינתי ימין */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.32), transparent 68%)' }}
      />
      {/* זוהר אור שמאל */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-28 -left-20 h-80 w-80 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(45,212,191,0.50), transparent 70%)' }}
      />
      {/* זוהר מרכזי */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(52,211,153,0.18), transparent 65%)' }}
      />
      {/* עלה מרחף */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute right-6 top-8 text-3xl"
        animate={{ rotate: [0, -12, 12, 0], y: [0, -6, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        🍃
      </motion.div>
      {/* ניצוץ ימני תחתון */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute bottom-10 left-8 text-xl opacity-70"
        animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
      >
        ✦
      </motion.div>

      {/* תוכן מיושר לרוחב התוכן של הדף */}
      <div className="container-mobile relative">
        <div className="flex items-center gap-5">
          <motion.div
            className="relative shrink-0 rounded-full p-1.5"
            style={{
              background: 'linear-gradient(140deg, rgba(255,255,255,0.6), rgba(255,255,255,0.15))',
              boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
            }}
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="rounded-full ring-2 ring-white/60">
              <AlmogAvatarChip size={80} />
            </div>
            <span
              aria-hidden
              className="absolute -bottom-0.5 -left-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm"
              style={{ background: '#ecfdf5', boxShadow: '0 2px 8px rgba(0,0,0,0.22)' }}
            >
              🌱
            </span>
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-bold text-white"
                style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)' }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {greeting()}{name ? `, ${name}` : ''}
              </span>
              <LivePill live={live} pulsing={pulsing} />
            </div>
            <h1 className="mt-3 text-[40px] font-black leading-[1.0] text-white drop-shadow-md">
              התוכנית שלנו
            </h1>
          </div>
        </div>

        <p className="mt-5 text-base leading-relaxed text-emerald-50/95 font-medium">
          ריכזתי כאן כל מה שסיכמנו — צעד קטן בכל פעם, ואני איתך בכל אחד מהם. 🌱
        </p>

        <div className="mt-8 grid grid-cols-3 gap-3">
          <HeroStat icon={Sparkles} value={active} label="דברים לעשות" />
          <HeroStat icon={Bell} value={reminders} label="תזכורות" />
          <HeroStat icon={MessageCircle} value={blockers} label="תקועים?" />
        </div>
      </div>
    </motion.section>
  );
}

function HeroStat({ icon: Icon, value, label }: { icon: typeof Sparkles; value: number; label: string }) {
  return (
    <motion.div
      whileTap={{ scale: 0.96 }}
      className="relative overflow-hidden rounded-2xl px-2 py-4 text-center"
      style={{
        background: 'linear-gradient(165deg, rgba(255,255,255,0.32), rgba(255,255,255,0.12))',
        backdropFilter: 'blur(16px) saturate(170%)',
        WebkitBackdropFilter: 'blur(16px) saturate(170%)',
        border: '1px solid rgba(255,255,255,0.5)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 12px 32px rgba(0,0,0,0.16)',
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.38), transparent)' }}
      />
      <Icon className="relative mx-auto mb-1.5 h-5 w-5 text-emerald-50/95" aria-hidden />
      <p className="relative text-[30px] font-black leading-none text-white drop-shadow-md">{value}</p>
      <p className="relative mt-1.5 text-[11px] font-semibold text-emerald-50/90">{label}</p>
    </motion.div>
  );
}

/* ───────────────────────── פרימיטיבים (זכוכית בהירה) ───────────────────────── */

type Tint = 'emerald' | 'amber' | 'rose' | 'teal' | 'indigo';

const TINT: Record<Tint, { rgb: string; soft: string; text: string }> = {
  emerald: { rgb: '16,185,129', soft: '236,253,245', text: '#047857' },
  amber: { rgb: '245,158,11', soft: '255,251,235', text: '#b45309' },
  rose: { rgb: '244,63,94', soft: '255,241,242', text: '#be123c' },
  teal: { rgb: '20,184,166', soft: '240,253,250', text: '#0f766e' },
  indigo: { rgb: '99,102,241', soft: '238,242,255', text: '#4338ca' },
};

/**
 * זכוכית iOS 26 ("Liquid Glass") — שקיפות עמוקה, blur חזק עם saturation,
 * גבול דק כפול (אור למעלה/צל למטה), וזוהר פנימי עליון שמדמה משטח זכוכית אמיתי.
 */
function glassStyle(tint: Tint): React.CSSProperties {
  const t = TINT[tint];
  return {
    // זכוכית iOS שקופה — רואים את הרקע הגרדיאנטי דרך הכרטיס, לא תיבה לבנה אטומה.
    background: `linear-gradient(160deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.32) 48%, rgba(${t.soft},0.28) 100%)`,
    backdropFilter: 'blur(22px) saturate(180%)',
    WebkitBackdropFilter: 'blur(22px) saturate(180%)',
    border: `1px solid rgba(255,255,255,0.5)`,
    // צל בודד, רך וצמוד — מונע את ה"שבירה" של צל בין כרטיסי זכוכית בנייד.
    boxShadow: `0 6px 18px rgba(15,23,42,0.07), inset 0 1px 0 rgba(255,255,255,0.55)`,
  };
}

/** שכבת "ברק" עליונה (specular highlight) לכרטיסי זכוכית — נותנת תחושת משטח מלוטש. */
function GlassSheen() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-10 rounded-t-[inherit]"
      style={{
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 100%)',
        opacity: 0.7,
      }}
    />
  );
}

/** עיגול מספור קטן לפריט ברשימה — מספר רץ בכל סקציה. */
function NumBadge({ n, rgb }: { n: number; rgb: string }) {
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white"
      style={{ background: `rgba(${rgb},0.92)`, boxShadow: `0 2px 6px rgba(${rgb},0.32)` }}
    >
      {n}
    </span>
  );
}

function Card({ tint, children }: { tint: Tint; children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-3xl p-4" style={glassStyle(tint)}>
      <GlassSheen />
      <div className="relative">{children}</div>
    </div>
  );
}

function LivePill({ live, pulsing }: { live: boolean; pulsing: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black"
      style={{
        background: 'rgba(255,255,255,0.18)',
        border: '1px solid rgba(255,255,255,0.35)',
        color: '#ecfdf5',
      }}
    >
      <motion.span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: live ? '#bbf7d0' : '#fde68a' }}
        animate={pulsing || live ? { scale: [1, 1.6, 1], opacity: [1, 0.5, 1] } : {}}
        transition={{ duration: 1.4, repeat: Infinity }}
      />
      {live ? 'חי' : 'מתחבר'}
    </span>
  );
}

/** מפריד צבעוני עדין בין הסקציות — מחזיר אוויר ונותן לכל אזור גוון משלו. */
function SectionDivider({ tint }: { tint: Tint }) {
  const t = TINT[tint];
  return (
    <div className="flex items-center gap-2 px-3 pb-1" aria-hidden>
      <span
        className="h-px flex-1 rounded-full"
        style={{ background: `linear-gradient(90deg, transparent, rgba(${t.rgb},0.4))` }}
      />
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: `rgba(${t.rgb},0.6)` }} />
      <span
        className="h-px flex-1 rounded-full"
        style={{ background: `linear-gradient(90deg, rgba(${t.rgb},0.4), transparent)` }}
      />
    </div>
  );
}

/**
 * סקציה מתקפלת (אקורדיון) — מקלה על העומס בדף. כברירת מחדל סגורה,
 * אלא אם defaultOpen. כשפתוחה — מופיע הסבר קצר בקול של אלמוג ואז התוכן.
 */
function Section({
  icon: Icon,
  title,
  tint,
  explain,
  count,
  defaultOpen = false,
  children,
}: {
  icon: typeof Sparkles;
  title: string;
  tint: Tint;
  explain?: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const t = TINT[tint];
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="space-y-2.5">
      <SectionDivider tint={tint} />
      {/* כותרת לחיצה — זכוכית כהה בסגנון iOS */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="relative flex w-full items-center gap-3 overflow-hidden rounded-2xl px-4 py-3.5 text-right transition active:scale-[0.98]"
        style={{
          background: open
            ? `linear-gradient(145deg, rgba(15,23,42,0.82) 0%, rgba(${t.rgb},0.28) 100%)`
            : `linear-gradient(145deg, rgba(15,23,42,0.72) 0%, rgba(${t.rgb},0.18) 100%)`,
          border: `1px solid rgba(${t.rgb},${open ? 0.55 : 0.32})`,
          boxShadow: open
            ? `0 10px 32px rgba(${t.rgb},0.22), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(0,0,0,0.18)`
            : `0 4px 18px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.10)`,
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        }}
      >
        {/* specular highlight — מדמה משטח זכוכית על הכפתור */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-2xl"
          style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 100%)' }}
        />
        <span
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: `linear-gradient(140deg, rgba(${t.rgb},1), rgba(${t.rgb},0.72))`,
            boxShadow: `0 4px 16px rgba(${t.rgb},0.5), inset 0 1px 0 rgba(255,255,255,0.35)`,
          }}
        >
          <Icon className="h-5 w-5 text-white" aria-hidden />
        </span>
        <h2 className="flex-1 text-[18px] font-black text-white drop-shadow-sm">{title}</h2>
        {typeof count === 'number' && count > 0 ? (
          <span
            className="flex h-[24px] min-w-[24px] items-center justify-center rounded-full px-1.5 text-[12px] font-black text-white"
            style={{
              background: `rgba(${t.rgb},0.9)`,
              boxShadow: `0 2px 8px rgba(${t.rgb},0.4)`,
            }}
          >
            {count}
          </span>
        ) : null}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }} className="shrink-0">
          <ChevronDown className="h-5 w-5 text-white/70" aria-hidden />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pt-3">
              {explain ? <AlmogLine text={explain} /> : null}
              <ul className="space-y-4 pb-1">{children}</ul>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

/** שורת הסבר קצרה בקול של אלמוג — טקסט עדין ושקט, בלי עומס ויזואלי. */
function AlmogLine({ text }: { text: string }) {
  return (
    <p className="border-r-2 border-slate-200/70 pr-2.5 text-[12.5px] leading-relaxed text-slate-500">
      {text}
    </p>
  );
}

/**
 * שורת סיכום "דורש את תשומת ליבך" — מבליטה את מה שהמשתמש צריך לעדכן
 * (למשל "איך הלך עם הצעד הקטן"). לחיצה גוללת אל הפריט עצמו ומדגישה אותו.
 */
function ActionNeeded({
  items,
  onJump,
}: {
  items: { id: string; label: string; tint: Tint }[];
  onJump: (id: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="overflow-hidden rounded-3xl p-3.5"
      style={{
        background: 'linear-gradient(160deg, rgba(255,247,237,0.7), rgba(255,237,213,0.45))',
        border: '1px solid rgba(244,114,182,0.22)',
        boxShadow: '0 8px 22px rgba(244,63,94,0.1)',
        backdropFilter: 'blur(20px) saturate(170%)',
        WebkitBackdropFilter: 'blur(20px) saturate(170%)',
      }}
    >
      <div className="mb-2 flex items-center gap-2 px-0.5">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-xl"
          style={{
            background: 'linear-gradient(140deg, #fb7185, #f43f5e)',
            boxShadow: '0 4px 12px rgba(244,63,94,0.32)',
          }}
        >
          <Bell className="h-3.5 w-3.5 text-white" />
        </span>
        <h2 className="flex-1 text-[13.5px] font-black text-slate-800">דורש את תשומת ליבך</h2>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-black text-white">
          {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((it) => {
          const t = TINT[it.tint];
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onJump(it.id)}
              className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-right transition active:scale-[0.99]"
              style={{ background: 'rgba(255,255,255,0.55)', border: `1px solid rgba(${t.rgb},0.16)` }}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `rgba(${t.rgb},0.9)` }} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-700">{it.label}</span>
              <ChevronLeft className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <li
      className="rounded-2xl border border-white/40 px-4 py-5 text-center text-sm text-slate-500"
      style={{
        background: 'rgba(255,255,255,0.32)',
        backdropFilter: 'blur(14px) saturate(150%)',
        WebkitBackdropFilter: 'blur(14px) saturate(150%)',
      }}
    >
      {text}
    </li>
  );
}

/* ───────────────────────── כרטיסים ───────────────────────── */

const RELATION_META: Record<
  Exclude<AssignmentRelation, 'standalone'>,
  { label: string; emoji: string }
> = {
  replaces: { label: 'מחליף משימה', emoji: '🔄' },
  eases: { label: 'גרסה מוקלת', emoji: '🪶' },
  supports: { label: 'צעד עזר', emoji: '🤝' },
};

function AssignmentCard({
  assignment,
  index,
  busy,
  onDone,
  onDrop,
}: {
  assignment: Assignment;
  index: number;
  busy: boolean;
  onDone: () => void;
  onDrop: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isRecurring = assignment.schedule !== 'one_time';
  const doneToday =
    Boolean(assignment.last_done_at) && fmtDay(assignment.last_done_at) === fmtDay(new Date().toISOString());
  const relationMeta =
    assignment.relation && assignment.relation !== 'standalone'
      ? RELATION_META[assignment.relation]
      : null;
  const isEasedOriginal = assignment.status === 'frozen';

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      whileTap={{ scale: 0.992 }}
      className="relative overflow-hidden rounded-[24px] p-3"
      style={{ ...glassStyle('emerald'), ...(isEasedOriginal ? { opacity: 0.82 } : {}) }}
    >
      <GlassSheen />
      <div className="relative z-[1]">
        {/* שורה ראשית — קומפקטית */}
        <div className="flex items-center gap-2.5">
          <NumBadge n={index} rgb={TINT.emerald.rgb} />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-black leading-snug text-slate-900">{assignment.title}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-px text-[9px] font-bold text-emerald-700">
                {isRecurring ? <Repeat className="h-2.5 w-2.5" /> : <Sparkles className="h-2.5 w-2.5" />}
                {SCHEDULE_LABEL[assignment.schedule]}
              </span>
              {relationMeta ? (
                <span className="rounded-full bg-indigo-100 px-1.5 py-px text-[9px] font-bold text-indigo-700">
                  {relationMeta.emoji} {relationMeta.label}
                </span>
              ) : null}
              {assignment.done_count > 0 ? (
                <span className="text-[9px] font-bold text-emerald-600/80">✓{assignment.done_count}</span>
              ) : null}
            </div>
          </div>
          {/* כפתור פתיחה לפרטים — חץ קטן */}
          {(assignment.reason || assignment.detail) && !isEasedOriginal ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="shrink-0 rounded-xl p-1 text-emerald-500 transition"
              aria-label={expanded ? 'סגור פרטים' : 'פרטים נוספים'}
            >
              <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="block">
                <ChevronDown className="h-4 w-4" />
              </motion.span>
            </button>
          ) : null}
        </div>

        {/* פרטים מורחבים — מתקפלים */}
        <AnimatePresence initial={false}>
          {expanded && (assignment.reason || assignment.detail) ? (
            <motion.div
              key="details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-2 space-y-1 border-t border-emerald-100/60 pt-2">
                {assignment.reason ? (
                  <p className="text-[12px] leading-relaxed text-slate-600">
                    <span className="font-bold text-emerald-700">למה: </span>
                    {assignment.reason}
                  </p>
                ) : null}
                {assignment.detail ? (
                  <p className="text-[11.5px] leading-relaxed text-slate-500">{assignment.detail}</p>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {isEasedOriginal ? (
          <div
            className="mt-2.5 rounded-2xl px-3 py-2 text-[11.5px] font-semibold leading-relaxed text-slate-500"
            style={{ background: 'rgba(148,163,184,0.12)', border: '1px solid rgba(148,163,184,0.22)' }}
          >
            הקלנו על זה זמנית — מתמקדים בצעד קטן יותר. ברגע שתסמן אותו, נחזיר את זה בהדרגה. 🪶
          </div>
        ) : (
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              disabled={busy || doneToday}
              onClick={onDone}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl px-3 py-2 text-[13px] font-black text-white transition active:scale-95 disabled:opacity-60"
              style={{
                background: doneToday
                  ? 'linear-gradient(135deg, #34d399, #059669)'
                  : 'linear-gradient(135deg, #059669, #10b981)',
                boxShadow: '0 6px 16px rgba(16,185,129,0.32)',
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {doneToday ? 'בוצע היום ✨' : isRecurring ? 'עשיתי היום' : 'סיימתי'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDrop}
              className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-[11.5px] font-bold text-slate-500 transition active:scale-95 disabled:opacity-50"
            >
              לא מתאים
            </button>
          </div>
        )}
      </div>
    </motion.li>
  );
}

/* ───────────────────────── כרטיס תוכנית חזרה ───────────────────────── */

/**
 * כרטיס "בדרך חזרה" — מציג את ההרגל המוקפא (המטרה) + הצעד הקטן הנוכחי +
 * כפתורי check-in. מחליף את הצורך לחפש את הקשר בין שלושה סקציות נפרדות.
 */
function RecoveryPlanCard({
  plan,
  index,
  busy,
  onDoneStep,
  onPivot,
  onAsk,
}: {
  plan: RecoveryPlan;
  index: number;
  busy: boolean;
  onDoneStep: () => void;
  onPivot: () => Promise<unknown>;
  onAsk: () => void;
}) {
  const { blocker, microStep, original } = plan;
  const doneToday =
    Boolean(microStep.last_done_at) &&
    fmtDay(microStep.last_done_at) === fmtDay(new Date().toISOString());
  const recoveryProgressDays = Math.min(consecutiveDoneDays(microStep), RECOVERY_GOOD_DAYS_TARGET);

  return (
    <motion.li
      id={`plan-blocker-${blocker.id}`}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="relative overflow-hidden rounded-[24px] p-4"
      style={glassStyle('amber')}
    >
      <GlassSheen />
      <div className="relative z-[1] space-y-3">

        {/* ── הרגל מקורי מוקפא ── */}
        {original ? (
          <div
            className="flex items-center gap-2 rounded-2xl px-3 py-2.5"
            style={{
              background: 'rgba(148,163,184,0.10)',
              border: '1px solid rgba(148,163,184,0.20)',
            }}
          >
            <Snowflake className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                בדרך חזרה ל:
              </p>
              <p className="mt-0.5 text-[13px] font-bold text-slate-500">{original.title}</p>
            </div>
            <NumBadge n={index} rgb={TINT.amber.rgb} />
          </div>
        ) : null}

        {/* ── חץ חיבור ── */}
        {original ? (
          <div className="flex items-center gap-2 px-3">
            <span className="h-px flex-1 rounded-full bg-gradient-to-l from-transparent via-amber-300/60 to-transparent" />
            <span className="text-[10px] font-bold text-amber-500">↓ צעד קטן</span>
            <span className="h-px flex-1 rounded-full bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />
          </div>
        ) : null}

        {/* ── צעד נוכחי (הצעד הקטן האקטיבי) ── */}
        <div
          className="rounded-2xl px-3.5 py-3"
          style={{
            background: 'linear-gradient(160deg, rgba(255,255,255,0.6), rgba(236,253,245,0.4))',
            border: '1px solid rgba(16,185,129,0.22)',
          }}
        >
          <p className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-emerald-600/80">
            <Sparkles className="h-3 w-3" />
            הצעד שלך עכשיו
          </p>
          <p className="text-[15px] font-black leading-snug text-slate-800">{microStep.title}</p>
          {microStep.detail ? (
            <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{microStep.detail}</p>
          ) : null}
          {microStep.done_count > 0 ? (
            <p className="mt-1 text-[10px] font-bold text-emerald-600">
              {recoveryProgressDays}/{RECOVERY_GOOD_DAYS_TARGET} ימים טובים בדרך חזרה 🌱
            </p>
          ) : null}
        </div>

        {/* ── כפתורי פעולה ── */}
        <div className="flex flex-wrap gap-2 pt-0.5">
          <button
            type="button"
            disabled={busy || doneToday}
            onClick={onDoneStep}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl px-3 py-2.5 text-[13.5px] font-black text-white transition active:scale-95 disabled:opacity-60"
            style={{
              background: doneToday
                ? 'linear-gradient(135deg, #34d399, #059669)'
                : 'linear-gradient(135deg, #059669, #10b981)',
              boxShadow: '0 6px 16px rgba(16,185,129,0.32)',
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {doneToday ? 'בוצע היום ✨' : 'עשיתי את זה!'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onPivot()}
            className="flex items-center gap-1 rounded-2xl border border-slate-200/80 bg-white/60 px-3 py-2.5 text-[12px] font-bold text-slate-500 transition active:scale-95 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsDown className="h-3.5 w-3.5" />}
            לא עובד — נחליף עכשיו
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onAsk}
            className="flex items-center gap-1 rounded-2xl border border-indigo-200/60 bg-indigo-50/40 px-3 py-2.5 text-[12px] font-bold text-indigo-600 transition active:scale-95 disabled:opacity-60"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            נדבר
          </button>
        </div>
      </div>
    </motion.li>
  );
}

function ReminderRow({ reminder, index }: { reminder: Reminder; index: number }) {
  return (
    <li className="relative overflow-hidden rounded-3xl p-3.5" style={glassStyle('amber')}>
      <GlassSheen />
      <div className="relative z-[1]">
      <div className="mb-1 flex items-center gap-2">
        <NumBadge n={index} rgb={TINT.amber.rgb} />
        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
          {REMINDER_KIND[reminder.kind]}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-amber-700/70">
          <Clock className="h-3 w-3" />
          {fmt(reminder.fire_at)}
        </span>
      </div>
      <p className="text-[13.5px] leading-relaxed text-slate-800">{reminder.body}</p>
      </div>
    </li>
  );
}

/* ───────────────────────── שיחת מאמן (חסמים) ───────────────────────── */

function readCoachFromMetadata(metadata: Record<string, unknown> | null): BlockerCoachState | null {
  if (!metadata || typeof metadata.coach !== 'object' || !metadata.coach) return null;
  const c = metadata.coach as BlockerCoachState;
  if (!c.empathy || !c.proposal?.micro_step) return null;
  return c;
}

function BlockerCoachCard({
  blocker,
  index,
  busy,
  onCoach,
  onAccept,
  onPivot,
  onHelped,
  onAsk,
}: {
  blocker: Blocker;
  index: number;
  busy: boolean;
  onCoach: () => Promise<Record<string, unknown>>;
  onAccept: () => Promise<Record<string, unknown>>;
  onPivot: () => Promise<Record<string, unknown>>;
  onHelped: () => Promise<Record<string, unknown>>;
  onAsk: () => void;
}) {
  const cached = readCoachFromMetadata(blocker.metadata);
  const [empathy, setEmpathy] = useState(cached?.empathy ?? '');
  const [proposal, setProposal] = useState<BlockerProposal | null>(cached?.proposal ?? null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const coachFetched = useRef(false);

  const hasActiveExperiment = Boolean(blocker.strategy) && blocker.status === 'improving';

  // אוטו-הפעלה: כשהכרטיס נטען בלי ניסוי פעיל — מבקשים coach מיד
  useEffect(() => {
    if (coachFetched.current || hasActiveExperiment || cached) return;
    coachFetched.current = true;
    setCoachLoading(true);
    void onCoach()
      .then((res) => {
        if (typeof res.empathy === 'string') setEmpathy(res.empathy);
        if (res.proposal && typeof res.proposal === 'object') {
          setProposal(res.proposal as BlockerProposal);
        }
      })
      .catch(() => {
        setEmpathy('אני שומע אותך. בוא נמצא דרך קטנה שתרגיש נכון.');
      })
      .finally(() => setCoachLoading(false));
  }, [hasActiveExperiment, cached, onCoach]);

  const handleAccept = async () => {
    await onAccept();
    setAccepted(true);
    setProposal(null);
    setEmpathy('');
  };

  const handlePivot = async () => {
    setCoachLoading(true);
    try {
      const res = await onPivot();
      if (typeof res.empathy === 'string') setEmpathy(res.empathy);
      if (res.proposal && typeof res.proposal === 'object') {
        setProposal(res.proposal as BlockerProposal);
      }
    } finally {
      setCoachLoading(false);
    }
  };

  // ── מצב: ניסוי פעיל (אחרי accept) — מינימלי, בלי תגיות קליניות ──
  if (hasActiveExperiment) {
    return (
      <motion.li
        id={`plan-blocker-${blocker.id}`}
        layout
        className="relative overflow-hidden rounded-[24px] p-4"
        style={glassStyle('rose')}
      >
        <GlassSheen />
        <div className="relative z-[1]">
          <div className="flex items-center gap-2.5">
            <span className="shrink-0 rounded-full ring-2 ring-rose-100/70">
              <AlmogAvatarChip size={34} />
            </span>
            <p className="min-w-0 flex-1 text-[14px] font-black leading-snug text-slate-800">
              איך הלך עם הצעד הקטן?
            </p>
            <NumBadge n={index} rgb={TINT.rose.rgb} />
          </div>
          <div className="mt-2.5 rounded-2xl border border-rose-100/70 bg-white/40 px-3.5 py-2.5">
            <p className="text-[13px] leading-relaxed text-slate-700">{blocker.strategy}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onHelped()}
                className="inline-flex items-center gap-1 rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-2 text-[12px] font-bold text-emerald-700 transition active:scale-95 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                עזר לי
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handlePivot()}
                className="inline-flex items-center gap-1 rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-2 text-[12px] font-bold text-slate-500 transition active:scale-95 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsDown className="h-3.5 w-3.5" />}
                לא מתאים — בוא ננסה אחרת
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onAsk}
                className="inline-flex items-center gap-1 rounded-2xl px-3 py-2 text-[12px] font-bold text-indigo-600 transition hover:text-indigo-800 disabled:opacity-60"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                בוא נדבר
              </button>
            </div>
        </div>
      </motion.li>
    );
  }

  // ── מצב: שיחת מאמן — מסודר: כותרת → אמפתיה → חוצץ → הצעה → כפתורים ──
  return (
    <motion.li
      id={`plan-blocker-${blocker.id}`}
      layout
      className="relative overflow-hidden rounded-[24px] p-4"
      style={glassStyle('rose')}
    >
      <GlassSheen />
      <div className="relative z-[1]">
        {accepted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2 rounded-2xl bg-emerald-50/80 px-3 py-2.5 text-[13px] font-bold text-emerald-700"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            מעולה! הצעד החדש מחכה לך למעלה 🌿
          </motion.div>
        ) : (
          <>
            {/* כותרת — אלמוג + הקושי שעליו מדברים, פעם אחת */}
            <div className="flex items-center gap-2.5">
              <span className="shrink-0 rounded-full ring-2 ring-rose-100/70">
                <AlmogAvatarChip size={34} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-black text-slate-800">אלמוג</span>
                  <span className="rounded-full bg-rose-100/80 px-1.5 py-0.5 text-[9px] font-bold text-rose-600">
                    כאן בשבילך
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">לגבי: {blocker.description}</p>
              </div>
              <NumBadge n={index} rgb={TINT.rose.rgb} />
            </div>

            {/* אמפתיה — נורמליזציה של הקושי */}
            {empathy || coachLoading ? (
              <div className="mt-3">
                {coachLoading && !empathy ? (
                  <div className="flex items-center gap-1.5 py-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-rose-300" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-rose-300" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-rose-300" style={{ animationDelay: '300ms' }} />
                  </div>
                ) : (
                  <p className="text-[13.5px] leading-relaxed text-slate-700">{empathy}</p>
                )}
              </div>
            ) : null}

            {/* הצעה — צעד אחד, בקופסה מוגדרת עם חוצץ מעליה */}
            {proposal && !coachLoading ? (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3">
                <div className="mb-3 h-px w-full rounded-full bg-gradient-to-l from-transparent via-rose-200/70 to-transparent" />
                <div
                  className="rounded-2xl px-3.5 py-3"
                  style={{
                    background: 'linear-gradient(160deg, rgba(255,255,255,0.6), rgba(236,253,245,0.4))',
                    border: '1px solid rgba(16,185,129,0.2)',
                  }}
                >
                  <p className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-emerald-600/80">
                    <Sparkles className="h-3 w-3" />
                    צעד קטן שיחזיר אותך למשימה
                  </p>
                  <p className="text-[14px] font-bold leading-snug text-slate-800">{proposal.micro_step}</p>
                </div>
              </motion.div>
            ) : null}

            {/* כפתורי פעולה */}
            {proposal && !coachLoading ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="mt-3 flex flex-col gap-2"
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleAccept()}
                  className="flex w-full items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-[14px] font-black text-white transition active:scale-[0.98] disabled:opacity-60"
                  style={{
                    background: 'linear-gradient(135deg, #059669, #10b981)',
                    boxShadow: '0 6px 18px rgba(16,185,129,0.32)',
                  }}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  יאללה, ננסה ל-24 שעות
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handlePivot()}
                    className="flex-1 rounded-2xl border border-slate-200/80 bg-white/50 px-3 py-2 text-[12px] font-bold text-slate-500 transition active:scale-95 disabled:opacity-60"
                  >
                    קשה לי דווקא זה
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onAsk}
                    className="flex-1 rounded-2xl border border-indigo-200/60 bg-indigo-50/40 px-3 py-2 text-[12px] font-bold text-indigo-600 transition active:scale-95 disabled:opacity-60"
                  >
                    בוא נדבר
                  </button>
                </div>
              </motion.div>
            ) : null}
          </>
        )}
      </div>
    </motion.li>
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
  const isProposed = focus.status === 'proposed';
  return (
    <motion.div
      id="plan-focus"
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="relative overflow-hidden rounded-3xl p-4"
      style={glassStyle('indigo')}
    >
      <GlassSheen />
      <div className="relative z-[1]">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-indigo-100">
          <Snowflake className="h-4 w-4 text-indigo-600" />
        </span>
        <p className="text-[15px] font-black text-slate-900">
          {isProposed ? 'בוא ניקח אוויר ביחד' : 'מצב פוקוס פעיל'}
        </p>
      </div>
      <p className="text-[13px] leading-relaxed text-slate-600">
        {isProposed
          ? `שמתי לב שעכשיו קצת כבד. בוא נשים בצד את שאר המשימות${focus.reason ? ` ונתמקד ב${focus.reason}` : ''} — ההתקדמות שלך נשמרת, אנחנו רק לוקחים נשימה.`
          : `שמנו בצד את השאר${focus.ends_at ? ` עד ${fmtDay(focus.ends_at)}` : ''}${focus.reason ? ` כדי להתמקד ב${focus.reason}` : ''}. אני שומר עליך מהצד.`}
      </p>
      <div className="mt-3 flex gap-2">
        {isProposed ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="flex-1 rounded-2xl px-3 py-2.5 text-[13px] font-black text-white transition active:scale-95 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#6366f1,#818cf8)', boxShadow: '0 6px 16px rgba(99,102,241,0.35)' }}
            >
              בוא נתמקד
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDecline}
              className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-2.5 text-[12px] font-bold text-slate-500 transition active:scale-95 disabled:opacity-60"
            >
              לא עכשיו
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onEnd}
            className="w-full rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-[13px] font-bold text-indigo-700 transition active:scale-95 disabled:opacity-60"
          >
            חזרתי לשגרה 💪
          </button>
        )}
      </div>
      </div>
    </motion.div>
  );
}
