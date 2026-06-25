'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, MessageCircle, Snowflake, Sparkles, Volume2, X } from 'lucide-react';

import { useDialogA11y } from '@/lib/a11y/use-dialog-a11y';
import { AnimatedDialog } from '../shared/AnimatedDialog';
import { AlmogAvatarChip } from '../journey/AlmogPresence';
import {
  SOS_BODY_STYLE,
  SOS_HEADER_STYLE,
  SOS_INSET_CLASS,
  SOS_MESSAGE_CARD_STYLE,
  SOS_PANEL_STYLE,
  SOS_PRIMARY_BTN_STYLE,
  SOS_SECONDARY_BTN_CLASS,
} from './sos-ui-styles';

import type { FrictionCategory, StrategyType } from '../../lib/ai/almog-commitments/friction';
import type {
  SosFocusTask,
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
  care_focus_active?: boolean;
  pivot_attempt?: number;
};

type SosContextResponse = {
  ok: true;
};

const QUICK_TRIGGERS: Array<{ id: FrictionCategory; label: string; helper: string; emoji: string }> = [
  { id: 'emotional', label: 'לחוץ/עמוס', helper: 'רגש, עומס, עצבים', emoji: '😮‍💨' },
  { id: 'motivational', label: 'משעמם / אין כוח', helper: 'חוסר חשק או מוטיבציה', emoji: '😴' },
  { id: 'physiological', label: 'מתחשק / רעב', helper: 'חשק, עייפות, רעב', emoji: '🍽️' },
];


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
  const [outcomeSaving, setOutcomeSaving] = useState(false);
  const [outcomeSaved, setOutcomeSaved] = useState<string | null>(null);
  const [activeTrigger, setActiveTrigger] = useState<FrictionCategory | null>(null);
  const [pivoting, setPivoting] = useState(false);
  const [taskMarking, setTaskMarking] = useState(false);
  const [taskMarked, setTaskMarked] = useState(false);
  const [guardianOptedIn, setGuardianOptedIn] = useState<boolean | null>(null);
  const [guardianSaving, setGuardianSaving] = useState(false);
  const [guardianSaved, setGuardianSaved] = useState(false);
  const [taskHardConfirmed, setTaskHardConfirmed] = useState<boolean | null>(null);
  const [easeCreating, setEaseCreating] = useState(false);
  const [easeCreated, setEaseCreated] = useState(false);

  const loadContext = useCallback(async () => {
    await fetchSosContext();
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelectedTask(focusTasks[0] ?? null);
    setOutcomeSaved(null);
    setTaskMarked(false);
    setGuardianSaved(false);
    setTaskHardConfirmed(null);
    setEaseCreated(false);
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
    return 'רק דקה אחת. אני איתך.';
  }, [response, selectedTask, outcomeSaved]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subtitleId = useId();

  const resetAndClose = useCallback(() => {
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
    setTaskHardConfirmed(null);
    setEaseCreating(false);
    setEaseCreated(false);
    onClose();
  }, [onClose]);

  useDialogA11y({
    open,
    onClose: resetAndClose,
    containerRef: dialogRef,
  });

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

  function speakTaskTitle() {
    const title = selectedTask?.title ?? response?.context.focus_task_title;
    if (!title || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(title);
    utterance.lang = 'he-IL';
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
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

  async function createEaseTaskFromSos() {
    if (!response?.blocker_id || !response.intervention) return;
    setEaseCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/ai/sos/ease', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocker_id: response.blocker_id,
          intervention: response.intervention,
          focus_task: selectedTask,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'ease_failed');
      setEaseCreated(true);
      router.refresh();
    } catch {
      setError('לא הצלחנו להוסיף את הצעד למשימות — אפשר לדבר עם אלמוג.');
    } finally {
      setEaseCreating(false);
    }
  }

  function openUnfreezeChat() {
    const original = selectedTask?.title ?? response?.context.focus_task_title;
    const prefill = original
      ? `אני מרגיש/ה שאולי הגיע הזמן לחזור למשימה "${original}". בוא נוודא יחד שזה הזמן הנכון.`
      : 'אני מרגיש/ה שאולי הגיע הזמן לחזור למשימה המקורית. בוא נוודא יחד שזה הזמן הנכון.';
    resetAndClose();
    dispatchOpenAlmogChatWithPrefill(prefill);
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

  const showTaskHardnessGate =
    !response && selectedTask?.title && taskHardConfirmed === null && focusTasks.length > 0;

  const inset = SOS_INSET_CLASS;

  return (
    <AnimatedDialog
      open={open}
      onClose={resetAndClose}
      panelRef={dialogRef}
      zIndex={200}
      aria-labelledby={titleId}
      aria-describedby={subtitleId}
      backdropClassName="absolute inset-0 bg-black/55 backdrop-blur-sm"
      panelClassName="max-w-md flex flex-col overflow-hidden rounded-[28px] text-right shadow-2xl"
      panelStyle={SOS_PANEL_STYLE}
    >
      <div className="relative shrink-0 px-5 pb-4 pt-5" style={SOS_HEADER_STYLE}>
        <button
          type="button"
          onClick={resetAndClose}
          className="absolute left-4 top-4 rounded-full border border-white/12 bg-white/10 p-2 text-white/85 transition hover:bg-white/18"
          aria-label="סגירה"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3">
          <AlmogAvatarChip size={44} />
          <div className="min-w-0 flex-1">
            <p id={titleId} className="text-lg font-black text-[#f5f5f7]">{title}</p>
            <p id={subtitleId} className="mt-1 text-xs font-semibold leading-5 text-white/62">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4" style={SOS_BODY_STYLE}>
        {outcomeSaved || taskMarked ? (
          <div className="space-y-3 py-2 text-center">
            <p className="text-sm font-bold leading-7 text-[#f5f5f7]">
              {taskMarked ? `סימנתי את המשימה ✓ — כל הכבוד!` : outcomeSaved}
            </p>
            {guardianOptedIn === false && !guardianSaved ? (
              <div className={`${inset} px-4 py-3 text-right text-xs leading-6 text-white/82`}>
                <p className="font-black">רוצה שאגיע לפני הרגע הבא?</p>
                <p className="mt-1 text-white/58">מגע עדין לפני חלונות שקשים לך — רק אם זה נוח לך.</p>
                <button
                  type="button"
                  disabled={guardianSaving}
                  onClick={() => void enableGuardianProactive()}
                  className="mt-3 w-full rounded-xl px-3 py-2.5 text-sm font-bold disabled:opacity-70"
                  style={SOS_PRIMARY_BTN_STYLE}
                >
                  {guardianSaving ? 'שומר…' : 'כן, תזכיר לי בעדינות'}
                </button>
              </div>
            ) : guardianSaved ? (
              <p className="text-xs font-semibold text-white/58">הפעלנו — אפשר לכבות בהגדרות מאלמוג.</p>
            ) : null}
            <button
              type="button"
              onClick={openChatFromSos}
              className={`${inset} flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white/90`}
            >
              <MessageCircle className="h-4 w-4" />
              לדבר עם אלמוג
            </button>
            <button
              type="button"
              onClick={resetAndClose}
              className="w-full rounded-2xl px-4 py-3 text-sm font-black"
              style={SOS_PRIMARY_BTN_STYLE}
            >
              סגור
            </button>
          </div>
        ) : !response ? (
          <div className="space-y-4">
            {showTaskHardnessGate ? (
              <div className={`${inset} space-y-3 px-4 py-4`}>
                <p className="text-xs font-bold text-white/55">לפני שנמשיך</p>
                <div className={`${inset} px-3 py-3`}>
                  <p className="text-[11px] font-semibold text-white/48">המשימה שלך עכשיו</p>
                  <div className="mt-1 flex items-start justify-between gap-2">
                    <p className="text-base font-black leading-snug text-[#f5f5f7]">
                      {selectedTask?.emoji ? `${selectedTask.emoji} ` : ''}
                      {selectedTask?.title}
                    </p>
                    <button
                      type="button"
                      onClick={speakTaskTitle}
                      className={`shrink-0 rounded-xl p-2 text-white/75 ${inset}`}
                      aria-label="הקרא את המשימה"
                    >
                      <Volume2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="text-sm font-bold text-[#f5f5f7]">קשה לך לבצע אותה עכשיו?</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setTaskHardConfirmed(true)}
                    className="rounded-2xl px-4 py-3 text-sm font-black"
                    style={SOS_PRIMARY_BTN_STYLE}
                  >
                    כן — קשה לי
                  </button>
                  <button type="button" onClick={() => setTaskHardConfirmed(false)} className={SOS_SECONDARY_BTN_CLASS}>
                    לא, משהו אחר
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className={`${inset} px-4 py-3 text-sm leading-7 text-white/88`}>
                  על מה קשה לך עכשיו? ככה אדע מה להציע.
                </div>

                {focusTasks.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-white/55">משימות פתוחות היום</p>
                    <div className="grid gap-2">
                      {focusTasks.map((task) => {
                        const active = selectedTask?.id === task.id;
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => {
                              setSelectedTask(task);
                              setTaskHardConfirmed(null);
                            }}
                            className={`flex items-center justify-between rounded-2xl px-4 py-3 text-right transition active:scale-[0.99] ${inset} ${
                              active ? 'ring-1 ring-white/25' : ''
                            }`}
                          >
                            <span className="text-[11px] font-semibold text-white/48">
                              {task.stepTitle ?? 'מהמסע'}
                            </span>
                            <span className="flex items-center gap-2 text-sm font-black text-[#f5f5f7]">
                              {active ? <Check className="h-4 w-4 text-white/75" /> : null}
                              <span>{task.emoji ?? '✅'}</span>
                              {task.title}
                            </span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTask(null);
                          setTaskHardConfirmed(null);
                        }}
                        className="rounded-2xl border border-dashed border-white/18 px-4 py-2.5 text-xs font-bold text-white/55"
                        style={{ background: !selectedTask ? 'rgba(255,255,255,0.06)' : 'transparent' }}
                      >
                        לא קשור למשימה ספציפית
                      </button>
                    </div>
                  </div>
                ) : null}

                <p className="text-xs font-bold text-white/55">מה הכי קרוב לרגע הזה?</p>
                <div className="grid gap-2.5">
                  {QUICK_TRIGGERS.map((trigger) => (
                    <button
                      key={trigger.id}
                      type="button"
                      onClick={() => void handleTrigger(trigger.id)}
                      disabled={loadingTrigger !== null}
                      className={`${inset} flex items-center justify-between px-4 py-3 text-right transition active:scale-[0.99] disabled:opacity-70`}
                    >
                      <span className="text-xs font-semibold text-white/48">{trigger.helper}</span>
                      <span className="flex items-center gap-2 text-sm font-black text-[#f5f5f7]">
                        {loadingTrigger === trigger.id && <Loader2 className="h-4 w-4 animate-spin" />}
                        <span>{trigger.emoji}</span>
                        {trigger.label}
                      </span>
                    </button>
                  ))}
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-white/52">רוצה להוסיף מילה?</span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={240}
                    rows={2}
                    className={`${inset} w-full resize-none px-3 py-2.5 text-sm text-[#f5f5f7] outline-none focus:ring-2 focus:ring-white/20`}
                    placeholder={
                      selectedTask?.title
                        ? `למשל: קשה לי עם "${selectedTask.title}" אחרי יום עמוס`
                        : 'למשל: היה יום עמוס ואני מול המקרר'
                    }
                  />
                </label>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {response.context.focus_task_title ? (
              <div className={`${inset} px-4 py-3 text-xs font-bold text-white/82`}>
                זה מותאם ל{' '}
                <span className="text-sm text-[#f5f5f7]">
                  {response.context.focus_task_emoji ?? '✅'} {response.context.focus_task_title}
                </span>
                {response.context.step_title ? (
                  <span className="mt-1 block font-semibold text-white/48">מתוך {response.context.step_title}</span>
                ) : null}
              </div>
            ) : null}

            {response.memory_hint ? (
              <p className="text-xs font-semibold leading-6 text-white/62">{response.memory_hint}</p>
            ) : null}

            <div className="relative overflow-hidden rounded-3xl p-4" style={SOS_MESSAGE_CARD_STYLE}>
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-4 top-px h-px bg-gradient-to-r from-transparent via-white/35 to-transparent"
              />
              <p className="whitespace-pre-wrap text-sm font-semibold leading-7 text-[#f5f5f7]">
                {response.intervention.message}
              </p>
            </div>

            <div className={`${inset} relative overflow-hidden p-4`}>
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-white/45" />
                <p className="text-xs font-bold text-white/55">הצעד שלך עכשיו</p>
              </div>
              <p className="text-base font-black text-[#f5f5f7]">{response.intervention.label}</p>
              <p className="mt-2 text-sm leading-7 text-white/78">{response.intervention.micro_step}</p>
            </div>

            {taskHardConfirmed && response.blocker_id && !easeCreated ? (
              <button
                type="button"
                disabled={easeCreating}
                onClick={() => void createEaseTaskFromSos()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-70"
                style={SOS_PRIMARY_BTN_STYLE}
              >
                {easeCreating ? 'מוסיף למשימות…' : 'הוסף למשימות שלי והקפא את המקורית'}
              </button>
            ) : null}

            {easeCreated ? (
              <div className={`${inset} px-4 py-3 text-xs leading-6 text-white/82`}>
                <p className="font-black">נוסף למשימות שלך ✓</p>
                <p className="mt-1 text-white/58">
                  המשימה המקורית מוקפאת. כשתסיים את הצעד הקל — נחזיר אותה בהדרגה.
                </p>
                <button
                  type="button"
                  onClick={openUnfreezeChat}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-white/72"
                >
                  <Snowflake className="h-3.5 w-3.5" />
                  מוכן/ה לחזור למשימה המקורית?
                </button>
              </div>
            ) : null}

            {error ? <p className="text-xs font-semibold text-amber-300/90">{error}</p> : null}

            {response.follow_up_scheduled ? (
              <p className="text-[11px] font-semibold text-white/52">
                אשמור עליך — אבדוק בעדינות איך היה.
              </p>
            ) : null}

            {response.care_focus_active ? (
              <p className="text-[11px] font-semibold leading-5 text-white/52">
                הורדתי זמנית תזכורות אחרות — כדי שתוכל להתרכז ברגע הזה.
              </p>
            ) : null}

            <p className="text-xs font-bold text-white/55">איך היה?</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={outcomeSaving || pivoting}
                onClick={() => void handleOutcome(true)}
                className="rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-70"
                style={SOS_PRIMARY_BTN_STYLE}
              >
                {outcomeSaving ? 'שומר…' : 'עבר — תודה 🌱'}
              </button>
              <button
                type="button"
                disabled={outcomeSaving || pivoting}
                onClick={() => void handleOutcome(false)}
                className={`${SOS_SECONDARY_BTN_CLASS} disabled:opacity-70`}
              >
                {pivoting ? 'מציע גישה אחרת…' : 'עדיין קשה — ננסה אחרת'}
              </button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={openChatFromSos}
                className={`${inset} flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-bold text-white/88`}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                לדבר עם אלמוג
              </button>
              {(selectedTask?.id || response.context.focus_task_id) ? (
                <button
                  type="button"
                  disabled={taskMarking}
                  onClick={openTaskDoneFromSos}
                  className={`${inset} px-3 py-2.5 text-xs font-bold text-white/88 disabled:opacity-70`}
                >
                  {taskMarking ? 'מסמן…' : 'סימנתי — עשיתי 🎯'}
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </AnimatedDialog>
  );
}
