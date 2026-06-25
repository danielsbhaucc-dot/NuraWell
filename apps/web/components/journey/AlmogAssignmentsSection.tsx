'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Repeat,
  Sparkles,
  Snowflake,
  X,
} from 'lucide-react';
import { AlmogAvatarChip } from './AlmogPresence';

/* טיפוסי תצוגה — תואמים ל-API /api/v1/almog-assignments */
interface AssignmentView {
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
}

interface FocusView {
  id: string;
  status: 'proposed' | 'active';
  reason: string | null;
  paused_scope: 'reminders' | 'reminders_and_dim';
  ends_at: string | null;
}

interface CompletedView {
  id: string;
  title: string;
  reason: string | null;
  schedule: 'one_time' | 'daily' | 'weekly';
  given_at: string;
  last_done_at: string | null;
  done_count: number;
}

const SCHEDULE_LABEL: Record<AssignmentView['schedule'], string> = {
  one_time: 'חד-פעמי',
  daily: 'כל יום',
  weekly: 'שבועי',
};

const PAGE_SIZE = 3;

function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit' }).format(new Date(t));
}

function buildDynamicHeadline(
  visible: AssignmentView[],
  focus: FocusView | null
): { title: string; subtitle: string } {
  if (focus?.status === 'active') {
    return {
      title: 'אני מרכז אותך רק במה שחשוב עכשיו',
      subtitle: focus.reason
        ? `בפוקוס: ${focus.reason}`
        : 'שאר המשימות מחכות בצד — בלי לחץ',
    };
  }
  if (focus?.status === 'proposed') {
    return {
      title: 'יש לי הצעה — בוא נוריד רעש לרגע',
      subtitle: 'מצב פוקוס יוריד תזכורות על שאר המשימות',
    };
  }
  if (visible.length === 1) {
    return {
      title: 'יש לנו משימה אחת שדיברנו עליה',
      subtitle: 'סמן כשעשית — אני איתך',
    };
  }
  if (visible.length > 1) {
    return {
      title: `סיכמנו בינינו ${visible.length} משימות`,
      subtitle: 'אחת בכל פעם, בקצב שלך',
    };
  }
  return {
    title: 'אם תרצה — יש עוד מה לעשות',
    subtitle: 'פתח ונראה מה מחכה',
  };
}

function useAlmogAssignments() {
  const [assignments, setAssignments] = useState<AssignmentView[]>([]);
  const [focus, setFocus] = useState<FocusView | null>(null);
  const [completed, setCompleted] = useState<CompletedView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/almog-assignments', { credentials: 'include' });
      if (!res.ok) return;
      const json = (await res.json()) as {
        assignments: AssignmentView[];
        focus: FocusView | null;
        completed?: CompletedView[];
      };
      setAssignments(Array.isArray(json.assignments) ? json.assignments : []);
      setFocus(json.focus ?? null);
      setCompleted(Array.isArray(json.completed) ? json.completed : []);
    } catch {
      /* שקט — לא שוברים את עמוד המסע */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (payload: Record<string, unknown>, key: string) => {
      setBusyId(key);
      try {
        await fetch('/api/v1/almog-assignments', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        await load();
      } catch {
        /* ignore */
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  const visible = assignments.filter((a) => a.status === 'active' || a.status === 'frozen');

  return { visible, focus, completed, loaded, busyId, act };
}

/** משימות אישיות שהושלמו — מוצגות באזור "הושלמו" בעמוד המסע */
export function AlmogCompletedSection() {
  const { completed, loaded } = useAlmogAssignments();
  if (!loaded || completed.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="mb-2.5 px-1 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-800/65">
        משימות שסיימת איתי
      </p>
      <CompletedList items={completed} compact />
    </div>
  );
}

/**
 * פאנל תחתון — משימות פעילות מאלמוג + מצב פוקוס, באקורדיון שלא מציף את המסך.
 */
export function AlmogAssignmentsSection() {
  const { visible, focus, completed, loaded, busyId, act } = useAlmogAssignments();
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (loaded && visible.length === 0 && !focus) return null;
  if (!loaded) return null;

  const headline = buildDynamicHeadline(visible, focus);
  const shown = visible.slice(0, visibleCount);
  const hasMore = visible.length > visibleCount;
  const summaryCount = visible.length + (focus ? 1 : 0);

  return (
    <motion.section
      dir="rtl"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="mt-7"
    >
      <div
        className="overflow-hidden rounded-[24px]"
        style={{
          background:
            'linear-gradient(135deg, rgba(236,253,245,0.92) 0%, rgba(209,250,229,0.72) 100%)',
          backdropFilter: 'blur(14px) saturate(160%)',
          WebkitBackdropFilter: 'blur(14px) saturate(160%)',
          border: '1px solid rgba(110,231,183,0.45)',
          boxShadow: '0 8px 22px rgba(6,78,59,0.10), inset 0 1px 0 rgba(255,255,255,0.55)',
        }}
      >
        {/* כותרת אקורדיון */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-3 px-4 py-4 text-right no-tap-highlight"
          aria-expanded={expanded}
        >
          <AlmogAvatarChip size={40} />
          <div className="min-w-0 flex-1">
            <p
              className="text-[15px] font-black leading-snug"
              style={{ color: '#1A1730', fontFamily: "'Rubik','Heebo',sans-serif" }}
            >
              {headline.title}
            </p>
            <p className="mt-0.5 text-xs text-emerald-800/70">{headline.subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {summaryCount > 0 ? (
              <span
                className="rounded-full px-2 py-0.5 text-[10.5px] font-bold text-emerald-800"
                style={{ background: 'rgba(16,185,129,0.16)' }}
              >
                {summaryCount}
              </span>
            ) : null}
            <ChevronDown
              className={`h-5 w-5 text-emerald-700 transition-transform ${expanded ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </div>
        </button>

        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              key="panel-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="border-t border-emerald-200/50 px-4 pb-4 pt-3">
                <div className="mb-3 flex justify-end">
                  <Link
                    href="/plans"
                    prefetch
                    className="shrink-0 rounded-xl px-3 py-1.5 text-[11px] font-bold text-emerald-900 no-tap-highlight"
                    style={{
                      background: 'rgba(167,243,208,0.55)',
                      border: '1px solid rgba(52,211,153,0.45)',
                    }}
                  >
                    לכל התוכנית
                  </Link>
                </div>

                <AnimatePresence initial={false}>
                  {focus ? (
                    <FocusBanner
                      focus={focus}
                      busy={busyId === `focus-${focus.id}`}
                      onConfirm={() =>
                        act({ action: 'confirm_focus', focus_id: focus.id }, `focus-${focus.id}`)
                      }
                      onDecline={() =>
                        act({ action: 'decline_focus', focus_id: focus.id }, `focus-${focus.id}`)
                      }
                      onEnd={() =>
                        act({ action: 'end_focus', focus_id: focus.id }, `focus-${focus.id}`)
                      }
                    />
                  ) : null}
                </AnimatePresence>

                <div className="space-y-3">
                  <AnimatePresence initial={false}>
                    {shown.map((a) => (
                      <AssignmentCard
                        key={a.id}
                        assignment={a}
                        busy={busyId === a.id}
                        onDone={() => act({ action: 'done', assignment_id: a.id }, a.id)}
                        onDrop={() => act({ action: 'drop', assignment_id: a.id }, a.id)}
                      />
                    ))}
                  </AnimatePresence>
                </div>

                {hasMore ? (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                    className="mt-3 w-full rounded-xl py-2.5 text-[13px] font-bold text-emerald-800 transition active:scale-[0.98]"
                    style={{
                      background: 'rgba(16,185,129,0.12)',
                      border: '1px solid rgba(110,231,183,0.35)',
                    }}
                  >
                    הצג עוד ({visible.length - visibleCount} נוספות)
                  </button>
                ) : null}

                {visible.length === 0 && !focus && completed.length > 0 ? (
                  <p className="py-2 text-center text-[13px] text-emerald-800/70">
                    אין כרגע משימות פתוחות — כל הכבוד על מה שסיימת 🙌
                  </p>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

function CompletedList({
  items,
  compact = false,
}: {
  items: CompletedView[];
  compact?: boolean;
}) {
  return (
    <ul className={compact ? 'space-y-1.5' : 'space-y-1.5'}>
      {items.map((c) => {
        const when = formatDay(c.last_done_at) ?? formatDay(c.given_at);
        return (
          <li
            key={c.id}
            dir="rtl"
            className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5"
            style={{
              background:
                'linear-gradient(135deg, rgba(236,253,245,0.62) 0%, rgba(209,250,229,0.38) 100%)',
              backdropFilter: 'blur(10px) saturate(140%)',
              WebkitBackdropFilter: 'blur(10px) saturate(140%)',
              border: '1px solid rgba(110,231,183,0.32)',
            }}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1 text-right">
              <p className="truncate text-[13px] font-bold text-emerald-900/85 line-through decoration-emerald-700/40">
                {c.title}
              </p>
            </div>
            {when ? (
              <span className="shrink-0 text-[10.5px] font-semibold text-emerald-800/60">
                {when}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function FocusBanner({
  focus,
  busy,
  onConfirm,
  onDecline,
  onEnd,
}: {
  focus: FocusView;
  busy: boolean;
  onConfirm: () => void;
  onDecline: () => void;
  onEnd: () => void;
}) {
  const until = formatDay(focus.ends_at);
  const isProposed = focus.status === 'proposed';
  const pausesReminders =
    focus.paused_scope === 'reminders' || focus.paused_scope === 'reminders_and_dim';

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.4 }}
      className="relative mb-3 overflow-hidden rounded-[22px]"
      style={{
        background:
          'linear-gradient(135deg, rgba(6,78,59,0.92) 0%, rgba(4,120,87,0.88) 55%, rgba(2,44,34,0.94) 100%)',
        backdropFilter: 'blur(18px) saturate(150%)',
        WebkitBackdropFilter: 'blur(18px) saturate(150%)',
        border: '1px solid rgba(167,243,208,0.32)',
        boxShadow: '0 14px 34px rgba(2,44,34,0.26), inset 0 1px 0 rgba(255,255,255,0.16)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(251,191,36,0.32) 0%, transparent 70%)',
          filter: 'blur(20px)',
        }}
      />
      <div className="relative px-4 py-4">
        <div className="flex items-start gap-2.5">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'rgba(167,243,208,0.18)', border: '1px solid rgba(167,243,208,0.35)' }}
          >
            <Snowflake className="h-4 w-4 text-emerald-200" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-[10.5px] font-black uppercase tracking-[0.14em] text-emerald-200/90"
              style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
            >
              {isProposed ? 'הצעת מצב פוקוס' : 'מצב פוקוס פעיל'}
            </p>
            <p
              className="mt-1 text-[14px] font-bold leading-relaxed text-white"
              style={{ fontFamily: "'Rubik','Heebo',sans-serif", textShadow: '0 1px 6px rgba(2,44,34,0.45)' }}
            >
              {isProposed
                ? `אני מציע שנוריד רגע את שאר המשימות מהמסך${focus.reason ? ` ונתמקד ב${focus.reason}` : ''}.`
                : `אנחנו במצב פוקוס${until ? ` עד ${until}` : ''}${focus.reason ? ` — ${focus.reason}` : ''}.`}
            </p>
            <ul className="mt-2.5 space-y-1 text-[12px] leading-relaxed text-emerald-100/90">
              {pausesReminders ? (
                <li>· תזכורות על משימות אחרות ייעצרו — פחות רעש בפעמון</li>
              ) : null}
              <li>· ההתקדמות שלך נשמרת — שום דבר לא נמחק</li>
              <li>· הרגלים יומיים (כמו מים) ממשיכים להיספר אם סימנת אותם</li>
              <li>· כשתרגיש מוכן — לחץ &quot;חזרתי לשגרה&quot; ונחזיר הכל</li>
            </ul>
          </div>
        </div>

        {isProposed ? (
          <div className="mt-3.5 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13.5px] font-black text-emerald-950 transition-transform active:scale-95 disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, rgba(167,243,208,0.98), rgba(52,211,153,0.92))',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), 0 4px 12px rgba(2,44,34,0.25)',
              }}
            >
              <Check className="h-4 w-4" strokeWidth={2.6} />
              כן, בוא נתמקד
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDecline}
              className="flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold text-emerald-50 transition-transform active:scale-95 disabled:opacity-60"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)' }}
            >
              לא עכשיו
            </button>
          </div>
        ) : (
          <div className="mt-3.5">
            <button
              type="button"
              disabled={busy}
              onClick={onEnd}
              className="w-full rounded-xl px-3 py-2.5 text-[13px] font-bold text-emerald-50 transition-transform active:scale-95 disabled:opacity-60"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)' }}
            >
              חזרתי לשגרה
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function AssignmentCard({
  assignment,
  busy,
  onDone,
  onDrop,
}: {
  assignment: AssignmentView;
  busy: boolean;
  onDone: () => void;
  onDrop: () => void;
}) {
  const given = formatDay(assignment.given_at);
  const isRecurring = assignment.schedule !== 'one_time';
  const doneToday =
    Boolean(assignment.last_done_at) &&
    formatDay(assignment.last_done_at) === formatDay(new Date().toISOString());

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-[20px]"
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.72) 0%, rgba(236,253,245,0.55) 100%)',
        backdropFilter: 'blur(14px) saturate(160%)',
        WebkitBackdropFilter: 'blur(14px) saturate(160%)',
        border: '1px solid rgba(110,231,183,0.4)',
        boxShadow: '0 6px 18px rgba(6,78,59,0.08), inset 0 1px 0 rgba(255,255,255,0.5)',
      }}
    >
      <div className="relative p-4">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ background: 'rgba(16,185,129,0.14)', color: '#047857' }}
          >
            {isRecurring ? <Repeat className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
            {SCHEDULE_LABEL[assignment.schedule]}
          </span>
          {given ? (
            <span className="flex items-center gap-1 text-[11px] text-emerald-800/70">
              <Clock className="h-3 w-3" />
              נתתי לך {given}
            </span>
          ) : null}
          {assignment.done_count > 0 ? (
            <span className="mr-auto text-[11px] font-bold text-emerald-600">
              עשית {assignment.done_count}×
            </span>
          ) : null}
        </div>

        <h3
          className="text-[16px] font-black leading-snug"
          style={{ color: '#0f3d2e', fontFamily: "'Rubik','Heebo',sans-serif" }}
        >
          {assignment.title}
        </h3>

        {assignment.reason ? (
          <p className="mt-1.5 text-[13px] leading-relaxed text-emerald-900/75">
            <span className="font-bold text-emerald-800">למה בחרתי בזה: </span>
            {assignment.reason}
          </p>
        ) : null}
        {assignment.detail ? (
          <p className="mt-1 text-[12.5px] leading-relaxed text-emerald-900/60">{assignment.detail}</p>
        ) : null}

        <div className="mt-3.5 flex items-center gap-2">
          <button
            type="button"
            disabled={busy || doneToday}
            onClick={onDone}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13.5px] font-black text-white transition-transform active:scale-95 disabled:opacity-60"
            style={{
              background: doneToday
                ? 'linear-gradient(135deg, #34d399, #059669)'
                : 'linear-gradient(135deg, #047857, #10b981)',
              boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
            }}
          >
            {doneToday ? <CheckCircle2 className="h-4 w-4" /> : <Check className="h-4 w-4" strokeWidth={2.6} />}
            {doneToday ? 'עשית היום ✨' : isRecurring ? 'סמן שעשית' : 'סיימתי'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDrop}
            aria-label="כבר לא רלוונטי"
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl text-white transition-transform active:scale-95 disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #dc2626, #ef4444)',
              border: 'none',
              boxShadow: '0 4px 10px rgba(220,38,38,0.28)',
            }}
          >
            <X className="h-4 w-4 text-white" strokeWidth={2.6} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
