import type { MainGoal, MainObstacle, OnboardingGender, WeakestTimeOfDay } from '../onboarding/types';
export type OnboardingProfileForChat = {
  full_name: string | null;
  gender: OnboardingGender | null;
  main_goal: MainGoal | null;
  current_weight_kg: number | null;
  goal_weight_kg: number | null;
  weakest_time_of_day: WeakestTimeOfDay | null;
  main_obstacle: MainObstacle | null;
  main_obstacle_detail: string | null;
  wake_up_time: string | null;
  sleep_time: string | null;
  dinner_time: string | null;
  preferred_channel: string | null;
  ai_check_in_times: string[] | null;
  onboarding_completed: boolean | null;
};

const GOAL_HE: Record<MainGoal, string> = {
  weight_loss: 'ירידה במשקל',
  healthy_lifestyle: 'אורח חיים בריא',
  both: 'משקל + אורח חיים',
};

const WEAKEST_HE: Record<WeakestTimeOfDay, string> = {
  morning: 'בוקר',
  noon: 'צהריים',
  afternoon: 'אחר הצהריים',
  evening_night: 'ערב/לילה',
};

const OBSTACLE_HE: Record<MainObstacle, string> = {
  no_time: 'חוסר זמן',
  emotional_eating: 'אכילה רגשית',
  lack_of_consistency: 'קושי להתמיד',
  no_support: 'חוסר תמיכה',
  other: 'אחר',
};

function formatTimeField(value: string | null): string | null {
  if (!value?.trim()) return null;
  const raw = value.trim();
  if (/^\d{2}:\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return raw.slice(0, 8);
}

function normalizeCheckInTimes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => (typeof t === 'string' ? formatTimeField(t) : null))
    .filter((t): t is string => Boolean(t))
    .slice(0, 3);
}

/**
 * בלוק קצר (~טוקנים מעטים) — תמיד מוזרק לצ'אט כשיש הרשמה.
 * לא מחליף RAG; משלים אותו עם עובדות מדויקות מה-DB.
 */
export function buildOnboardingChatContextBlock(profile: OnboardingProfileForChat): string {
  if (!profile.onboarding_completed) return '';

  const firstName =
    profile.full_name?.trim().split(/\s+/)[0] || profile.full_name?.trim() || 'המשתמש/ת';
  const goal = profile.main_goal ? GOAL_HE[profile.main_goal] : null;
  const weakest = profile.weakest_time_of_day ? WEAKEST_HE[profile.weakest_time_of_day] : null;
  const obstacle =
    profile.main_obstacle === 'other' && profile.main_obstacle_detail?.trim()
      ? profile.main_obstacle_detail.trim()
      : profile.main_obstacle
        ? OBSTACLE_HE[profile.main_obstacle]
        : null;

  const wake = formatTimeField(profile.wake_up_time);
  const sleep = formatTimeField(profile.sleep_time);
  const times = normalizeCheckInTimes(profile.ai_check_in_times);

  const weightLine =
    profile.current_weight_kg != null && profile.goal_weight_kg != null
      ? `משקל ${profile.current_weight_kg}→${profile.goal_weight_kg} ק"ג`
      : null;

  const lines: string[] = [
    'פרופיל מהרשמה (דולב אסף — אתה אלמוג מיישם; אל תזכיר דולב/שאלון):',
    `- שם: ${firstName}`,
  ];
  if (goal) lines.push(`- מטרה: ${goal}`);
  if (weightLine) lines.push(`- ${weightLine}`);
  if (weakest) lines.push(`- החלון הקשה ביום: ${weakest}`);
  if (obstacle) lines.push(`- מכשול מרכזי: ${obstacle}`);
  if (wake && sleep) lines.push(`- שכמה ${wake} | שינה ${sleep}`);
  const dinner = formatTimeField(profile.dinner_time);
  if (dinner) lines.push(`- ארוחת ערב טיפוסית: ${dinner}`);
  if (times.length) {
    lines.push(`- זמני מגע יומיים (ישראל): ${times.join(', ')}`);
    if (weakest && times[1]) {
      lines.push(`- בדיקה 2 (${times[1]}) — לפני החלון הקשה (${weakest})`);
    }
  }

  lines.push(
    '- השתמש בפרטים האלה לדפוסים וטיפים מותאמים; אם חסר מידע — שאלה אחת קצרה.'
  );

  return lines.join('\n');
}

/** עובדות קצרות לאינדוקס וקטורי חד-פעמי (בלי LLM). */
export function buildOnboardingVectorFacts(profile: OnboardingProfileForChat): Array<{
  key: string;
  category: 'schedule' | 'weakness' | 'strength';
  text: string;
}> {
  if (!profile.onboarding_completed) return [];

  const facts: Array<{ key: string; category: 'schedule' | 'weakness' | 'strength'; text: string }> =
    [];
  const goal = profile.main_goal ? GOAL_HE[profile.main_goal] : 'ליווי אישי';
  const weakest = profile.weakest_time_of_day ? WEAKEST_HE[profile.weakest_time_of_day] : null;
  const obstacle =
    profile.main_obstacle === 'other' && profile.main_obstacle_detail?.trim()
      ? profile.main_obstacle_detail.trim()
      : profile.main_obstacle
        ? OBSTACLE_HE[profile.main_obstacle]
        : null;

  facts.push({
    key: 'goal',
    category: 'strength',
    text: `מטרה מההרשמה: ${goal}.`,
  });

  if (profile.current_weight_kg != null && profile.goal_weight_kg != null) {
    facts.push({
      key: 'weight',
      category: 'schedule',
      text: `משקל בהרשמה: ${profile.current_weight_kg} ק"ג, יעד ${profile.goal_weight_kg} ק"ג.`,
    });
  }

  if (weakest) {
    facts.push({
      key: 'weakest',
      category: 'weakness',
      text: `החלון הקשה ביום — ${weakest}.`,
    });
  }

  if (obstacle) {
    facts.push({
      key: 'obstacle',
      category: 'weakness',
      text: `מכשול מרכזי מההרשמה: ${obstacle}.`,
    });
  }

  const wake = formatTimeField(profile.wake_up_time);
  const sleep = formatTimeField(profile.sleep_time);
  if (wake && sleep) {
    facts.push({
      key: 'sleep',
      category: 'schedule',
      text: `שעות יום: השכמה ${wake}, שינה ${sleep}.`,
    });
  }

  const dinner = formatTimeField(profile.dinner_time);
  if (dinner) {
    facts.push({
      key: 'dinner',
      category: 'schedule',
      text: `ארוחת ערב טיפוסית ${dinner} — מגע לפני ואחרי כשמתוזמן.`,
    });
  }

  const times = normalizeCheckInTimes(profile.ai_check_in_times);
  if (times.length) {
    facts.push({
      key: 'checkins',
      category: 'schedule',
      text: `זמני מגע יומיים של אלמוג (ישראל): ${times.join(', ')}.`,
    });
  }

  return facts;
}

export async function stableOnboardingVectorId(userId: string, factKey: string): Promise<string> {
  const payload = `onboarding|${userId}|${factKey}`;
  const enc = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `nw-onb-${hex.slice(0, 40)}`;
}
