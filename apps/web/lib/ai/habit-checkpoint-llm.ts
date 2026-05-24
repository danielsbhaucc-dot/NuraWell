import type {
  AlmogHabitCheckpointPayload,
  HabitCheckpointSlot,
} from '../workflows/almog-habit-checkpoint-payload';
import type { TodayAlmogTouch } from './almog-notify-day-context';
import type { AiUserContext } from './memory';

export type HabitCheckpointLlmDecision = {
  useLlm: boolean;
  reason: string;
};

export type HabitCheckpointLlmInputs = {
  payload: AlmogHabitCheckpointPayload;
  aiContext: AiUserContext | Record<string, unknown> | null | undefined;
  unansweredEarlierToday: number;
};

export type HabitCheckpointTemplateInput = {
  firstName: string;
  payload: AlmogHabitCheckpointPayload;
  slot: HabitCheckpointSlot;
};

const MOOD_NEEDS_LLM = new Set(['frustrated', 'disengaged']);

function hasMeaningfulNotes(ctx: AiUserContext | Record<string, unknown> | null | undefined): boolean {
  if (!ctx) return false;
  const notes = (ctx as Record<string, unknown>).notes;
  return typeof notes === 'string' && notes.trim().length >= 8;
}

function hasFocusedContext(ctx: AiUserContext | Record<string, unknown> | null | undefined): boolean {
  if (!ctx) return false;
  const row = ctx as Record<string, unknown>;
  const focus = row.current_focus;
  const goal = row.current_goal;
  return (
    (typeof focus === 'string' && focus.trim().length >= 4) ||
    (typeof goal === 'string' && goal.trim().length >= 4)
  );
}

export function countUnansweredEarlierToday(
  touches: TodayAlmogTouch[],
  currentSlot: HabitCheckpointSlot
): number {
  const prior = touches.filter((t) => t.slot !== currentSlot || !t.slot);
  return prior.filter((t) => !t.userRepliedSince).length;
}

export function decideHabitCheckpointLlmUsage(
  input: HabitCheckpointLlmInputs
): HabitCheckpointLlmDecision {
  const { payload, aiContext, unansweredEarlierToday } = input;

  if (payload.notifyMode === 'reinforce' && payload.reinforceKind === 'presence') {
    return { useLlm: true, reason: 'reinforce_presence' };
  }

  if (unansweredEarlierToday >= 1) {
    return { useLlm: true, reason: 'unanswered_today_needs_fresh_angle' };
  }

  if (hasMeaningfulNotes(aiContext)) {
    return { useLlm: true, reason: 'meaningful_notes' };
  }

  const mood = String((aiContext as Record<string, unknown> | null)?.current_mood_signal ?? '');
  if (MOOD_NEEDS_LLM.has(mood)) {
    return { useLlm: true, reason: `mood_${mood}` };
  }

  if (hasFocusedContext(aiContext)) {
    return { useLlm: true, reason: 'has_current_focus_or_goal' };
  }

  return { useLlm: false, reason: 'routine_checkpoint' };
}

function firstRelevantTitle(payload: AlmogHabitCheckpointPayload): string | null {
  if (payload.notifyMode === 'reinforce') {
    return (
      payload.completedTodayTasks[0]?.title ??
      payload.completedTodayHabits[0]?.title ??
      null
    );
  }
  return payload.pendingTasks[0]?.title ?? payload.habits[0]?.title ?? null;
}

function shortTitle(title: string): string {
  const clean = title.replace(/\s+/g, ' ').trim();
  return clean.length > 42 ? `${clean.slice(0, 41)}…` : clean;
}

export function buildHabitCheckpointTemplateBody(input: HabitCheckpointTemplateInput): string {
  const { firstName, payload, slot } = input;
  const target = firstRelevantTitle(payload);
  const targetText = target ? shortTitle(target) : null;

  if (payload.notifyMode === 'reinforce') {
    if (targetText) {
      return `${firstName}, יששש 🎯 ${targetText} כבר בפנים. מה הכי עזר לך שזה קרה היום?`;
    }
    return `${firstName}, ראיתי שהיית כאן היום וזה כבר משהו. מה הדבר הקטן שעזר לך להישאר בקשר?`;
  }

  if (slot === 'morning') {
    if (targetText) {
      return `${firstName}, בוקר טוב 🌿 בוא נשים את ${targetText} במקום שקל לתפוס היום. מה יעזור שזה יקרה בלי מאמץ?`;
    }
    return `${firstName}, בוקר טוב 🌿 מה הדבר הקטן שיעשה לך את היום קצת יותר מסודר?`;
  }

  if (slot === 'midday') {
    if (targetText) {
      return `${firstName}, רגע קטן של צהריים — איך היום זז עם ${targetText}? מה הכי תופס אותך עכשיו?`;
    }
    return `${firstName}, צהריים רגע. איך היום זז עד עכשיו, ומה הכי תופס אותך?`;
  }

  if (targetText) {
    return `${firstName}, ערב כזה שמסכם רגע את היום. איפה ${targetText} פגש אותך היום, אפילו בקטן?`;
  }
  return `${firstName}, ערב רגע. מה היה הכי בולט ביום הזה — משהו שקל או משהו שתפס אותך?`;
}
