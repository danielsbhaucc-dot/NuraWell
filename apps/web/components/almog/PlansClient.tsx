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

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'בוקר טוב';
  if (h < 17) return 'צהריים טובים';
  if (h < 21) return 'ערב טוב';
  return 'לילה טוב';
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
  const blockerCount = data?.blockers.length ?? 0;
  const reminderCount = pendingReminders.length;
  const name = firstName?.trim() || '';

  return (
    <div dir="rtl" className="relative min-h-[calc(100vh-9rem)] overflow-hidden">
      <SoftBackground />

      <div className="container-mobile relative z-10 space-y-4 pb-10">
        {/* ── HERO ── */}
        <Hero
          name={name}
          live={live}
          pulsing={justUpdated}
          active={activeCount}
          reminders={reminderCount}
          blockers={blockerCount}
        />

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
              tint="emerald"
              note={activeCount > 0 ? 'כל סימון כאן הוא ניצחון אמיתי — גם הקטן.' : undefined}
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
                <EmptyHint text="אין כרגע צעד פתוח. כשנסכם משהו בשיחה — אשים אותו פה בשבילך." />
              )}
            </Section>

            {/* ── תזכורות ── */}
            {pendingReminders.length > 0 ? (
              <Section icon={Bell} title="אזכיר לך" tint="amber" note="שמתי לעצמי תזכורת אמיתית — לא תצטרך לזכור לבד.">
                {pendingReminders.map((r) => (
                  <ReminderRow key={r.id} reminder={r} />
                ))}
              </Section>
            ) : null}

            {/* ── חסמים ── */}
            {data.blockers.length > 0 ? (
              <Section
                icon={AlertTriangle}
                title="מה שמקשה — ואיך נתגבר"
                tint="rose"
                note="אני עוקב אחרי אלה בעצמי ואשאל אותך כשצריך. תוכל גם לסמן כאן מה עוזר."
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
              <Section icon={CheckCircle2} title="כבר עשית את זה" tint="teal" note="להסתכל אחורה זה דלק. כל הכבוד.">
                {data.completed.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2.5 rounded-2xl border border-teal-100 bg-teal-50/70 px-3 py-2.5"
                  >
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

            {/* ── תזכורות שנשלחו ── */}
            {sentReminders.length > 0 ? (
              <details className="group px-1">
                <summary className="cursor-pointer list-none text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  תזכורות שכבר שלחתי ({sentReminders.length})
                </summary>
                <ul className="mt-2 space-y-2">
                  {sentReminders.slice(0, 8).map((r) => (
                    <li key={r.id} className="rounded-2xl border border-slate-200/70 bg-white/60 px-3 py-2.5">
                      <p className="text-[13px] text-slate-700">{r.body}</p>
                      <p className="mt-1 text-[10px] text-slate-400">נשלחה {fmt(r.sent_at)}</p>
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
  'אני לא סופר כמה נפלת, אני סופר כמה קמת. ואתה קם שוב ושוב.',
];

function EncouragementCard({ name }: { name: string }) {
  // ניואנס יומי יציב (לא קופץ בכל רינדור).
  const idx = new Date().getDate() % ALMOG_NUDGES.length;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="rounded-3xl p-4"
      style={{
        background: 'linear-gradient(160deg, rgba(236,253,245,0.95), rgba(240,253,250,0.8))',
        border: '1px solid rgba(16,185,129,0.20)',
        boxShadow: '0 8px 26px rgba(16,185,129,0.08)',
      }}
    >
      <div className="mb-1 flex items-center gap-1.5 text-emerald-700">
        <Sparkles className="h-4 w-4" />
        <span className="text-[12px] font-black">מילה ממני{name ? `, ${name}` : ''}</span>
      </div>
      <p className="text-[13px] leading-relaxed text-slate-600">{ALMOG_NUDGES[idx]}</p>
    </motion.div>
  );
}

/* ───────────────────────── רקע רך ───────────────────────── */

function SoftBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, #f0fdf9 0%, #f6fbff 45%, #ffffff 100%)' }}
      />
      <div
        className="absolute -right-20 -top-16 h-64 w-64 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.18), transparent 70%)', filter: 'blur(36px)' }}
      />
      <div
        className="absolute -left-24 top-44 h-72 w-72 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.16), transparent 70%)', filter: 'blur(44px)' }}
      />
      <div
        className="absolute bottom-10 right-0 h-60 w-60 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.12), transparent 70%)', filter: 'blur(44px)' }}
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-[28px] p-5"
      style={{
        background: 'linear-gradient(150deg, #065f46 0%, #047857 42%, #10b981 100%)',
        boxShadow: '0 18px 44px rgba(6,95,70,0.32), inset 0 1px 0 rgba(255,255,255,0.22)',
      }}
    >
      {/* highlight glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.28), transparent 70%)', filter: 'blur(8px)' }}
      />
      {/* עלים מרחפים — בהשראת עמוד ה-404 */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-3 top-3 text-2xl"
        animate={{ rotate: [0, -12, 12, 0], y: [0, -3, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        🍃
      </motion.div>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute bottom-3 left-10 text-lg opacity-80"
        animate={{ rotate: [0, 14, -10, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
      >
        🌿
      </motion.div>
      <div className="relative flex items-center gap-3.5">
        <div className="rounded-full ring-2 ring-white/40">
          <AlmogAvatarChip size={56} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[12px] font-semibold text-emerald-50/85">{greeting()}{name ? `, ${name}` : ''}</p>
            <LivePill live={live} pulsing={pulsing} />
          </div>
          <h1 className="mt-0.5 text-[20px] font-black leading-tight text-white drop-shadow-sm">
            התוכנית שלנו
          </h1>
          <p className="mt-1 text-[12.5px] leading-relaxed text-emerald-50/85">
            ריכזתי כאן כל מה שסיכמנו. צעד קטן בכל פעם — ואני איתך בכל אחד מהם. 🌱
          </p>
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-2">
        <HeroStat value={active} label="צעדים פעילים" />
        <HeroStat value={reminders} label="תזכורות" />
        <HeroStat value={blockers} label="במעקב" />
      </div>
    </motion.section>
  );
}

function HeroStat({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="rounded-2xl px-2 py-2.5 text-center"
      style={{
        background: 'rgba(255,255,255,0.16)',
        border: '1px solid rgba(255,255,255,0.28)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <p className="text-[20px] font-black leading-none text-white">{value}</p>
      <p className="mt-1 text-[10px] font-semibold text-emerald-50/85">{label}</p>
    </div>
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

function glassStyle(tint: Tint): React.CSSProperties {
  const t = TINT[tint];
  return {
    background: `linear-gradient(160deg, rgba(${t.soft},0.92) 0%, rgba(255,255,255,0.72) 100%)`,
    border: '1px solid rgba(255,255,255,0.85)',
    backdropFilter: 'blur(20px) saturate(150%)',
    WebkitBackdropFilter: 'blur(20px) saturate(150%)',
    boxShadow: `0 10px 30px rgba(15,23,42,0.07), 0 1px 0 rgba(255,255,255,0.9) inset`,
  };
}

function Card({ tint, children }: { tint: Tint; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl p-4" style={glassStyle(tint)}>
      {children}
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

function Section({
  icon: Icon,
  title,
  tint,
  note,
  children,
}: {
  icon: typeof Sparkles;
  title: string;
  tint: Tint;
  note?: string;
  children: React.ReactNode;
}) {
  const t = TINT[tint];
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-2xl"
          style={{ background: `rgba(${t.rgb},0.14)`, border: `1px solid rgba(${t.rgb},0.28)` }}
        >
          <Icon className="h-4 w-4" style={{ color: t.text }} aria-hidden />
        </span>
        <h2 className="text-[15px] font-black text-slate-900">{title}</h2>
      </div>
      {note ? <p className="mb-2.5 px-1 text-[12px] leading-relaxed text-slate-500">{note}</p> : null}
      <ul className="space-y-2.5">{children}</ul>
    </section>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <li className="rounded-2xl border border-slate-200/70 bg-white/60 px-4 py-5 text-center text-sm text-slate-500">
      {text}
    </li>
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
      className="rounded-3xl p-3.5"
      style={glassStyle('emerald')}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
          {isRecurring ? <Repeat className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
          {SCHEDULE_LABEL[assignment.schedule]}
        </span>
        {assignment.done_count > 0 ? (
          <span className="text-[10px] font-bold text-emerald-600">בוצע {assignment.done_count}×</span>
        ) : null}
      </div>
      <p className="text-[15px] font-black leading-snug text-slate-900">{assignment.title}</p>
      {assignment.reason ? (
        <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
          <span className="font-bold text-emerald-700">למה: </span>
          {assignment.reason}
        </p>
      ) : null}
      {assignment.detail ? (
        <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">{assignment.detail}</p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || doneToday}
          onClick={onDone}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl px-3 py-2.5 text-[13.5px] font-black text-white transition active:scale-95 disabled:opacity-60"
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
          className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2.5 text-[12px] font-bold text-slate-500 transition active:scale-95 disabled:opacity-50"
        >
          לא מתאים
        </button>
      </div>
    </motion.li>
  );
}

function ReminderRow({ reminder }: { reminder: Reminder }) {
  return (
    <li className="rounded-3xl p-3.5" style={glassStyle('amber')}>
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
          {REMINDER_KIND[reminder.kind]}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-amber-700/70">
          <Clock className="h-3 w-3" />
          {fmt(reminder.fire_at)}
        </span>
      </div>
      <p className="text-[13.5px] leading-relaxed text-slate-800">{reminder.body}</p>
    </li>
  );
}

const BLOCKER_STATUS: Record<Blocker['status'], { label: string; bg: string; fg: string }> = {
  open: { label: 'במעקב', bg: 'bg-rose-100', fg: 'text-rose-700' },
  improving: { label: 'משתפר', bg: 'bg-amber-100', fg: 'text-amber-700' },
  resolved: { label: 'נפתר', bg: 'bg-emerald-100', fg: 'text-emerald-700' },
};

/** תרגום סטטוס היסטוריה לעברית (כשאין note מפורש). */
const STATUS_HE: Record<string, string> = {
  open: 'זוהה',
  improving: 'יש שיפור',
  resolved: 'נפתר',
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
    <motion.li layout className="rounded-3xl p-3.5" style={glassStyle('rose')}>
      <div className="mb-1 flex items-center gap-2">
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${st.bg} ${st.fg}`}>{st.label}</span>
        {blocker.next_check_at ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
            <Clock className="h-3 w-3" />
            נבדוק יחד {fmtDay(blocker.next_check_at)}
          </span>
        ) : null}
      </div>

      <p className="text-[14.5px] font-black leading-snug text-slate-900">{blocker.description}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
        <span className="font-bold text-rose-600">מה ננסה: </span>
        {blocker.strategy ? blocker.strategy : 'עוד לא סיכמנו דרך — נדבר על זה בצ׳אט ונבנה צעד קטן יחד.'}
      </p>

      {history.length > 0 ? (
        <div className="mt-3 border-r-2 border-rose-100 pr-3">
          {history.map((h, i) => {
            const helped = h.note?.includes('עזר') && !h.note?.includes('לא עזר');
            const notHelped = h.note?.includes('לא עזר');
            return (
              <div key={i} className="relative flex items-start gap-2 pb-2 last:pb-0">
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: notHelped ? '#fb7185' : helped ? '#34d399' : '#cbd5e1' }}
                />
                <div className="min-w-0">
                  <p className="text-[12px] text-slate-700">{h.note ?? STATUS_HE[h.status] ?? h.status}</p>
                  <p className="text-[10px] text-slate-400">{fmtDay(h.at)}</p>
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
            className="inline-flex items-center gap-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-bold text-emerald-700 transition active:scale-95 disabled:opacity-60"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            עזר לי
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onNotHelped}
            className="inline-flex items-center gap-1 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-bold text-rose-700 transition active:scale-95 disabled:opacity-60"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            לא עזר
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onResolve}
            className="inline-flex items-center gap-1 rounded-2xl px-3 py-2 text-[12px] font-black text-white transition active:scale-95 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#059669,#10b981)', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}
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
      style={glassStyle('indigo')}
    >
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
    </motion.div>
  );
}
