import type {
  AlmogHabitCheckpointPayload,
  HabitCheckpointSlot,
} from '../workflows/almog-habit-checkpoint-payload';
import type { FallMemoryContext } from './fall-memory';

const SLOT_GREETING: Record<HabitCheckpointSlot, string> = {
  morning: 'בוקר טוב',
  midday: 'צהריים טובים',
  evening: 'ערב טוב',
};

export type BuildAlmogNotificationTitleInput = {
  firstName: string;
  payload: AlmogHabitCheckpointPayload;
  fallMemory?: FallMemoryContext | null;
  isCompassionOnly?: boolean;
};

/**
 * כותרת דינמית דטרמיניסטית — לא LLM נוסף.
 * משקפת מצב: שגרה / חזרה על נפילה / דאגה / נוכחות רכה / ביצוע.
 */
export function buildAlmogNotificationTitle(input: BuildAlmogNotificationTitleInput): string {
  const { firstName, payload, fallMemory, isCompassionOnly } = input;
  const name = firstName.trim() || 'חבר';
  const slotGreeting = SLOT_GREETING[payload.slot];
  const days = payload.daysSinceLastActive;
  const isRepeat = fallMemory?.isRepeatPattern === true;

  if (payload.completionStatus === 'full') {
    return `יפה ${name}! 🎯`;
  }

  if (payload.completionStatus === 'partial') {
    return `עוד רגע סוגרים, ${name} 💪`;
  }

  if (isCompassionOnly) {
    return `${name}, איך אתה? 🌙`;
  }

  if (payload.notifyMode === 'reinforce' && payload.reinforceKind === 'presence') {
    if (days >= 14) return `אני כאן, ${name} 💙`;
    if (days >= 8) return `${name}, אין לחץ 🌿`;
    if (days >= 3) return `${name}, הכל בסדר?`;
    return `${name} 💬`;
  }

  if (isRepeat && days >= 1 && days <= 7) {
    return `${name}, שוב נעלמת לי? 🥲`;
  }

  if (days >= 14) {
    return `אני כאן, ${name} 💙`;
  }

  if (days >= 8) {
    return `${name}, אני כאן בשבילך`;
  }

  if (days >= 3) {
    return `${name}, הכל בסדר?`;
  }

  if (days === 2) {
    return `מה קורה, ${name}?`;
  }

  if (days === 1) {
    return `${name}, איפה אתה?`;
  }

  if (payload.slot === 'morning') {
    return `${slotGreeting}, ${name} ☀️`;
  }

  if (payload.slot === 'midday') {
    return `מה מצב, ${name}? 🌤️`;
  }

  return `${slotGreeting}, ${name} 🌙`;
}
