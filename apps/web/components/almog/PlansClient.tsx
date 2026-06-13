'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
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
import { frictionCategoryLabel, normalizeFrictionCategory } from '@/lib/ai/almog-commitments/friction';
import { dispatchOpenAlmogChatWithPrefill } from '@/lib/notifications/open-almog-chat';
import type { BlockerOption } from '@/lib/ai/almog-commitments/types';

type AssignmentRelation = 'standalone' | 'replaces' | 'eases' | 'supports';

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
  category: string | null;
  attempt_count: number;
  current_options: BlockerOption[] | null;
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


async function postBlockerAction(body: Record<string, string>): Promise<void> {
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
  await res.json();
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

      {/* ── HERO ברוחב מלא (full-bleed) ── */}
      <Hero
        name={name}
        live={live}
        pulsing={justUpdated}
        active={activeCount}
        reminders={reminderCount}
        blockers={blockerCount}
      />

      <div className="container-mobile relative z-10 space-y-4 pb-10 pt-5">
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
              count={activeCount}
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
              <Section icon={Bell} title="אזכיר לך" tint="amber" count={pendingReminders.length} note="שמתי לעצמי תזכורת אמיתית — לא תצטרך לזכור לבד.">
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
                count={data.blockers.length}
                note="אני עוקב אחרי אלה בעצמי ואשאל אותך כשצריך. תוכל גם לסמן כאן מה עוזר."
              >
                {data.blockers.map((b, idx) => (
                  <BlockerCard
                    key={b.id}
                    index={idx + 1}
                    blocker={b}
                    busy={busyId?.startsWith(b.id) ?? false}
                    onGenerate={() =>
                      run(`${b.id}-g`, () =>
                        postBlockerAction({ action: 'generate_options', blocker_id: b.id })
                      )
                    }
                    onPick={(optionId) =>
                      run(`${b.id}-p`, () =>
                        postBlockerAction({ action: 'pick', blocker_id: b.id, option_id: optionId })
                      )
                    }
                    onHelped={() =>
                      run(`${b.id}-h`, () => postBlockerAction({ action: 'helped', blocker_id: b.id }))
                    }
                    onNotHelped={() =>
                      run(`${b.id}-n`, () => postBlockerAction({ action: 'not_helped', blocker_id: b.id }))
                    }
                    onResolve={() =>
                      run(`${b.id}-r`, () => postBlockerAction({ action: 'resolve', blocker_id: b.id }))
                    }
                    onAsk={() => {
                      const step = b.strategy ? ` ניסינו "${b.strategy}".` : '';
                      dispatchOpenAlmogChatWithPrefill(
                        `אלמוג, לגבי "${b.description}" —${step} לא בטוח שהבנתי, אפשר שתסביר לי שוב בפשטות?`
                      );
                    }}
                  />
                ))}
              </Section>
            ) : null}

            {/* ── הושלמו ── */}
            {data.completed.length > 0 ? (
              <Section icon={CheckCircle2} title="כבר עשית את זה" tint="teal" count={data.completed.length} note="להסתכל אחורה זה דלק. כל הכבוד.">
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
      className="relative z-10 w-full overflow-hidden rounded-b-[40px] pb-8 pt-8"
      style={{
        background:
          'linear-gradient(155deg, #064e3b 0%, #047857 38%, #0d9488 72%, #10b981 100%)',
        boxShadow: '0 26px 60px rgba(6,78,59,0.40), inset 0 1px 0 rgba(255,255,255,0.18)',
      }}
    >
      {/* שכבת ברק עליונה — מדמה השתקפות זכוכית על ה-hero */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-2/3"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%)',
        }}
      />
      {/* קו זוהר תחתון עדין */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-6 bottom-0 h-px rounded-full"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)' }}
      />
      {/* זוהר אור פינתי */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.28), transparent 68%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(45,212,191,0.40), transparent 70%)' }}
      />
      {/* טבעת דקורטיבית */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-20 top-2 h-48 w-48 rounded-full border"
        style={{ borderColor: 'rgba(255,255,255,0.14)' }}
        animate={{ rotate: 360 }}
        transition={{ duration: 70, repeat: Infinity, ease: 'linear' }}
      />
      {/* עלה מרחף */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute right-6 top-6 text-2xl"
        animate={{ rotate: [0, -12, 12, 0], y: [0, -4, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        🍃
      </motion.div>

      {/* תוכן מיושר לרוחב התוכן של הדף */}
      <div className="container-mobile relative">
        <div className="flex items-center gap-4">
          <motion.div
            className="relative shrink-0 rounded-full p-1"
            style={{
              background: 'linear-gradient(140deg, rgba(255,255,255,0.55), rgba(255,255,255,0.12))',
              boxShadow: '0 8px 22px rgba(0,0,0,0.18)',
            }}
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="rounded-full ring-2 ring-white/50">
              <AlmogAvatarChip size={68} />
            </div>
            <span
              aria-hidden
              className="absolute -bottom-0.5 -left-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
              style={{ background: '#ecfdf5', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}
            >
              🌱
            </span>
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
                style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)' }}
              >
                <Sparkles className="h-3 w-3" />
                {greeting()}{name ? `, ${name}` : ''}
              </span>
              <LivePill live={live} pulsing={pulsing} />
            </div>
            <h1 className="mt-2 text-[26px] font-black leading-[1.1] text-white drop-shadow-sm">
              התוכנית שלנו
            </h1>
          </div>
        </div>

        <p className="mt-3 text-[13.5px] leading-relaxed text-emerald-50/90">
          ריכזתי כאן כל מה שסיכמנו — צעד קטן בכל פעם, ואני איתך בכל אחד מהם. 🌱
        </p>

        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <HeroStat icon={Sparkles} value={active} label="צעדים פעילים" />
          <HeroStat icon={Bell} value={reminders} label="תזכורות" />
          <HeroStat icon={AlertTriangle} value={blockers} label="במעקב" />
        </div>
      </div>
    </motion.section>
  );
}

function HeroStat({ icon: Icon, value, label }: { icon: typeof Sparkles; value: number; label: string }) {
  return (
    <motion.div
      whileTap={{ scale: 0.96 }}
      className="relative overflow-hidden rounded-2xl px-2 py-3 text-center"
      style={{
        background: 'linear-gradient(165deg, rgba(255,255,255,0.28), rgba(255,255,255,0.10))',
        backdropFilter: 'blur(14px) saturate(160%)',
        WebkitBackdropFilter: 'blur(14px) saturate(160%)',
        border: '1px solid rgba(255,255,255,0.45)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), 0 10px 28px rgba(0,0,0,0.14)',
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.35), transparent)' }}
      />
      <Icon className="relative mx-auto mb-1 h-4 w-4 text-emerald-50/95" aria-hidden />
      <p className="relative text-[25px] font-black leading-none text-white drop-shadow-sm">{value}</p>
      <p className="relative mt-1 text-[10px] font-semibold text-emerald-50/90">{label}</p>
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
    background: `linear-gradient(160deg, rgba(255,255,255,0.86) 0%, rgba(255,255,255,0.64) 42%, rgba(${t.soft},0.5) 100%)`,
    backdropFilter: 'blur(28px) saturate(190%)',
    WebkitBackdropFilter: 'blur(28px) saturate(190%)',
    border: `1px solid rgba(255,255,255,0.65)`,
    boxShadow: [
      `0 14px 40px rgba(15,23,42,0.10)`,
      `0 4px 12px rgba(15,23,42,0.05)`,
      `0 1px 0 rgba(${t.rgb},0.10)`,
      `inset 0 1px 0 rgba(255,255,255,0.92)`,
      `inset 0 -1px 0 rgba(${t.rgb},0.07)`,
    ].join(', '),
  };
}

/** שכבת "ברק" עליונה (specular highlight) לכרטיסי זכוכית — נותנת תחושת משטח מלוטש. */
function GlassSheen() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-[inherit]"
      style={{
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 100%)',
        opacity: 0.6,
      }}
    />
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

function SectionDivider({ tint }: { tint: Tint }) {
  const t = TINT[tint];
  return (
    <div className="flex items-center gap-2 px-3 py-1" aria-hidden>
      <span
        className="h-px flex-1 rounded-full"
        style={{ background: `linear-gradient(90deg, transparent, rgba(${t.rgb},0.35))` }}
      />
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: `rgba(${t.rgb},0.5)` }} />
      <span
        className="h-px flex-1 rounded-full"
        style={{ background: `linear-gradient(90deg, rgba(${t.rgb},0.35), transparent)` }}
      />
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  tint,
  note,
  count,
  children,
}: {
  icon: typeof Sparkles;
  title: string;
  tint: Tint;
  note?: string;
  count?: number;
  children: React.ReactNode;
}) {
  const t = TINT[tint];
  return (
    <section className="space-y-3">
      <SectionDivider tint={tint} />
      {/* כותרת בתיבת זכוכית צבעונית נקייה */}
      <div
        className="relative flex items-center gap-2.5 overflow-hidden rounded-2xl px-3 py-2.5"
        style={{
          background: `linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(${t.soft},0.78) 100%)`,
          backdropFilter: 'blur(18px) saturate(180%)',
          WebkitBackdropFilter: 'blur(18px) saturate(180%)',
          border: `1px solid rgba(255,255,255,0.7)`,
          boxShadow: `0 10px 24px rgba(${t.rgb},0.12), inset 0 1px 0 rgba(255,255,255,0.95)`,
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2"
          style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.4), transparent)' }}
        />
        <span
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: `linear-gradient(140deg, rgba(${t.rgb},0.98), rgba(${t.rgb},0.66))`,
            boxShadow: `0 6px 16px rgba(${t.rgb},0.42), inset 0 1px 0 rgba(255,255,255,0.5)`,
          }}
        >
          <Icon className="h-[18px] w-[18px] text-white" aria-hidden />
        </span>
        <h2 className="relative flex-1 text-[16px] font-black text-slate-900">{title}</h2>
        {typeof count === 'number' && count > 0 ? (
          <span
            className="relative flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] font-black text-white"
            style={{ background: `rgba(${t.rgb},0.9)`, boxShadow: `0 3px 8px rgba(${t.rgb},0.35)` }}
          >
            {count}
          </span>
        ) : null}
      </div>
      {note ? <p className="px-1 text-[12px] leading-relaxed text-slate-500">{note}</p> : null}
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
      className="relative overflow-hidden rounded-[24px] p-3.5"
      style={{ ...glassStyle('emerald'), ...(isEasedOriginal ? { opacity: 0.82 } : {}) }}
    >
      <GlassSheen />
      <div className="relative z-[1]">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
          {isRecurring ? <Repeat className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
          {SCHEDULE_LABEL[assignment.schedule]}
        </span>
        {relationMeta ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
            {relationMeta.emoji} {relationMeta.label}
          </span>
        ) : null}
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

      {isEasedOriginal ? (
        <div
          className="mt-3 rounded-2xl px-3 py-2.5 text-[12px] font-semibold leading-relaxed text-slate-500"
          style={{ background: 'rgba(148,163,184,0.12)', border: '1px solid rgba(148,163,184,0.22)' }}
        >
          הקלנו על זה זמנית — מתמקדים בצעד קטן יותר. ברגע שתסמן אותו, נחזיר את זה בהדרגה. 🪶
        </div>
      ) : (
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
      )}
      </div>
    </motion.li>
  );
}

function ReminderRow({ reminder }: { reminder: Reminder }) {
  return (
    <li className="relative overflow-hidden rounded-3xl p-3.5" style={glassStyle('amber')}>
      <GlassSheen />
      <div className="relative z-[1]">
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
      </div>
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
  index,
  blocker,
  busy,
  onGenerate,
  onPick,
  onHelped,
  onNotHelped,
  onResolve,
  onAsk,
}: {
  index: number;
  blocker: Blocker;
  busy: boolean;
  onGenerate: () => void;
  onPick: (optionId: 'A' | 'B') => void;
  onHelped: () => void;
  onNotHelped: () => void;
  onResolve: () => void;
  onAsk: () => void;
}) {
  const st = BLOCKER_STATUS[blocker.status];
  const history = (Array.isArray(blocker.history) ? blocker.history : []).slice(-6).reverse();
  const options = Array.isArray(blocker.current_options) ? blocker.current_options : [];
  const hasOptions = options.length >= 2;
  const categoryLabel = blocker.category
    ? frictionCategoryLabel(blocker.category)
    : frictionCategoryLabel(normalizeFrictionCategory(null));

  return (
    <motion.li layout className="relative rounded-[24px] p-4" style={glassStyle('rose')}>
      {/* מספר מעוצב */}
      <span
        className="absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-2xl text-[13px] font-black text-white shadow-lg"
        style={{
          background: 'linear-gradient(135deg, #fb7185, #e11d48)',
          boxShadow: '0 4px 14px rgba(225,29,72,0.35)',
        }}
        aria-label={`קושי מספר ${index}`}
      >
        {index}
      </span>

      <div className="mb-2 flex flex-wrap items-center gap-2 pr-6">
        <span className={`rounded-lg px-2 py-0.5 text-[10px] font-black ${st.bg} ${st.fg}`}>{st.label}</span>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-rose-800/80"
          style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(244,63,94,0.18)' }}
        >
          {categoryLabel}
        </span>
        {blocker.attempt_count > 0 ? (
          <span className="text-[10px] font-semibold text-slate-400">ניסיון {blocker.attempt_count + 1}</span>
        ) : null}
        {blocker.next_check_at ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
            <Clock className="h-3 w-3" />
            אחזור {fmtDay(blocker.next_check_at)}
          </span>
        ) : null}
      </div>

      <p className="text-[15px] font-black leading-snug text-slate-900">{blocker.description}</p>

      {blocker.strategy ? (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-600">
          <span className="font-bold text-rose-600">מה ננסה עכשיו: </span>
          {blocker.strategy}
        </p>
      ) : null}

      {/* אופציות — שתי דרכים קטנות לבחור מתוכן */}
      {hasOptions ? (
        <div
          className="mt-3 rounded-[20px] p-3.5"
          style={{
            background: 'linear-gradient(180deg, rgba(238,242,255,0.85), rgba(245,243,255,0.7))',
            border: '1px solid rgba(99,102,241,0.16)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
          }}
        >
          <div className="mb-2.5 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100">
              <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
            </span>
            <p className="text-[12px] font-bold leading-snug text-slate-600">
              חשבתי על שתי דרכים קטנות. מה מרגיש לך נכון יותר עכשיו?
            </p>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {options.map((opt, oi) => (
              <button
                key={opt.id}
                type="button"
                disabled={busy}
                onClick={() => onPick(opt.id)}
                className="group relative flex h-full flex-col rounded-2xl p-3.5 text-right transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] disabled:opacity-60"
                style={{
                  background: 'rgba(255,255,255,0.92)',
                  border: '1px solid rgba(99,102,241,0.2)',
                  boxShadow: '0 2px 10px rgba(99,102,241,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
                }}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-black text-white shadow-sm"
                    style={{
                      background:
                        oi === 0
                          ? 'linear-gradient(135deg,#6366f1,#818cf8)'
                          : 'linear-gradient(135deg,#8b5cf6,#a78bfa)',
                    }}
                  >
                    {oi === 0 ? 'א' : 'ב'}
                  </span>
                  <p className="text-[12.5px] font-black leading-tight text-indigo-900">{opt.label}</p>
                </div>
                <p className="text-[12px] leading-relaxed text-slate-600">{opt.micro_step}</p>
                {opt.relation && opt.relation !== 'standalone' && opt.relation !== 'supports' ? (
                  <span className="mt-2 inline-flex w-fit items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[9.5px] font-bold text-indigo-600">
                    {opt.relation === 'replaces' ? '🔄 מחליף את המשימה' : '🪶 גרסה מוקלת'}
                  </span>
                ) : null}
                <span className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-500 opacity-0 transition group-hover:opacity-100">
                  בוא נתחיל מזה
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onAsk}
            className="mt-2.5 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-indigo-500 transition hover:text-indigo-700 disabled:opacity-50"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            לא הבנתי משהו — בוא נדבר
          </button>
        </div>
      ) : blocker.status !== 'resolved' && !blocker.strategy ? (
        <div
          className="mt-3 rounded-2xl p-3 backdrop-blur-sm"
          style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)' }}
        >
          <p className="text-[12.5px] leading-relaxed text-slate-600">
            עוד לא סיכמנו דרך מדויקת. בוא נבנה 2 אופציות קטנות — ואתה תבחר מה מתאים.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onGenerate}
            className="mt-2 inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2.5 text-[12.5px] font-black text-white transition active:scale-95 disabled:opacity-60"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #818cf8)',
              boxShadow: '0 4px 14px rgba(99,102,241,0.32)',
            }}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            בוא נבנה צעד עכשיו
          </button>
        </div>
      ) : blocker.status !== 'resolved' && blocker.strategy && !hasOptions ? (
        <button
          type="button"
          disabled={busy}
          onClick={onGenerate}
          className="mt-2 text-[11px] font-bold text-indigo-600 underline-offset-2 hover:underline disabled:opacity-50"
        >
          רוצה לנסות גישה אחרת? הצע 2 אופציות חדשות
        </button>
      ) : null}

      {blocker.status !== 'resolved' && blocker.strategy ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
          {blocker.next_check_at
            ? `אזכיר לך מעצמי ב-${fmtDay(blocker.next_check_at)} — לא תצטרך לזכור.`
            : 'אני שומר על זה במעקב ואחזור אליך.'}
        </p>
      ) : null}

      {history.length > 0 ? (
        <div className="mt-3 border-r-2 border-rose-100/80 pr-3">
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
          {blocker.strategy ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onHelped}
                className="inline-flex items-center gap-1 rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-2 text-[12px] font-bold text-emerald-700 backdrop-blur-sm transition active:scale-95 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                עזר לי
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onNotHelped}
                className="inline-flex items-center gap-1 rounded-2xl border border-rose-200/80 bg-rose-50/80 px-3 py-2 text-[12px] font-bold text-rose-700 backdrop-blur-sm transition active:scale-95 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsDown className="h-3.5 w-3.5" />}
                לא עזר — ננסה אחרת
              </button>
            </>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={onAsk}
            className="inline-flex items-center gap-1 rounded-2xl border border-indigo-200/80 bg-indigo-50/70 px-3 py-2 text-[12px] font-bold text-indigo-700 backdrop-blur-sm transition active:scale-95 disabled:opacity-60"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            יש לי שאלה
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
