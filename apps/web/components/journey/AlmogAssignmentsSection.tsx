'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, CheckCircle2, Clock, Repeat, Sparkles, Snowflake, X } from 'lucide-react';
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

const SCHEDULE_LABEL: Record<AssignmentView['schedule'], string> = {
  one_time: 'חד-פעמי',
  daily: 'כל יום',
  weekly: 'שבועי',
};

function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit' }).format(new Date(t));
}

/**
 * סקשן "מאלמוג" — משימות אישיות שאלמוג נתן + מצב פוקוס.
 * עיצוב זכוכית שקופה (mint glass), mobile-first, בלי לבן שטוח.
 */
export function AlmogAssignmentsSection() {
  const [assignments, setAssignments] = useState<AssignmentView[]>([]);
  const [focus, setFocus] = useState<FocusView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/almog-assignments', { credentials: 'include' });
      if (!res.ok) return;
      const json = (await res.json()) as { assignments: AssignmentView[]; focus: FocusView | null };
      setAssignments(Array.isArray(json.assignments) ? json.assignments : []);
      setFocus(json.focus ?? null);
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
  if (loaded && visible.length === 0 && !focus) return null;
  if (!loaded) return null;

  return (
    <motion.section
      dir="rtl"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="mb-6"
    >
      {/* כותרת הסקשן */}
      <div className="mb-3.5 flex items-center gap-3 px-1">
        <AlmogAvatarChip size={40} />
        <div className="flex-1 text-right">
          <p
            className="text-[16px] font-black"
            style={{ color: '#1A1730', fontFamily: "'Rubik','Heebo',sans-serif" }}
          >
            מאלמוג · אישי בשבילך
          </p>
          <p className="mt-0.5 text-xs text-emerald-800/70">
            {focus?.status === 'active'
              ? 'מצב פוקוס פעיל'
              : `${visible.length} ${visible.length === 1 ? 'משימה' : 'משימות'} פעיל${visible.length === 1 ? 'ה' : 'ות'}`}
          </p>
        </div>
      </div>

      {/* באנר פוקוס */}
      <AnimatePresence initial={false}>
        {focus ? (
          <FocusBanner
            focus={focus}
            busy={busyId === `focus-${focus.id}`}
            onConfirm={() => act({ action: 'confirm_focus', focus_id: focus.id }, `focus-${focus.id}`)}
            onDecline={() => act({ action: 'decline_focus', focus_id: focus.id }, `focus-${focus.id}`)}
          />
        ) : null}
      </AnimatePresence>

      {/* כרטיסי משימות */}
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {visible.map((a) => (
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
    </motion.section>
  );
}

function FocusBanner({
  focus,
  busy,
  onConfirm,
  onDecline,
}: {
  focus: FocusView;
  busy: boolean;
  onConfirm: () => void;
  onDecline: () => void;
}) {
  const until = formatDay(focus.ends_at);
  const isProposed = focus.status === 'proposed';
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
        style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.32) 0%, transparent 70%)', filter: 'blur(20px)' }}
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
              {isProposed ? 'אלמוג מציע מצב פוקוס' : 'מצב פוקוס פעיל'}
            </p>
            <p
              className="mt-1 text-[14px] font-bold leading-relaxed text-white"
              style={{ fontFamily: "'Rubik','Heebo',sans-serif", textShadow: '0 1px 6px rgba(2,44,34,0.45)' }}
            >
              {isProposed
                ? `בוא נשים בצד את שאר המשימות רגע${focus.reason ? ` ונתמקד ב${focus.reason}` : ''}. שאר ההרגלים ממשיכים להיספר ברקע — רק לוקחים אוויר.`
                : `שמנו בצד את שאר המשימות${until ? ` עד ${until}` : ''}${focus.reason ? ` כדי להתמקד ב${focus.reason}` : ''}. ההתקדמות שלך נשמרת — אנחנו רק מתמקדים.`}
            </p>
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
              בוא נתמקד
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
        ) : null}
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
        // זכוכית מנטה שקופה — לא לבן שטוח
        background: 'linear-gradient(135deg, rgba(236,253,245,0.88) 0%, rgba(209,250,229,0.62) 100%)',
        backdropFilter: 'blur(14px) saturate(160%)',
        WebkitBackdropFilter: 'blur(14px) saturate(160%)',
        border: '1px solid rgba(110,231,183,0.45)',
        boxShadow: '0 8px 22px rgba(6,78,59,0.10), inset 0 1px 0 rgba(255,255,255,0.6)',
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-px h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)' }}
      />
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
              ניתנה {given}
            </span>
          ) : null}
          {assignment.done_count > 0 ? (
            <span className="mr-auto text-[11px] font-bold text-emerald-600">
              בוצע {assignment.done_count}×
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
            <span className="font-bold text-emerald-800">למה: </span>
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
            {doneToday ? 'בוצע היום ✨' : isRecurring ? 'סמן שעשיתי' : 'סיימתי'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDrop}
            aria-label="כבר לא רלוונטי"
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl text-emerald-700/70 transition-transform active:scale-95 disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(110,231,183,0.4)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
