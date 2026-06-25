import type { OnboardingExtracted } from '../ai/onboarding-chat-llm';
import { DISCRETE_FIELD_KEYS, type DiscreteFieldKey } from '../ai/onboarding-discrete-fields';

/** דגלים בלבד — בלי ערכים רגישים, בטוח לשליחה ל-LLM וללוגים */
export type ProfileFieldFlags = {
  has_full_name: boolean;
  has_gender: boolean;
  has_main_goal: boolean;
  has_current_weight: boolean;
  has_goal_weight: boolean;
  has_weakest_time: boolean;
  has_main_obstacle: boolean;
  has_wake_time: boolean;
  has_sleep_time: boolean;
};

export function buildFieldFlags(extracted: OnboardingExtracted): ProfileFieldFlags {
  return {
    has_full_name: Boolean(extracted.full_name?.trim()),
    has_gender: extracted.gender === 'male' || extracted.gender === 'female',
    has_main_goal: Boolean(extracted.main_goal),
    has_current_weight: typeof extracted.current_weight_kg === 'number',
    has_goal_weight: typeof extracted.goal_weight_kg === 'number',
    has_weakest_time: Boolean(extracted.weakest_time_of_day),
    has_main_obstacle: Boolean(extracted.main_obstacle),
    has_wake_time: Boolean(extracted.wake_up_time),
    has_sleep_time: Boolean(extracted.sleep_time),
  };
}

const SENSITIVE_KEYS = new Set<string>(DISCRETE_FIELD_KEYS);

/** מסיר ערכים רגישים מתשובת API — הלקוח שומר אותם מקומית בלבד */
export function redactExtractedForClient(extracted: OnboardingExtracted): OnboardingExtracted {
  const out: OnboardingExtracted = { ...extracted };
  for (const key of SENSITIVE_KEYS) {
    delete out[key as keyof OnboardingExtracted];
  }
  return out;
}

/** הקשר בטוח ל-LLM — רק דגלים ושדות לא רגישים */
export function buildLlmKnownContext(
  extracted: OnboardingExtracted,
  flags?: ProfileFieldFlags
): Record<string, unknown> {
  const f = flags ?? buildFieldFlags(extracted);
  const ctx: Record<string, unknown> = { ...f };
  if (extracted.main_goal) ctx.main_goal = extracted.main_goal;
  if (extracted.weakest_time_of_day) ctx.weakest_time_of_day = extracted.weakest_time_of_day;
  if (extracted.main_obstacle) ctx.main_obstacle = extracted.main_obstacle;
  if (extracted.main_obstacle_detail) ctx.main_obstacle_detail = extracted.main_obstacle_detail;
  if (extracted.gender) ctx.gender = extracted.gender;
  return ctx;
}

export function mergeSensitiveField(
  extracted: OnboardingExtracted,
  key: DiscreteFieldKey,
  applied: OnboardingExtracted
): OnboardingExtracted {
  return { ...extracted, ...applied };
}
