import type { OnboardingExtracted } from '../ai/onboarding-chat-llm';
import {
  buildFieldFlags,
  redactExtractedForClient,
  type ProfileFieldFlags,
} from './extracted-field-flags';

/** שדות פרופיל לטעינת שיחת עדכון — הערכים הרגישים נשארים בשרת */
export type ProfileRowForChat = {
  gender?: 'male' | 'female' | null;
  full_name?: string | null;
  main_goal?: OnboardingExtracted['main_goal'] | string | null;
  current_weight_kg?: number | null;
  goal_weight_kg?: number | null;
  weakest_time_of_day?: OnboardingExtracted['weakest_time_of_day'] | string | null;
  main_obstacle?: OnboardingExtracted['main_obstacle'] | string | null;
  main_obstacle_detail?: string | null;
  wake_up_time?: string | null;
  sleep_time?: string | null;
  onboarding_completed?: boolean | null;
};

const MAIN_GOALS = new Set(['weight_loss', 'healthy_lifestyle', 'both']);
const WEAKEST_TIMES = new Set(['morning', 'noon', 'afternoon', 'evening_night']);
const OBSTACLES = new Set([
  'no_time',
  'emotional_eating',
  'lack_of_consistency',
  'no_support',
  'other',
]);

function normalizeTime(value: string | null | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  return value.trim().slice(0, 5);
}

/** דגלים בלבד — כולל שדות רגישים שמורים ב-DB, בלי לחשוף ערכים */
export function buildFlagsFromProfileRow(row: ProfileRowForChat | null | undefined): ProfileFieldFlags {
  if (!row) {
    return {
      has_full_name: false,
      has_gender: false,
      has_main_goal: false,
      has_current_weight: false,
      has_goal_weight: false,
      has_weakest_time: false,
      has_main_obstacle: false,
      has_wake_time: false,
      has_sleep_time: false,
    };
  }
  return {
    has_full_name: Boolean(row.full_name?.trim()),
    has_gender: row.gender === 'male' || row.gender === 'female',
    has_main_goal: Boolean(row.main_goal && MAIN_GOALS.has(row.main_goal)),
    has_current_weight: row.current_weight_kg != null && Number.isFinite(row.current_weight_kg),
    has_goal_weight: row.goal_weight_kg != null && Number.isFinite(row.goal_weight_kg),
    has_weakest_time: Boolean(row.weakest_time_of_day && WEAKEST_TIMES.has(row.weakest_time_of_day)),
    has_main_obstacle: Boolean(row.main_obstacle && OBSTACLES.has(row.main_obstacle)),
    has_wake_time: Boolean(normalizeTime(row.wake_up_time)),
    has_sleep_time: Boolean(normalizeTime(row.sleep_time)),
  };
}

/** רק שדות לא-רגישים — בטוח ל-LLM וללקוח */
export function buildPublicExtractedFromProfileRow(
  row: ProfileRowForChat | null | undefined
): OnboardingExtracted {
  if (!row) return {};
  const out: OnboardingExtracted = {};
  if (row.gender === 'male' || row.gender === 'female') out.gender = row.gender;
  if (row.main_goal && MAIN_GOALS.has(row.main_goal)) {
    out.main_goal = row.main_goal as OnboardingExtracted['main_goal'];
  }
  if (row.weakest_time_of_day && WEAKEST_TIMES.has(row.weakest_time_of_day)) {
    out.weakest_time_of_day = row.weakest_time_of_day as OnboardingExtracted['weakest_time_of_day'];
  }
  if (row.main_obstacle && OBSTACLES.has(row.main_obstacle)) {
    out.main_obstacle = row.main_obstacle as OnboardingExtracted['main_obstacle'];
  }
  if (row.main_obstacle_detail?.trim()) {
    out.main_obstacle_detail = row.main_obstacle_detail.trim().slice(0, 300);
  }
  return out;
}

export function buildProfileChatBootstrap(row: ProfileRowForChat | null | undefined) {
  const fieldFlags = buildFlagsFromProfileRow(row);
  const extractedPublic = redactExtractedForClient(buildPublicExtractedFromProfileRow(row));
  return { fieldFlags, extractedPublic };
}

export function countKnownProfileFields(flags: ProfileFieldFlags): number {
  return Object.values(flags).filter(Boolean).length;
}

/** מינימום לסיכום שיחת עדכון — שם + מטרה + מכשול או זמן חלש */
export function isProfileBasicsComplete(flags: ProfileFieldFlags): boolean {
  return Boolean(
    flags.has_full_name &&
      flags.has_main_goal &&
      (flags.has_main_obstacle || flags.has_weakest_time)
  );
}

/** לפני בחירת מסלול — הפרופיל כבר מלא והמשתמש אולי הגיע בטעות */
export function shouldClarifyProfileUpdateIntent(
  flags: ProfileFieldFlags,
  onboardingCompleted?: boolean | null
): boolean {
  return Boolean(onboardingCompleted) || isProfileBasicsComplete(flags);
}

const GOAL_LABELS: Record<string, string> = {
  weight_loss: 'ירידה במשקל',
  healthy_lifestyle: 'אורח חיים בריא',
  both: 'גם וגם',
};

const WEAKEST_LABELS: Record<string, string> = {
  morning: 'בוקר',
  noon: 'צהריים',
  afternoon: 'אחר הצהריים',
  evening_night: 'ערב/לילה',
};

const OBSTACLE_LABELS: Record<string, string> = {
  no_time: 'חוסר זמן',
  emotional_eating: 'אכילה רגשית',
  lack_of_consistency: 'חוסר עקביות',
  no_support: 'חוסר תמיכה',
  other: 'אחר',
};

/** תקציר בטוח ל-LLM — קטגוריות ודגלים, בלי שם/משקל/שעות */
export function describeKnownProfileForLlm(
  flags: ProfileFieldFlags,
  publicExtracted: OnboardingExtracted
): string {
  const parts: string[] = [];
  if (flags.has_full_name) parts.push('שם שמור');
  if (flags.has_gender) parts.push('פנייה מוגדרת');
  if (flags.has_main_goal && publicExtracted.main_goal) {
    parts.push(`מטרה: ${GOAL_LABELS[publicExtracted.main_goal] ?? publicExtracted.main_goal}`);
  }
  if (flags.has_current_weight) parts.push('משקל נוכחי שמור');
  if (flags.has_goal_weight) parts.push('משקל יעד שמור');
  if (flags.has_weakest_time && publicExtracted.weakest_time_of_day) {
    parts.push(`זמן חלש: ${WEAKEST_LABELS[publicExtracted.weakest_time_of_day] ?? publicExtracted.weakest_time_of_day}`);
  }
  if (flags.has_main_obstacle && publicExtracted.main_obstacle) {
    parts.push(`מכשול: ${OBSTACLE_LABELS[publicExtracted.main_obstacle] ?? publicExtracted.main_obstacle}`);
  }
  if (flags.has_wake_time) parts.push('שעת השכמה שמורה');
  if (flags.has_sleep_time) parts.push('שעת שינה שמורה');
  if (parts.length === 0) return 'אין עדיין נתונים שמורים בפרופיל.';
  return `כבר שמור בפרופיל (בלי לחשוף ערכים רגישים): ${parts.join(' · ')}.`;
}

export function mergeProfileFlags(
  client: Partial<ProfileFieldFlags>,
  server: ProfileFieldFlags
): ProfileFieldFlags {
  return {
    has_full_name: client.has_full_name ?? server.has_full_name,
    has_gender: client.has_gender ?? server.has_gender,
    has_main_goal: client.has_main_goal ?? server.has_main_goal,
    has_current_weight: client.has_current_weight ?? server.has_current_weight,
    has_goal_weight: client.has_goal_weight ?? server.has_goal_weight,
    has_weakest_time: client.has_weakest_time ?? server.has_weakest_time,
    has_main_obstacle: client.has_main_obstacle ?? server.has_main_obstacle,
    has_wake_time: client.has_wake_time ?? server.has_wake_time,
    has_sleep_time: client.has_sleep_time ?? server.has_sleep_time,
  };
}

/** לבדיקות — דגלים מלאים כולל רגישים */
export function buildFullFlagsFromProfileRow(row: ProfileRowForChat): ProfileFieldFlags {
  return buildFieldFlags({
    ...buildPublicExtractedFromProfileRow(row),
    full_name: row.full_name ?? undefined,
    current_weight_kg: row.current_weight_kg ?? undefined,
    goal_weight_kg: row.goal_weight_kg ?? undefined,
    wake_up_time: normalizeTime(row.wake_up_time),
    sleep_time: normalizeTime(row.sleep_time),
  });
}
