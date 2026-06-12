'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Loader2,
  Repeat,
  Snowflake,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { AlmogAvatarChip } from '@/components/journey/AlmogPresence';
import { createClient } from '@/lib/supabase/client';

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

type BlockerHistory = { at: string; status: string; note?: string };

type Blocker = {
  id: string;
  description: string;
  strategy: string | null;
  status: 'open' | 'improving' | 'resolved';
  identified_at: string;
  last_checked_at: string | null;
  next_check_at: string | null;
  history: BlockerHistory[] | null;
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

    // פולבק: רענון שקט כל 45 שניות (גם אם realtime לא זמין).
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

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הפעולה נכשלה');
    } finally {
      setBusyId(null);
    }
  };

  const pendingReminders = (data?.reminders ?? []).filter((r) => r.status === 'pending');
  const sentReminders = (data?.reminders ?? []).filter((r) => r.status === 'sent');
  const activeCount = data?.assignments.length ?? 0;
  const hello = firstName ? `${firstName}, ` : '';

  return (
    <div dir="rtl" className="relative min-h-[calc(100vh-9rem)]">
      <AuroraBackground />

      <div className="container-mobile relative z-10 space-y-5 pb-10 pt-2">
        {/* ── כותרת: אלמוג מדבר ── */}
        <header className="flex items-start gap-3 px-1 pt-2">
          <AlmogAvatarChip size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-[19px] font-black text-white drop-shadow">התוכנית שלנו</h1>
              <LivePill live={live} pulsing={justUpdated} />
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-emerald-100/85">
              {hello}ריכזתי כאן הכל מה שסיכמנו יחד. צעד קטן בכל פעם — אני איתך בכל אחד מהם. 🌱
            </p>
          </div>
        </header>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-300" />
          </div>
        ) : error && !data ? (
          <GlassCard glow="rose">
            <p className="py-6 text-center text-sm text-rose-100">{error}</p>
          </GlassCard>
        ) : !data?.tables_ready ? (
          <GlassCard glow="emerald">
            <p className="py-6 text-center text-sm text-emerald-100/90">
              עוד רגע מתארגנים. ברגע שנסכם משהו בצ׳אט — הוא יופיע כאן.
            </p>
          </GlassCard>
        ) : (
          <>
            {error ? (
              <p className="rounded-2xl bg-rose-500/20 px-3 py-2 text-center text-xs font-semibold text-rose-100">
                {error}
              </p>
            ) : null}

            {/* ── מצב פוקוס ── */}
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

            {/* ── משימות פעילות ── */}
            <Section
              icon={Sparkles}
              title="הצעדים שלך"
              glow="emerald"
              note={
                activeCount > 0
                  ? 'אלה הדברים שביקשתי שתנסה. כל סימון פה זה ניצחון אמיתי — גם הקטן.'
                  : undefined
              }
            >
              {activeCount > 0 ? (
                <AnimatePresence initial={false}>
                  {data.assignments.map((a) => (
                    <AssignmentCard
                      key={a.id}
                      assignment={a}
                      busy={busyId === a.id}
                      onDone={() => run(a.id, () => postAction({ action: 'done', assignment_id: a.id }))}
                      onDrop={() => run(a.id, () => postAction({ action: 'drop', assignment_id: a.id }))}
                    />
                  ))}
                </AnimatePresence>
              ) : (
                <p className="px-1 py-3 text-sm text-emerald-100/70">
                  אין כרגע צעד פתוח. כשנסכם משהו בשיחה — אני אשים אותו פה בשבילך.
                </p>
              )}
            </Section>

            {/* ── תזכורות קרובות ── */}
            {pendingReminders.length > 0 ? (
              <Section
                icon={Bell}
                title="אני אזכיר לך"
                glow="amber"
                note="שמתי לעצמי תזכורת אמיתית. לא תצטרך לזכור לבד."
              >
                {pendingReminders.map((r) => (
                  <ReminderRow key={r.id} reminder={r} />
                ))}
              </Section>
            ) : null}

            {/* ── חסמים במעקב ── */}
            {data.blockers.length > 0 ? (
              <Section
                icon={AlertTriangle}
                title="מה שמקשה עליך — ואיך נתגבר"
                glow="rose"
                note="זיהיתי את אלה ביחד איתך. נעבוד עליהם בעדינות, צעד-צעד, ואני עוקב."
              >
                {data.blockers.map((b) => (
                  <BlockerCard
                    key={b.id}
                    blocker={b}
                    busy={busyId?.startsWith(b.id) ?? false}
                    onHelped={() =>
                      run(`${b.id}-h`, () => postAction({ action: 'blocker_helped', blocker_id: b.id }))
                    }
                    onNotHelped={() =>
                      run(`${b.id}-n`, () => postAction({ action: 'blocker_not_helped', blocker_id: b.id }))
                    }
                    onResolve={() =>
                      run(`${b.id}-r`, () => postAction({ action: 'resolve_blocker', blocker_id: b.id }))
                    }
                  />
                ))}
              </Section>
            ) : null}

            {/* ── הושלמו ── */}
            {data.completed.length > 0 ? (
              <Section icon={CheckCircle2} title="כבר עשית את זה" glow="teal" note="להסתכל אחורה זה דלק. כל הכבוד.">
                {data.completed.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5"
                    style={cardStyle('teal')}
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-300" />
                    <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-teal-50/90 line-through decoration-teal-300/40">
                      {a.title}
                    </p>
                    <span className="shrink-0 text-[10px] font-semibold text-teal-200/70">
                      {fmtDay(a.last_done_at)}
                    </span>
                  </li>
                ))}
              </Section>
            ) : null}

            {/* ── תזכורות שנשלחו (מצומצם) ── */}
            {sentReminders.length > 0 ? (
              <details className="group">
                <summary className="cursor-pointer list-none px-1 text-[11px] font-bold uppercase tracking-wide text-white/50">
                  תזכורות שכבר שלחתי ({sentReminders.length})
                </summary>
                <ul className="mt-2 space-y-2">
                  {sentReminders.slice(0, 8).map((r) => (
                    <li key={r.id} className="rounded-2xl px-3 py-2.5 opacity-80" style={cardStyle('slate')}>
                      <p className="text-[13px] text-white/85">{r.body}</p>
                      <p className="mt-1 text-[10px] text-white/45">נשלחה {fmt(r.sent_at)}</p>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── רקע אורה ───────────────────────── */

function AuroraBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 50% -10%, #10243f 0%, #0a1020 55%, #070a14 100%)' }} />
      <motion.div
        className="absolute -right-24 -top-16 h-72 w-72 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.45), transparent 70%)', filter: 'blur(40px)' }}
        animate={{ y: [0, 22, 0], opacity: [0.55, 0.8, 0.55] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -left-24 top-32 h-80 w-80 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.4), transparent 70%)', filter: 'blur(46px)' }}
        animate={{ y: [0, -26, 0], opacity: [0.45, 0.75, 0.45] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-0 right-10 h-72 w-72 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(217,70,239,0.32), transparent 70%)', filter: 'blur(50px)' }}
        animate={{ y: [0, 18, 0], opacity: [0.4, 0.65, 0.4] }}
        transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

/* ───────────────────────── פרימיטיבים ───────────────────────── */

type Glow = 'emerald' | 'amber' | 'rose' | 'teal' | 'sky' | 'slate' | 'indigo';

const GLOW_RGB: Record<Glow, string> = {
  emerald: '16,185,129',
  amber: '245,158,11',
  rose: '244,63,94',
  teal: '20,184,166',
  sky: '56,189,248',
  slate: '148,163,184',
  indigo: '129,140,248',
};

function cardStyle(glow: Glow): React.CSSProperties {
  const rgb = GLOW_RGB[glow];
  return {
    background: `linear-gradient(150deg, rgba(${rgb},0.16) 0%, rgba(255,255,255,0.05) 60%, rgba(255,255,255,0.03) 100%)`,
    border: `1px solid rgba(${rgb},0.30)`,
    backdropFilter: 'blur(16px) saturate(140%)',
    WebkitBackdropFilter: 'blur(16px) saturate(140%)',
    boxShadow: `0 10px 30px rgba(0,0,0,0.35), 0 0 22px rgba(${rgb},0.10), inset 0 1px 0 rgba(255,255,255,0.12)`,
  };
}

function GlassCard({ glow, children }: { glow: Glow; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl p-4" style={cardStyle(glow)}>
      {children}
    </div>
  );
}

function LivePill({ live, pulsing }: { live: boolean; pulsing: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black"
      style={{
        background: live ? 'rgba(16,185,129,0.18)' : 'rgba(148,163,184,0.18)',
        border: `1px solid rgba(${live ? '16,185,129' : '148,163,184'},0.4)`,
        color: live ? '#a7f3d0' : '#cbd5e1',
      }}
    >
      <motion.span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: live ? '#34d399' : '#94a3b8' }}
        animate={pulsing || live ? { scale: [1, 1.6, 1], opacity: [1, 0.5, 1] } : {}}
        transition={{ duration: 1.4, repeat: Infinity }}
      />
      {live ? 'חי' : 'מתחבר'}
    </span>
  );
}

function Section({
  icon: Icon,
  title,
  glow,
  note,
  children,
}: {
  icon: typeof Sparkles;
  title: string;
  glow: Glow;
  note?: string;
  children: React.ReactNode;
}) {
  const rgb = GLOW_RGB[glow];
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-1">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-xl"
          style={{ background: `rgba(${rgb},0.18)`, border: `1px solid rgba(${rgb},0.4)` }}
        >
          <Icon className="h-4 w-4" style={{ color: `rgb(${rgb})` }} aria-hidden />
        </span>
        <h2 className="text-[15px] font-black text-white">{title}</h2>
      </div>
      {note ? <p className="mb-2.5 px-1 text-[12px] leading-relaxed text-white/55">{note}</p> : null}
      <ul className="space-y-2.5">{children}</ul>
    </section>
  );
}

/* ───────────────────────── כרטיסים ───────────────────────── */

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
  const isRecurring = assignment.schedule !== 'one_time';
  const doneToday =
    Boolean(assignment.last_done_at) && fmtDay(assignment.last_done_at) === fmtDay(new Date().toISOString());

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="rounded-2xl p-3.5"
      style={cardStyle('emerald')}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
          {isRecurring ? <Repeat className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
          {SCHEDULE_LABEL[assignment.schedule]}
        </span>
        {assignment.done_count > 0 ? (
          <span className="text-[10px] font-bold text-emerald-300">בוצע {assignment.done_count}×</span>
        ) : null}
      </div>
      <p className="text-[15px] font-black leading-snug text-white">{assignment.title}</p>
      {assignment.reason ? (
        <p className="mt-1 text-[12.5px] leading-relaxed text-emerald-100/75">
          <span className="font-bold text-emerald-200">למה: </span>
          {assignment.reason}
        </p>
      ) : null}
      {assignment.detail ? (
        <p className="mt-0.5 text-[12px] leading-relaxed text-white/55">{assignment.detail}</p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || doneToday}
          onClick={onDone}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13.5px] font-black text-white transition active:scale-95 disabled:opacity-60"
          style={{
            background: doneToday
              ? 'linear-gradient(135deg, #34d399, #059669)'
              : 'linear-gradient(135deg, #059669, #10b981)',
            boxShadow: '0 6px 18px rgba(16,185,129,0.35)',
          }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {doneToday ? 'בוצע היום ✨' : isRecurring ? 'עשיתי היום' : 'סיימתי'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDrop}
          className="rounded-xl px-3 py-2.5 text-[12px] font-bold text-white/70 transition active:scale-95 disabled:opacity-50"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)' }}
        >
          לא מתאים
        </button>
      </div>
    </motion.li>
  );
}

function ReminderRow({ reminder }: { reminder: Reminder }) {
  return (
    <li className="rounded-2xl p-3" style={cardStyle('amber')}>
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
          {REMINDER_KIND[reminder.kind]}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-amber-100/70">
          <Clock className="h-3 w-3" />
          {fmt(reminder.fire_at)}
        </span>
      </div>
      <p className="text-[13.5px] leading-relaxed text-white/90">{reminder.body}</p>
    </li>
  );
}

const BLOCKER_STATUS: Record<Blocker['status'], { label: string; rgb: string }> = {
  open: { label: 'במעקב', rgb: '244,63,94' },
  improving: { label: 'משתפר', rgb: '245,158,11' },
  resolved: { label: 'נפתר', rgb: '16,185,129' },
};

function BlockerCard({
  blocker,
  busy,
  onHelped,
  onNotHelped,
  onResolve,
}: {
  blocker: Blocker;
  busy: boolean;
  onHelped: () => void;
  onNotHelped: () => void;
  onResolve: () => void;
}) {
  const st = BLOCKER_STATUS[blocker.status];
  const history = (Array.isArray(blocker.history) ? blocker.history : []).slice(-6).reverse();

  return (
    <motion.li layout className="rounded-2xl p-3.5" style={cardStyle('rose')}>
      <div className="mb-1 flex items-center gap-2">
        <span
          className="rounded-md px-1.5 py-0.5 text-[10px] font-black"
          style={{ background: `rgba(${st.rgb},0.18)`, color: `rgb(${st.rgb})`, border: `1px solid rgba(${st.rgb},0.4)` }}
        >
          {st.label}
        </span>
        {blocker.next_check_at ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-white/55">
            <Clock className="h-3 w-3" />
            נבדוק יחד {fmtDay(blocker.next_check_at)}
          </span>
        ) : null}
      </div>

      <p className="text-[14.5px] font-black leading-snug text-white">{blocker.description}</p>
      {blocker.strategy ? (
        <p className="mt-1 text-[12.5px] leading-relaxed text-rose-100/80">
          <span className="font-bold text-rose-200">מה ננסה: </span>
          {blocker.strategy}
        </p>
      ) : null}

      {/* טיים-ליין היסטוריה: מה עזר / מה לא עזר */}
      {history.length > 0 ? (
        <div className="mt-3 border-r border-white/10 pr-3">
          {history.map((h, i) => {
            const rgb = BLOCKER_STATUS[(h.status as Blocker['status']) in BLOCKER_STATUS ? (h.status as Blocker['status']) : 'open'].rgb;
            const helped = h.note?.includes('עזר') && !h.note?.includes('לא עזר');
            const notHelped = h.note?.includes('לא עזר');
            return (
              <div key={i} className="relative flex items-start gap-2 pb-2 last:pb-0">
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: notHelped ? '#fb7185' : helped ? '#34d399' : `rgb(${rgb})` }}
                />
                <div className="min-w-0">
                  <p className="text-[12px] text-white/80">{h.note ?? h.status}</p>
                  <p className="text-[10px] text-white/40">{fmtDay(h.at)}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {blocker.status !== 'resolved' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onHelped}
            className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[12px] font-bold text-emerald-100 transition active:scale-95 disabled:opacity-60"
            style={{ background: 'rgba(16,185,129,0.16)', border: '1px solid rgba(16,185,129,0.4)' }}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            עזר לי
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onNotHelped}
            className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[12px] font-bold text-rose-100 transition active:scale-95 disabled:opacity-60"
            style={{ background: 'rgba(244,63,94,0.16)', border: '1px solid rgba(244,63,94,0.4)' }}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            לא עזר
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onResolve}
            className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[12px] font-black text-white transition active:scale-95 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#059669,#10b981)', boxShadow: '0 4px 14px rgba(16,185,129,0.3)' }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            נפתר
          </button>
        </div>
      ) : null}
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
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="rounded-3xl p-4"
      style={cardStyle('indigo')}
    >
      <div className="mb-1 flex items-center gap-2">
        <Snowflake className="h-5 w-5 text-indigo-200" />
        <p className="text-[15px] font-black text-white">
          {isProposed ? 'בוא ניקח אוויר ביחד' : 'מצב פוקוס פעיל'}
        </p>
      </div>
      <p className="text-[13px] leading-relaxed text-indigo-50/85">
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
              className="flex-1 rounded-xl px-3 py-2.5 text-[13px] font-black text-white transition active:scale-95 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#6366f1,#818cf8)', boxShadow: '0 6px 18px rgba(99,102,241,0.4)' }}
            >
              בוא נתמקד
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDecline}
              className="rounded-xl px-4 py-2.5 text-[12px] font-bold text-white/75 transition active:scale-95 disabled:opacity-60"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)' }}
            >
              לא עכשיו
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onEnd}
            className="w-full rounded-xl px-3 py-2.5 text-[13px] font-bold text-white transition active:scale-95 disabled:opacity-60"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)' }}
          >
            חזרתי לשגרה 💪
          </button>
        )}
      </div>
    </motion.div>
  );
}
