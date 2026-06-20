'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, MessageCircle, Sparkles, X } from 'lucide-react';

import type { FrictionCategory, StrategyType } from '../../lib/ai/almog-commitments/friction';
import { FRICTION_META } from '../../lib/ai/almog-commitments/friction';
import type {
  SosFocusTask,
  SosMemorySnippet,
  SosRecentEvent,
} from '../../lib/ai/guardian/sos-memory';
import { jerusalemDateKey } from '../../lib/journey/task-schedule';
import {
  dispatchOpenAlmogChatWithPrefill,
} from '../../lib/notifications/open-almog-chat';
import type { JourneyTaskSlot } from '../../lib/types/journey';

type SosMode = 'intervention' | 'escalation' | 'slow_down' | 'pivot';

type SosIntervention = {
  message: string;
  label: string;
  micro_step: string;
  strategy_type: StrategyType;
  category: FrictionCategory;
  used_fallback: boolean;
};

type SosResponse = {
  ok: true;
  mode: SosMode;
  intervention: SosIntervention;
  sos_count_today: number;
  event_id: string | null;
  intervention_id: string | null;
  blocker_id: string | null;
  context: {
    focus_task_title: string | null;
    focus_task_emoji: string | null;
    step_title: string | null;
    focus_task_id: string | null;
    step_id: string | null;
  };
  memory_hint: string | null;
  follow_up_scheduled?: boolean;
  pivot_attempt?: number;
};

type SosContextResponse = {
  ok: true;
  memory: SosMemorySnippet[];
  recent_events: SosRecentEvent[];
};

const QUICK_TRIGGERS: Array<{ id: FrictionCategory; label: string; helper: string; emoji: string }> = [
  { id: 'emotional', label: 'לחוץ/עמוס', helper: 'רגש, עומס, עצבים', emoji: '😮‍💨' },
  { id: 'motivational', label: 'משעמם / אין כוח', helper: 'חוסר חשק או מוטיבציה', emoji: '😴' },
  { id: 'physiological', label: 'מתחשק / רעב', helper: 'חשק, עייפות, רעב', emoji: '🍽️' },
];

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} ש׳`;
  const days = Math.floor(hours / 24);
  return `לפני ${days} ימים`;
}

function outcomeBadge(outcome: string): { label: string; tone: string } {
  if (outcome === 'passed') return { label: 'עבר', tone: 'text-emerald-700 bg-emerald-50' };
  if (outcome === 'fell') return { label: 'עדיין קשה', tone: 'text-amber-800 bg-amber-50' };
  if (outcome === 'escalated') return { label: 'הופנה לעזרה', tone: 'text-rose-800 bg-rose-50' };
  return { label: 'במעקב', tone: 'text-slate-600 bg-slate-100' };
}

async function fetchSosContext(): Promise<SosContextResponse | null> {
  const res = await fetch('/api/v1/ai/sos', { cache: 'no-store' });
  const json = (await res.json()) as SosContextResponse | { error?: string };
  if (!res.ok || !('ok' in json) || json.ok !== true) return null;
  return json;
}

async function requestSosPivot(params: {
  trigger: FrictionCategory;
  note: string;
  focusTask: SosFocusTask | null;
  response: SosResponse;
}): Promise<SosResponse> {
  const res = await fetch('/api/v1/ai/sos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'pivot',
      trigger: params.trigger,
      note: params.note,
      focus_task: params.focusTask,
      intervention_id: params.response.intervention_id,
      pivot_from_label: params.response.intervention.label,
      failed_strategy_types: [params.response.intervention.strategy_type],
      pivot_attempt: params.response.pivot_attempt ?? 0,
    }),
  });
  const json = (await res.json()) as SosResponse | { error?: string };
  if (!res.ok || !('ok' in json) || json.ok !== true) {
    throw new Error('SOS pivot failed');
  }
  return json;
}

async function requestSos(params: {
  trigger: FrictionCategory;
  note: string;
  focusTask: SosFocusTask | null;
}): Promise<SosResponse> {
  const res = await fetch('/api/v1/ai/sos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trigger: params.trigger,
      note: params.note,
      focus_task: params.focusTask,
    }),
  });
  const json = (await res.json()) as SosResponse | { error?: string };
  if (!res.ok || !('ok' in json) || json.ok !== true) {
    throw new Error('SOS request failed');
  }
  return json;
}

async function submitSosOutcome(params: {
  eventId: string;
  interventionId: string | null;
  guardianOutcome: 'passed' | 'fell';
  helped: boolean;
}): Promise<void> {
  const res = await fetch('/api/v1/ai/sos', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_id: params.eventId,
      intervention_id: params.interventionId,
      guardian_outcome: params.guardianOutcome,
      helped: params.helped,
    }),
  });
  if (!res.ok) throw new Error('SOS outcome failed');
}

type SosDialogProps = {
  open: boolean;
  onClose: () => void;
  focusTasks?: SosFocusTask[];
};

export function SosDialog({ open, onClose, focusTasks = [] }: SosDialogProps) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [selectedTask, setSelectedTask] = useState<SosFocusTask | null>(null);
  const [loadingTrigger, setLoadingTrigger] = useState<FrictionCategory | null>(null);
  const [response, setResponse] = useState<SosResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [memory, setMemory] = useState<SosMemorySnippet[]>([]);
  const [recentEvents, setRecentEvents] = useState<SosRecentEvent[]>([]);
  const [outcomeSaving, setOutcomeSaving] = useState(false);
  const [outcomeSaved, setOutcomeSaved] = useState<string | null>(null);
  const [activeTrigger, setActiveTrigger] = useState<FrictionCategory | null>(null);
  const [pivoting, setPivoting] = useState(false);
  const [taskMarking, setTaskMarking] = useState(false);
  const [taskMarked, setTaskMarked] = useState(false);
  const [guardianOptedIn, setGuardianOptedIn] = useState<boolean | null>(null);
  const [guardianSaving, setGuardianSaving] = useState(false);
  const [guardianSaved, setGuardianSaved] = useState(false);

  const loadContext = useCallback(async () => {
    setContextLoading(true);
    try {
      const ctx = await fetchSosContext();
      if (ctx) {
        setMemory(ctx.memory);
        setRecentEvents(ctx.recent_events);
      }
    } finally {
      setContextLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelectedTask(focusTasks[0] ?? null);
    setOutcomeSaved(null);
    setTaskMarked(false);
    setGuardianSaved(false);
    void loadContext();
    void fetch('/api/v1/profile/guardian-settings', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json: { opted_in?: boolean }) => setGuardianOptedIn(json.opted_in === true))
      .catch(() => setGuardianOptedIn(null));
  }, [open, focusTasks, loadContext]);

  const title = useMemo(() => {
    if (outcomeSaved) return 'תודה ששיתפת 🌱';
    if (!response) return 'רגע, אני איתך';
    if (response.mode === 'escalation') return 'לא נשארים עם זה לבד';
    if (response.mode === 'slow_down') return 'מורידים הילוך';
    if (response.mode === 'pivot') return 'בוא ננסה גישה אחרת';
    return 'הנה מה שיכול לעזור עכשיו';
  }, [response, outcomeSaved]);

  const subtitle = useMemo(() => {
    if (outcomeSaved) return 'שמרתי — בפעם הבאה אדע מה עזר ומה פחות.';
    if (response?.context.focus_task_title) {
      return `בקשר ל: ${response.context.focus_task_emoji ?? '✅'} ${response.context.focus_task_title}`;
    }
    if (selectedTask?.title) {
      return `נתמקד ב: ${selectedTask.emoji ?? '✅'} ${selectedTask.title}`;
    }
    return 'בלי שיפוט, בלי החלטות גדולות — רק דקה אחת.';
  }, [response, selectedTask, outcomeSaved]);

  if (!open) return null;

  async function handleTrigger(trigger: FrictionCategory) {
    setError(null);
    setLoadingTrigger(trigger);
    setActiveTrigger(trigger);
    try {
      const next = await requestSos({ trigger, note, focusTask: selectedTask });
      setResponse(next);
    } catch {
      setResponse({
        ok: true,
        mode: 'intervention',
        sos_count_today: 0,
        event_id: null,
        intervention_id: null,
        blocker_id: null,
        memory_hint: null,
        pivot_attempt: 0,
        context: {
          focus_task_title: selectedTask?.title ?? null,
          focus_task_emoji: selectedTask?.emoji ?? null,
          step_title: selectedTask?.stepTitle ?? null,
          focus_task_id: selectedTask?.id ?? null,
          step_id: selectedTask?.stepId ?? null,
        },
        intervention: {
          category: trigger,
          strategy_type: 'emotional_regulation',
          used_fallback: true,
          label: 'דקת נשימה',
          message: selectedTask?.title
            ? `יופי שעצרת. "${selectedTask.title}" יכולה להרגיש כבדה עכשיו — וזה בסדר גמור.`
            : 'יופי שעצרת. זה רגע קשה, לא כישלון. אני פה איתך.',
          micro_step: selectedTask?.title
            ? `בוא ניקח 3 נשימות איטיות, ואז ננסה רק חלק קטן מ"${selectedTask.title}" — 60 שניות.`
            : 'בוא ניקח 3 נשימות איטיות, ואז נתרחק מהמקום לדקה אחת בלבד.',
        },
      });
      setError('לא הצלחתי להתחבר עכשיו, אז הבאתי לך צעד בטוח ומהיר.');
    } finally {
      setLoadingTrigger(null);
    }
  }

  async function handleOutcome(helped: boolean) {
    if (!helped && response && (response.pivot_attempt ?? 0) < 2 && activeTrigger) {
      setPivoting(true);
      setError(null);
      try {
        if (response.event_id) {
          await submitSosOutcome({
            eventId: response.event_id,
            interventionId: response.intervention_id,
            guardianOutcome: 'fell',
            helped: false,
          });
        }
        const next = await requestSosPivot({
          trigger: activeTrigger,
          note,
          focusTask: selectedTask,
          response,
        });
        setResponse(next);
        void loadContext();
        return;
      } catch {
        setError('לא הצלחתי להציע גישה חדשה — אפשר לדבר עם אלמוג.');
      } finally {
        setPivoting(false);
      }
    }

    if (!response?.event_id) {
      setOutcomeSaved(helped ? 'שמרתי שעבר לך טוב 🌱' : 'שמרתי — ננסה אחרת בפעם הבאה');
      return;
    }
    setOutcomeSaving(true);
    try {
      await submitSosOutcome({
        eventId: response.event_id,
        interventionId: response.intervention_id,
        guardianOutcome: helped ? 'passed' : 'fell',
        helped,
      });
      setOutcomeSaved(
        helped
          ? 'שמרתי שעבר לך טוב 🌱'
          : (response.pivot_attempt ?? 0) >= 2
            ? 'שמרתי — ננסה אחרת בפעם הבאה'
            : 'שמרתי — אפשר גם לדבר עם אלמוג'
      );
      void loadContext();
    } catch {
      setError('לא הצלחנו לשמור את המשוב — אבל עדיין גאים שעצרת רגע.');
    } finally {
      setOutcomeSaving(false);
    }
  }

  function openChatFromSos() {
    const taskTitle = response?.context.focus_task_title ?? selectedTask?.title;
    const prefill = taskTitle
      ? `לפני רגע לחצתי "רגע… קשה לי" על "${taskTitle}". ${response?.intervention.micro_step ?? ''}`
      : `לפני רגע לחצתי "רגע… קשה לי". ${response?.intervention.micro_step ?? ''}`;
    resetAndClose();
    dispatchOpenAlmogChatWithPrefill(prefill.trim());
  }

  function openTaskDoneFromSos() {
    void markTaskDoneFromSos();
  }

  async function markTaskDoneFromSos() {
    const task =
      selectedTask ??
      (response?.context.focus_task_id
        ? {
            id: response.context.focus_task_id,
            title: response.context.focus_task_title ?? '',
            stepId: response.context.step_id ?? undefined,
            pendingSlots: undefined as string[] | undefined,
          }
        : null);

    if (!task?.id || !task.title || !task.stepId) {
      openChatFromSos();
      return;
    }

    const slot = (task.pendingSlots?.[0] ?? 'full_day') as JourneyTaskSlot;
    setTaskMarking(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/task-executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          step_id: task.stepId,
          task_id: task.id,
          slot,
          date_key: jerusalemDateKey(),
          source: 'sos',
          outcome: 'completed',
          note: `סומן מ"SOS — רגע… קשה לי"`,
        }),
      });
      if (!res.ok) throw new Error('mark_failed');
      if (response?.event_id) {
        await submitSosOutcome({
          eventId: response.event_id,
          interventionId: response.intervention_id,
          guardianOutcome: 'passed',
          helped: true,
        }).catch(() => undefined);
      }
      setTaskMarked(true);
      void loadContext();
      router.refresh();
    } catch {
      setError('לא הצלחנו לסמן את המשימה — אפשר לדבר עם אלמוג.');
    } finally {
      setTaskMarking(false);
    }
  }

  async function enableGuardianProactive() {
    setGuardianSaving(true);
    try {
      const res = await fetch('/api/v1/profile/guardian-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opted_in: true }),
      });
      if (!res.ok) throw new Error('save_failed');
      setGuardianOptedIn(true);
      setGuardianSaved(true);
    } catch {
      setError('לא הצלחנו לשמור — אפשר להפעיל בהגדרות מאלמוג.');
    } finally {
      setGuardianSaving(false);
    }
  }

  function resetAndClose() {
    setNote('');
    setSelectedTask(null);
    setResponse(null);
    setError(null);
    setLoadingTrigger(null);
    setOutcomeSaved(null);
    setActiveTrigger(null);
    setPivoting(false);
    setTaskMarking(false);
    setTaskMarked(false);
    setGuardianSaved(false);
    onClose();
  }

  const helpedMemory = memory.filter((m) => m.outcome === 'helped' || m.outcome === 'resolved').slice(0, 2);
  const failedMemory = memory.filter((m) => m.outcome === 'not_helped').slice(0, 2);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:py-10"
      style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
    >
      <button
        type="button"
        aria-label="סגירה"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]"
        onClick={resetAndClose}
      />

      <div
        dir="rtl"
        className="relative z-10 flex max-h-[min(88vh,680px)] w-full max-w-md flex-col overflow-hidden rounded-[28px] text-right shadow-2xl"
        style={{
          border: '1px solid rgba(255,255,255,0.45)',
          boxShadow: '0 24px 70px rgba(2,44,34,0.28)',
        }}
      >
        {/* Header — solid green like 404 */}
        <div
          className="relative shrink-0 px-5 pb-4 pt-5"
          style={{ background: 'linear-gradient(145deg, #047857, #059669, #10b981)' }}
        >
          <button
            type="button"
            onClick={resetAndClose}
            className="absolute left-4 top-4 rounded-full bg-white/15 p-2 text-white/90 transition hover:bg-white/25"
            aria-label="סגירה"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="text-lg font-black text-white">{title}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-emerald-50/90">{subtitle}</p>
        </div>

        {/* Body — iOS glass */}
        <div
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
          style={{
            background: 'rgba(248,255,251,0.78)',
            backdropFilter: 'blur(32px) saturate(180%)',
            WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          }}
        >
          {outcomeSaved || taskMarked ? (
            <div className="space-y-3 py-2 text-center">
              <p className="text-sm font-bold leading-7 text-emerald-900">
                {taskMarked
                  ? `סימנתי את המשימה ✓ — כל הכבוד!`
                  : outcomeSaved}
              </p>
              {guardianOptedIn === false && !guardianSaved ? (
                <div
                  className="rounded-2xl px-4 py-3 text-right text-xs leading-6 text-emerald-900"
                  style={{
                    background: 'rgba(255,255,255,0.65)',
                    border: '1px solid rgba(16,185,129,0.2)',
                  }}
                >
                  <p className="font-black">רוצה שאלמוג יגיע לפני הרגע הבא?</p>
                  <p className="mt-1 text-emerald-900/75">
                    מגע עדין לפני חלונות שקשה לך — רק כשאתה מאשר, ובלי לחץ.
                  </p>
                  <button
                    type="button"
                    disabled={guardianSaving}
                    onClick={() => void enableGuardianProactive()}
                    className="mt-3 w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-70"
                  >
                    {guardianSaving ? 'שומר…' : 'כן, תזכיר לי בעדינות'}
                  </button>
                </div>
              ) : guardianSaved ? (
                <p className="text-xs font-semibold text-emerald-800/80">הפעלנו — תוכל לכבות בהגדרות מאלמוג.</p>
              ) : null}
              <button
                type="button"
                onClick={openChatFromSos}
                className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-emerald-900"
                style={{
                  background: 'rgba(255,255,255,0.65)',
                  border: '1.5px solid rgba(16,185,129,0.2)',
                }}
              >
                <MessageCircle className="h-4 w-4" />
                לדבר עם אלמוג
              </button>
              <button
                type="button"
                onClick={resetAndClose}
                className="w-full rounded-2xl px-4 py-3 text-sm font-black text-white shadow-lg"
                style={{
                  background: 'linear-gradient(135deg, #047857, #10b981)',
                  boxShadow: '0 6px 20px rgba(16,185,129,0.25)',
                }}
              >
                סגור
              </button>
            </div>
          ) : !response ? (
            <div className="space-y-4">
              <div
                className="rounded-2xl px-4 py-3 text-sm leading-7 text-emerald-950"
                style={{
                  background: 'rgba(255,255,255,0.55)',
                  border: '1px solid rgba(16,185,129,0.14)',
                }}
              >
                קודם — על <strong>מה</strong> קשה לך עכשיו? ככה אלמוג ידע להתאים את הצעד.
              </div>

              {focusTasks.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-emerald-900/70">משימות פתוחות היום</p>
                  <div className="grid gap-2">
                    {focusTasks.map((task) => {
                      const active = selectedTask?.id === task.id;
                      return (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => setSelectedTask(task)}
                          className="flex items-center justify-between rounded-2xl px-4 py-3 text-right transition active:scale-[0.99]"
                          style={{
                            background: active
                              ? 'rgba(16,185,129,0.18)'
                              : 'rgba(255,255,255,0.55)',
                            border: active
                              ? '1px solid rgba(5,150,105,0.35)'
                              : '1px solid rgba(16,185,129,0.12)',
                          }}
                        >
                          <span className="text-[11px] font-semibold text-emerald-800/60">
                            {task.stepTitle ?? 'מהמסע'}
                          </span>
                          <span className="flex items-center gap-2 text-sm font-black text-emerald-950">
                            {active ? <Check className="h-4 w-4 text-emerald-600" /> : null}
                            <span>{task.emoji ?? '✅'}</span>
                            {task.title}
                          </span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setSelectedTask(null)}
                      className="rounded-2xl px-4 py-2.5 text-xs font-bold text-emerald-800/70"
                      style={{
                        background: !selectedTask ? 'rgba(16,185,129,0.12)' : 'transparent',
                        border: '1px dashed rgba(16,185,129,0.25)',
                      }}
                    >
                      לא קשור למשימה ספציפית
                    </button>
                  </div>
                </div>
              ) : null}

              <p className="text-xs font-bold text-emerald-900/70">מה הכי קרוב לרגע הזה?</p>
              <div className="grid gap-2.5">
                {QUICK_TRIGGERS.map((trigger) => (
                  <button
                    key={trigger.id}
                    type="button"
                    onClick={() => void handleTrigger(trigger.id)}
                    disabled={loadingTrigger !== null}
                    className="flex items-center justify-between rounded-2xl px-4 py-3 text-right transition active:scale-[0.99] disabled:opacity-70"
                    style={{
                      background: 'rgba(255,255,255,0.58)',
                      border: '1px solid rgba(16,185,129,0.12)',
                      boxShadow: '0 2px 8px rgba(6,78,59,0.04)',
                    }}
                  >
                    <span className="text-xs font-semibold text-emerald-800/60">{trigger.helper}</span>
                    <span className="flex items-center gap-2 text-sm font-black text-emerald-950">
                      {loadingTrigger === trigger.id && <Loader2 className="h-4 w-4 animate-spin" />}
                      <span>{trigger.emoji}</span>
                      {trigger.label}
                    </span>
                  </button>
                ))}
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-bold text-emerald-900/65">רוצה להוסיף מילה?</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={240}
                  rows={2}
                  className="w-full resize-none rounded-2xl px-3 py-2 text-sm text-emerald-950 outline-none focus:border-emerald-500"
                  style={{
                    background: 'rgba(255,255,255,0.65)',
                    border: '1px solid rgba(16,185,129,0.15)',
                  }}
                  placeholder={
                    selectedTask?.title
                      ? `למשל: קשה לי עם "${selectedTask.title}" אחרי יום עמוס`
                      : 'למשל: היה יום עמוס ואני מול המקרר'
                  }
                />
              </label>

              {(helpedMemory.length > 0 || failedMemory.length > 0 || recentEvents.length > 0) && (
                <div
                  className="rounded-2xl px-4 py-3 text-xs leading-6"
                  style={{
                    background: 'rgba(16,185,129,0.08)',
                    border: '1px solid rgba(16,185,129,0.15)',
                  }}
                >
                  <p className="mb-2 flex items-center gap-1 font-black text-emerald-800">
                    <Sparkles className="h-3.5 w-3.5" />
                    מה אלמוג זוכר
                  </p>
                  {contextLoading ? (
                    <p className="text-emerald-800/70">טוען היסטוריה…</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {helpedMemory.map((m, i) => (
                        <li key={`h-${i}`} className="text-emerald-900">
                          ✓ {m.task_title ? `"${m.task_title}" — ` : ''}
                          {m.strategy} עזר
                        </li>
                      ))}
                      {failedMemory.map((m, i) => (
                        <li key={`f-${i}`} className="text-amber-900/85">
                          · {m.task_title ? `"${m.task_title}" — ` : ''}
                          {m.strategy} פחות התאים
                        </li>
                      ))}
                      {recentEvents.slice(0, 2).map((ev) => {
                        const badge = outcomeBadge(ev.outcome);
                        return (
                          <li key={ev.id} className="flex flex-wrap items-center gap-1 text-emerald-900/80">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.tone}`}>
                              {badge.label}
                            </span>
                            {formatRelativeTime(ev.created_at)}
                            {ev.task_title ? ` · ${ev.task_title}` : ''}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {response.context.focus_task_title ? (
                <div
                  className="rounded-2xl px-4 py-3 text-xs font-bold text-emerald-900"
                  style={{
                    background: 'rgba(255,255,255,0.55)',
                    border: '1px solid rgba(16,185,129,0.14)',
                  }}
                >
                  ההצעה הבאה מותאמת ל{' '}
                  <span className="text-sm">
                    {response.context.focus_task_emoji ?? '✅'} {response.context.focus_task_title}
                  </span>
                  {response.context.step_title ? (
                    <span className="mt-1 block font-semibold text-emerald-800/65">
                      מתוך {response.context.step_title}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {response.memory_hint ? (
                <p className="text-xs font-semibold leading-6 text-emerald-800/80">{response.memory_hint}</p>
              ) : null}

              <div
                className="rounded-3xl px-4 py-4 text-white shadow-lg"
                style={{
                  background: 'linear-gradient(145deg, #047857, #059669, #10b981)',
                  boxShadow: '0 8px 24px rgba(4,120,87,0.22)',
                }}
              >
                <p className="whitespace-pre-wrap text-sm font-semibold leading-7">{response.intervention.message}</p>
              </div>

              <div
                className="rounded-2xl p-4"
                style={{
                  background: 'rgba(255,255,255,0.58)',
                  border: '1px solid rgba(16,185,129,0.12)',
                }}
              >
                <p className="text-xs font-bold text-emerald-800/60">הצעד הבא</p>
                <p className="mt-1 text-base font-black text-emerald-950">{response.intervention.label}</p>
                <p className="mt-2 text-sm leading-7 text-emerald-900">{response.intervention.micro_step}</p>
                <p className="mt-2 text-[10px] font-semibold text-emerald-800/50">
                  {FRICTION_META[response.intervention.category].emoji}{' '}
                  {FRICTION_META[response.intervention.category].labelHe}
                </p>
              </div>

              {error ? <p className="text-xs font-semibold text-amber-700">{error}</p> : null}

              {response.follow_up_scheduled ? (
                <p className="text-[11px] font-semibold text-emerald-800/70">
                  אשלח לך בעוד ~שעה הודעה קטנה — איך היה אחרי הרגע.
                </p>
              ) : null}

              <p className="text-xs font-bold text-emerald-900/70">איך היה?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={outcomeSaving || pivoting}
                  onClick={() => void handleOutcome(true)}
                  className="rounded-2xl px-4 py-3 text-sm font-black text-white shadow-lg disabled:opacity-70"
                  style={{
                    background: 'linear-gradient(135deg, #047857, #10b981)',
                    boxShadow: '0 6px 20px rgba(16,185,129,0.22)',
                  }}
                >
                  {outcomeSaving ? 'שומר…' : 'עבר — תודה 🌱'}
                </button>
                <button
                  type="button"
                  disabled={outcomeSaving || pivoting}
                  onClick={() => void handleOutcome(false)}
                  className="rounded-2xl px-4 py-3 text-sm font-bold text-emerald-900 disabled:opacity-70"
                  style={{
                    background: 'rgba(255,255,255,0.65)',
                    border: '1.5px solid rgba(16,185,129,0.2)',
                  }}
                >
                  {pivoting ? 'מציע גישה אחרת…' : 'עדיין קשה — ננסה אחרת'}
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={openChatFromSos}
                  className="flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-xs font-bold text-emerald-900"
                  style={{
                    background: 'rgba(255,255,255,0.55)',
                    border: '1px solid rgba(16,185,129,0.12)',
                  }}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  לדבר עם אלמוג
                </button>
                {(selectedTask?.id || response.context.focus_task_id) ? (
                  <button
                    type="button"
                    disabled={taskMarking}
                    onClick={openTaskDoneFromSos}
                    className="rounded-2xl px-3 py-2.5 text-xs font-bold text-emerald-900 disabled:opacity-70"
                    style={{
                      background: 'rgba(255,255,255,0.55)',
                      border: '1px solid rgba(16,185,129,0.12)',
                    }}
                  >
                    {taskMarking ? 'מסמן…' : 'סימנתי — עשיתי 🎯'}
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
