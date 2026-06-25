'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Loader2, MessageCircle, Snowflake, Sparkles, Volume2, X, ArrowRight } from 'lucide-react';

import { useDialogA11y } from '@/lib/a11y/use-dialog-a11y';
import { AnimatedDialog } from '../shared/AnimatedDialog';
import { AlmogAvatarChip } from '../journey/AlmogPresence';

import type { FrictionCategory, StrategyType } from '../../lib/ai/almog-commitments/friction';
import { FRICTION_META } from '../../lib/ai/almog-commitments/friction';
import {
  SOS_ALMOG_BUBBLE,
  SOS_ALMOG_BUBBLE_TEXT,
  SOS_BODY_BG,
  SOS_GATE_BUBBLE,
  SOS_GATE_NO_BUTTON,
  SOS_GATE_PANEL,
  SOS_INTAKE_SECTION,
  SOS_INTAKE_TASK_ACTIVE,
  SOS_INTAKE_TASK_IDLE,
  SOS_LABEL,
  SOS_MUTED,
  SOS_NOTE_FIELD,
  SOS_TASK_CARD,
  SOS_TASK_CARD_LABEL,
  SOS_TASK_CARD_TITLE,
  SOS_TEXT,
  SOS_TEXT_STRONG,
  SOS_TRIGGER_BG,
  SOS_TRIGGER_CARD,
  SOS_TRIGGER_HELPER,
  SOS_TRIGGER_LABEL,
  type SosQuickTriggerId,
  sosSurface,
} from '../../lib/ai/sos-dialog-surfaces';
import type { OnboardingGender } from '../../lib/onboarding/types';
import { genderCopy } from '../../lib/onboarding/gender-copy';
import { useSosTts } from './useSosTts';
import type {
  SosFocusTask,
} from '../../lib/ai/guardian/sos-memory';
import { jerusalemDateKey } from '../../lib/journey/task-schedule';
import {
  dispatchOpenAlmogChatWithPrefill,
} from '../../lib/notifications/open-almog-chat';
import type { JourneyTaskSlot } from '../../lib/types/journey';

type SosMode = 'intervention' | 'escalation' | 'slow_down' | 'pivot';

type DialogPhase = 'gate' | 'intake' | 'response' | 'done';

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

const QUICK_TRIGGERS: Array<{ id: SosQuickTriggerId; label: string; helper: string; emoji: string }> = [
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
  /** מספר משימות פתוחות — מייצב את שער ההרגל גם לפני שהמערך מתמלא */
  pendingTaskCount?: number;
  /** ננעל בזמן הפתיחה — מונע קפיצה לפני שער ההרגל */
  gateOnOpen?: boolean;
  firstName?: string;
  gender?: OnboardingGender | '';
};

export function SosDialog({
  open,
  onClose,
  focusTasks = [],
  pendingTaskCount = 0,
  gateOnOpen = false,
  firstName = '',
  gender = '',
}: SosDialogProps) {
  const { play: playSosTts, isLoading: isSosTtsLoading } = useSosTts();
  const router = useRouter();
  const [phase, setPhase] = useState<DialogPhase>(() =>
    gateOnOpen || focusTasks.length > 0 || pendingTaskCount > 0 ? 'gate' : 'intake'
  );
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

  useLayoutEffect(() => {
    if (!open) return;
    const shouldGate = gateOnOpen || focusTasks.length > 0 || pendingTaskCount > 0;
    setPhase(shouldGate ? 'gate' : 'intake');
    setTaskHardConfirmed(null);
    setResponse(null);
    setError(null);
    setOutcomeSaved(null);
    setTaskMarked(false);
    setSelectedTask(focusTasks[0] ?? null);
  }, [open, gateOnOpen, focusTasks, pendingTaskCount]);

  useEffect(() => {
    if (!open) return;
    void loadContext();
    void fetch('/api/v1/profile/guardian-settings', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json: { opted_in?: boolean }) => setGuardianOptedIn(json.opted_in === true))
      .catch(() => setGuardianOptedIn(null));
  }, [open, focusTasks, loadContext]);

  const gc = useMemo(() => genderCopy(gender), [gender]);

  const wantAddWordLabel = useMemo(() => {
    if (gender === 'male') return 'רוצה להוסיף מילה?';
    if (gender === 'female') return 'רוצה להוסיף מילה?';
    return 'רוצה/ה להוסיף מילה?';
  }, [gender]);

  const gateTask = selectedTask ?? focusTasks[0] ?? null;
  const showTaskHardnessGate = phase === 'gate' && !response && !outcomeSaved && !taskMarked;
  const showIntake = phase === 'intake' && !response && !outcomeSaved && !taskMarked;

  const gateGreeting = useMemo(() => {
    const taskLabel = gateTask?.title ?? 'המשימה שעל הראש';
    if (firstName) {
      return `היי ${firstName}, קשה לך עם ${taskLabel} עכשיו?`;
    }
    return `קשה לך עם ${taskLabel} עכשיו?`;
  }, [firstName, gateTask?.title]);

  const intakeGreeting = useMemo(() => {
    if (firstName) {
      return `היי ${firstName}, אני איתך. מה הכי קשה לך ברגע הזה? נתחיל ממקום אחד קטן — ונתקדם משם ביחד.`;
    }
    return 'מה הכי קשה לך ברגע הזה? נתחיל ממקום אחד קטן — ונתקדם משם ביחד.';
  }, [firstName]);

  const title = useMemo(() => {
    if (outcomeSaved) return firstName ? `תודה, ${firstName} 🌱` : 'תודה ששיתפת 🌱';
    if (showTaskHardnessGate) {
      return firstName ? `היי ${firstName}` : 'רגע לפני שממשיכים';
    }
    if (showIntake) return firstName ? `${firstName}, אני איתך` : 'רגע, אני איתך';
    if (!response) return 'הנה מה שיכול לעזור עכשיו';
    if (response.mode === 'escalation') return 'לא נשארים עם זה לבד';
    if (response.mode === 'slow_down') return 'מורידים הילוך';
    if (response.mode === 'pivot') return 'בוא ננסה גישה אחרת';
    return 'הנה מה שיכול לעזור עכשיו';
  }, [response, outcomeSaved, showTaskHardnessGate, showIntake, firstName]);

  const subtitle = useMemo(() => {
    if (outcomeSaved) return 'שמרתי — בפעם הבאה אדע מה עזר ומה פחות.';
    if (showTaskHardnessGate) {
      return 'קודם נבין אם זה קשור למשימה שעל הראש — ואז נמשיך יחד.';
    }
    if (showIntake) {
      const lead = firstName ? `${firstName}, ` : '';
      return `${lead}${gc.tell} או ${gc.choose} מה הכי קרוב לרגע הזה.`;
    }
    if (response?.context.focus_task_title) {
      return `בקשר ל: ${response.context.focus_task_emoji ?? '✅'} ${response.context.focus_task_title}`;
    }
    if (selectedTask?.title) {
      return `נתמקד ב: ${selectedTask.emoji ?? '✅'} ${selectedTask.title}`;
    }
    return firstName
      ? `${firstName}, ספר לי מה עולה — נמצא צעד קטן יחד.`
      : 'ספר לי מה עולה — נמצא צעד קטן יחד.';
  }, [response, selectedTask, outcomeSaved, showTaskHardnessGate, showIntake, firstName, gc]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subtitleId = useId();

  const resetDialogState = useCallback(() => {
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
    setPhase(gateOnOpen || focusTasks.length > 0 || pendingTaskCount > 0 ? 'gate' : 'intake');
  }, [gateOnOpen, focusTasks.length, pendingTaskCount]);

  const closeDialog = useCallback(() => {
    onClose();
  }, [onClose]);

  const resetAndClose = useCallback(() => {
    resetDialogState();
    onClose();
  }, [onClose, resetDialogState]);

  const goBackFromResponse = useCallback(() => {
    setResponse(null);
    setError(null);
    setLoadingTrigger(null);
    setPivoting(false);
    setOutcomeSaving(false);
    setEaseCreated(false);
    setEaseCreating(false);
    setPhase('intake');
  }, []);

  const showBackButton = Boolean(response && !outcomeSaved && !taskMarked);

  const bodyPhaseKey = useMemo(() => {
    if (outcomeSaved || taskMarked) return 'done';
    if (response || phase === 'response') return 'response';
    if (phase === 'gate') return 'gate';
    if (phase === 'intake') return 'intake';
    return 'idle';
  }, [outcomeSaved, taskMarked, response, phase]);

  useDialogA11y({
    open,
    onClose: closeDialog,
    containerRef: dialogRef,
  });

  async function handleTrigger(trigger: FrictionCategory) {
    setError(null);
    setLoadingTrigger(trigger);
    setActiveTrigger(trigger);
    try {
      const next = await requestSos({ trigger, note, focusTask: selectedTask });
      setResponse(next);
      setPhase('response');
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
      setPhase('response');
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
        setPhase('response');
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
    const title = gateTask?.title ?? selectedTask?.title ?? response?.context.focus_task_title;
    if (!title) return;
    void playSosTts(title, 'task_title');
  }

  function speakInterventionMessage() {
    const message = response?.intervention.message;
    if (!message) return;
    void playSosTts(message, 'intervention_message');
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
    const feel =
      gender === 'male' ? 'מרגיש' : gender === 'female' ? 'מרגישה' : 'מרגיש/ה';
    const prefill = original
      ? `אני ${feel} שאולי הגיע הזמן לחזור למשימה "${original}". בוא נוודא יחד שזה הזמן הנכון.`
      : `אני ${feel} שאולי הגיע הזמן לחזור למשימה המקורית. בוא נוודא יחד שזה הזמן הנכון.`;
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

  const taskTitleTtsLoading = isSosTtsLoading(
    gateTask?.title ?? selectedTask?.title ?? response?.context.focus_task_title ?? '',
    'task_title'
  );

  return (
    <AnimatedDialog
      open={open}
      onClose={closeDialog}
      variant="center"
      panelRef={dialogRef}
      zIndex={200}
      aria-labelledby={titleId}
      aria-describedby={subtitleId}
      backdropClassName="absolute inset-0 bg-slate-950/55 backdrop-blur-md"
      panelClassName="touch-manipulation w-full max-w-md flex flex-col overflow-hidden rounded-[28px] border border-emerald-500/25 text-right shadow-2xl max-h-[min(80dvh,600px)]"
      panelStyle={{
        maxHeight: 'min(80dvh, 600px)',
        height: 'auto',
        boxShadow: '0 -8px 40px rgba(2,44,34,0.22), 0 24px 70px rgba(2,44,34,0.18)',
      }}
      mobileChromePadding
    >
        {/* Header — solid green like 404 */}
        <div
          className="relative shrink-0 px-5 pb-4 pt-5"
          style={{ background: 'linear-gradient(145deg, #047857, #059669, #10b981)' }}
        >
          <button
            type="button"
            onClick={closeDialog}
            className="absolute left-4 top-4 rounded-full bg-white/15 p-2 text-white/90 transition hover:bg-white/25"
            aria-label="סגירה"
          >
            <X className="h-4 w-4" />
          </button>
          {showBackButton ? (
            <button
              type="button"
              onClick={goBackFromResponse}
              className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-2 text-xs font-bold text-white/95 transition hover:bg-white/25"
              aria-label="חזרה לבחירת הקושי"
            >
              <ArrowRight className="h-4 w-4" aria-hidden />
              חזרה
            </button>
          ) : null}
          <div className="flex items-start gap-3">
            <motion.div
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 26, delay: 0.05 }}
            >
              <AlmogAvatarChip size={44} />
            </motion.div>
            <motion.div
              className="min-w-0 flex-1"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30, delay: 0.08 }}
            >
              <p id={titleId} className="text-lg font-black text-white">{title}</p>
              <p id={subtitleId} className="mt-1 text-xs font-semibold leading-5 text-emerald-50/90">{subtitle}</p>
            </motion.div>
          </div>
        </div>

        {/* Body — warm colorful panels */}
        <div
          className="touch-manipulation overflow-y-auto overscroll-contain px-5 py-4"
          style={{
            background: SOS_BODY_BG,
            WebkitOverflowScrolling: 'touch',
            maxHeight: 'calc(min(80dvh, 600px) - 6.5rem)',
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={bodyPhaseKey}
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
          {outcomeSaved || taskMarked ? (
            <div className="space-y-3 py-2 text-center">
              <p className={`${SOS_TEXT_STRONG} leading-7`}>
                {taskMarked
                  ? `סימנתי את המשימה ✓ — כל הכבוד!`
                  : outcomeSaved}
              </p>
              {guardianOptedIn === false && !guardianSaved ? (
                  <div className={`${sosSurface('white')} px-4 py-3 text-right text-xs leading-6 text-slate-800`}>
                  <p className="font-black">רוצה שאלמוג יגיע לפני הרגע הבא?</p>
                  <p className="mt-1 text-slate-600">
                    תזכורת עדינה לפני חלונות שקשים לך — רק אם תרצה, בלי לחץ.
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
                <p className="text-xs font-semibold text-slate-600">הפעלנו — אפשר לכבות בהגדרות מאלמוג.</p>
              ) : null}
              <button
                type="button"
                onClick={openChatFromSos}
                className={`${sosSurface('sky')} flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-slate-800`}
              >
                <MessageCircle className="h-4 w-4" />
                לדבר עם אלמוג
              </button>
              <button
                type="button"
                onClick={closeDialog}
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
              {showTaskHardnessGate ? (
                <div className={`${SOS_GATE_PANEL} space-y-3`}>
                  <div className={SOS_GATE_BUBBLE} style={SOS_ALMOG_BUBBLE_TEXT}>
                    {gateGreeting}
                  </div>

                  {focusTasks.length > 1 ? (
                    <div className="space-y-2">
                      <p className={SOS_LABEL}>על איזו משימה מדובר?</p>
                      <div className="grid gap-2">
                        {focusTasks.map((task) => {
                          const active = gateTask?.id === task.id;
                          return (
                            <button
                              key={task.id}
                              type="button"
                              onClick={() => setSelectedTask(task)}
                              className={`flex items-center justify-between px-3 py-2.5 text-right transition active:scale-[0.99] ${
                                active ? SOS_INTAKE_TASK_ACTIVE : SOS_INTAKE_TASK_IDLE
                              }`}
                            >
                              <span className={SOS_MUTED}>{task.stepTitle ?? 'מהמסע'}</span>
                              <span className="flex items-center gap-2 text-sm font-black text-slate-900">
                                {active ? <Check className="h-4 w-4 text-sky-600" /> : null}
                                <span>{task.emoji ?? '✅'}</span>
                                {task.title}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className={SOS_TASK_CARD}>
                    <p className={SOS_TASK_CARD_LABEL}>המשימה שעל הראש עכשיו</p>
                    <div className="mt-1 flex items-start justify-between gap-2">
                      <p className={SOS_TASK_CARD_TITLE}>
                        {gateTask?.emoji ? `${gateTask.emoji} ` : ''}
                        {gateTask?.title ?? '…'}
                      </p>
                      <button
                        type="button"
                        onClick={speakTaskTitle}
                        disabled={!gateTask?.title || taskTitleTtsLoading}
                        className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
                        aria-label="הקרא את המשימה"
                      >
                        {taskTitleTtsLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTaskHardConfirmed(true);
                        setPhase('intake');
                      }}
                      className="rounded-2xl px-4 py-3 text-sm font-black text-white"
                      style={{
                        background: 'linear-gradient(135deg, #047857, #10b981)',
                        boxShadow: '0 6px 16px rgba(16,185,129,0.22)',
                      }}
                    >
                      כן — קשה לי
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTaskHardConfirmed(false);
                        setSelectedTask(null);
                        setPhase('intake');
                      }}
                      className={SOS_GATE_NO_BUTTON}
                    >
                      לא, משהו אחר
                    </button>
                  </div>
                </div>
              ) : showIntake ? (
                <div className="space-y-4">
              <div className={SOS_ALMOG_BUBBLE} style={SOS_ALMOG_BUBBLE_TEXT}>
                {intakeGreeting}
              </div>

              {focusTasks.length > 0 ? (
                <div className={`${SOS_INTAKE_SECTION} space-y-2`}>
                  <p className={SOS_LABEL}>
                    {firstName ? `${firstName}, משימות פתוחות היום` : 'משימות פתוחות היום'}
                  </p>
                  <div className="grid gap-2">
                    {focusTasks.map((task) => {
                      const active = selectedTask?.id === task.id;
                      return (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => {
                            setSelectedTask(task);
                          }}
                          className={`flex items-center justify-between px-4 py-3 text-right transition active:scale-[0.99] ${
                            active ? SOS_INTAKE_TASK_ACTIVE : SOS_INTAKE_TASK_IDLE
                          }`}
                        >
                          <span className={SOS_MUTED}>
                            {task.stepTitle ?? 'מהמסע'}
                          </span>
                          <span className="flex items-center gap-2 text-sm font-black text-slate-900">
                            {active ? <Check className="h-4 w-4 text-emerald-600" /> : null}
                            <span className="text-lg">{task.emoji ?? '✅'}</span>
                            {task.title}
                          </span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTask(null);
                      }}
                      className={`flex w-full items-center justify-between px-4 py-3 text-right text-xs font-bold transition active:scale-[0.99] ${
                        selectedTask === null
                          ? SOS_INTAKE_TASK_ACTIVE
                          : 'rounded-2xl border border-dashed border-slate-300 bg-slate-50/90 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/60 hover:text-emerald-900'
                      }`}
                    >
                      <span className={selectedTask === null ? 'text-emerald-700' : SOS_MUTED}>
                        {selectedTask === null ? 'נבחר' : 'אפשרות נוספת'}
                      </span>
                      <span
                        className={`flex items-center gap-2 ${
                          selectedTask === null ? 'text-emerald-950' : 'text-slate-700'
                        }`}
                      >
                        {selectedTask === null ? (
                          <Check className="h-4 w-4 text-emerald-600" aria-hidden />
                        ) : (
                          <span className="text-base leading-none" aria-hidden>
                            💭
                          </span>
                        )}
                        לא קשור למשימה ספציפית
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}

              <p className={SOS_LABEL}>
                {firstName ? `${firstName}, מה הכי קרוב לרגע הזה?` : 'מה הכי קרוב לרגע הזה?'}
              </p>
              <div className="grid gap-2.5">
                {QUICK_TRIGGERS.map((trigger) => (
                  <button
                    key={trigger.id}
                    type="button"
                    onClick={() => void handleTrigger(trigger.id)}
                    disabled={loadingTrigger !== null}
                    className={`${SOS_TRIGGER_CARD[trigger.id]} flex items-center justify-between px-4 py-3.5 text-right transition active:scale-[0.98] disabled:opacity-70`}
                    style={SOS_TRIGGER_BG[trigger.id]}
                  >
                    <span className={SOS_TRIGGER_HELPER}>{trigger.helper}</span>
                    <span className="flex items-center gap-2.5">
                      {loadingTrigger === trigger.id && (
                        <Loader2 className="h-4 w-4 animate-spin text-white/90" />
                      )}
                      <span className="text-xl leading-none">{trigger.emoji}</span>
                      <span className={SOS_TRIGGER_LABEL}>{trigger.label}</span>
                    </span>
                  </button>
                ))}
              </div>

              <label className="block">
                <span className={`mb-1.5 block ${SOS_LABEL}`}>
                  {firstName ? `${firstName}, ${wantAddWordLabel}` : wantAddWordLabel}
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={240}
                  rows={2}
                  className={SOS_NOTE_FIELD}
                  placeholder={
                    selectedTask?.title
                      ? `למשל: קשה לי עם "${selectedTask.title}" אחרי יום עמוס`
                      : 'למשל: היה יום עמוס ואני מול המקרר'
                  }
                />
              </label>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              {response.context.focus_task_title ? (
                <div className={`${sosSurface('sky')} px-4 py-3 text-xs font-bold text-slate-800`}>
                  ההצעה הבאה מותאמת ל{' '}
                  <span className="text-sm text-slate-900">
                    {response.context.focus_task_emoji ?? '✅'} {response.context.focus_task_title}
                  </span>
                  {response.context.step_title ? (
                    <span className="mt-1 block font-semibold text-slate-600">
                      מתוך {response.context.step_title}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {response.memory_hint ? (
                <p className="text-xs font-semibold leading-6 text-slate-600">{response.memory_hint}</p>
              ) : null}

              <div
                className="relative overflow-hidden rounded-3xl p-4 text-white shadow-lg"
                style={{
                  background: 'linear-gradient(145deg, #047857, #059669, #10b981)',
                  boxShadow: '0 8px 24px rgba(4,120,87,0.22)',
                }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-4 top-px h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"
                />
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm font-semibold leading-7">
                    {response.intervention.message}
                  </p>
                  <button
                    type="button"
                    onClick={speakInterventionMessage}
                    disabled={isSosTtsLoading(response.intervention.message, 'intervention_message')}
                    className="shrink-0 rounded-xl bg-white/15 p-2 text-white/90 transition hover:bg-white/25 disabled:opacity-60"
                    aria-label="הקרא את ההודעה"
                  >
                    {isSosTtsLoading(response.intervention.message, 'intervention_message') ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className={`${sosSurface('amber')} relative overflow-hidden p-4`}>
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-600" />
                  <p className={SOS_LABEL}>הצעד שלך עכשיו</p>
                </div>
                <p className="text-base font-black text-slate-900">{response.intervention.label}</p>
                <p className="mt-2 text-sm leading-7 text-slate-800">{response.intervention.micro_step}</p>
                <p className="mt-2 text-[10px] font-semibold text-slate-500">
                  {FRICTION_META[response.intervention.category].emoji}{' '}
                  {FRICTION_META[response.intervention.category].labelHe}
                  {taskHardConfirmed ? ' · המשימה המקורית מוקפאת זמנית' : ''}
                </p>
              </div>

              {taskHardConfirmed && response.blocker_id && !easeCreated ? (
                <button
                  type="button"
                  disabled={easeCreating}
                  onClick={() => void createEaseTaskFromSos()}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black text-white disabled:opacity-70"
                  style={{
                    background: 'linear-gradient(135deg, #0d9488, #14b8a6)',
                    boxShadow: '0 6px 18px rgba(13,148,136,0.25)',
                  }}
                >
                  {easeCreating ? 'מוסיף למשימות…' : 'הוסף למשימות שלי והקפא את המקורית'}
                </button>
              ) : null}

              {easeCreated ? (
                <div className={`${sosSurface('sky')} px-4 py-3 text-xs leading-6 text-slate-800`}>
                  <p className="font-black">נוסף למשימות שלך ✓</p>
                  <p className="mt-1 text-slate-600">
                    המשימה המקורית מוקפאת. כשתסיים את הצעד הקל — נחזיר אותה בהדרגה.
                  </p>
                  <button
                    type="button"
                    onClick={openUnfreezeChat}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-sky-800"
                  >
                    <Snowflake className="h-3.5 w-3.5" />
                    מוכן/ה לחזור למשימה המקורית?
                  </button>
                </div>
              ) : null}

              {error ? <p className="text-xs font-semibold text-amber-700">{error}</p> : null}

              {response.follow_up_scheduled ? (
                <p className="text-[11px] font-semibold text-slate-600">
                  אשמור עליך — אבדוק בעדינות איך היה, רק כשזה מתאים.
                </p>
              ) : null}

              {response.care_focus_active ? (
                <p className="text-[11px] font-semibold leading-5 text-slate-600">
                  הורדתי זמנית תזכורות אחרות — כדי שתוכל להתרכז רק ברגע הזה.
                </p>
              ) : null}

              <p className={SOS_LABEL}>איך היה?</p>
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
                  className={`${sosSurface('rose')} px-4 py-3 text-sm font-bold text-slate-800 disabled:opacity-70`}
                >
                  {pivoting ? 'מציע גישה אחרת…' : 'עדיין קשה — ננסה אחרת'}
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={openChatFromSos}
                  className={`${sosSurface('white')} flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-bold text-slate-800`}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  לדבר עם אלמוג
                </button>
                {(selectedTask?.id || response.context.focus_task_id) ? (
                  <button
                    type="button"
                    disabled={taskMarking}
                    onClick={openTaskDoneFromSos}
                    className={`${sosSurface('white')} px-3 py-2.5 text-xs font-bold text-slate-800 disabled:opacity-70`}
                  >
                    {taskMarking ? 'מסמן…' : 'סימנתי — עשיתי 🎯'}
                  </button>
                ) : null}
              </div>
            </div>
          )}
            </motion.div>
          </AnimatePresence>
        </div>
    </AnimatedDialog>
  );
}
