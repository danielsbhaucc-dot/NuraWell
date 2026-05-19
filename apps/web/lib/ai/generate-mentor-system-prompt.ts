import type { MainGoal, MainObstacle, OnboardingGender, WeakestTimeOfDay } from '../onboarding/types';
import type { MealScheduleEntry } from '../onboarding/meal-schedule';
import { formatMealScheduleForPrompt } from '../onboarding/meal-schedule';

export type MentorPromptProfile = {
  full_name: string;
  gender: OnboardingGender;
  main_goal: MainGoal;
  current_weight_kg: number;
  goal_weight_kg: number;
  height_cm?: number | null;
  weakest_time_of_day: WeakestTimeOfDay;
  main_obstacle: MainObstacle;
  main_obstacle_detail?: string | null;
  wake_up_time: string;
  sleep_time: string;
  dinner_time?: string | null;
  meal_schedule?: MealScheduleEntry[] | null;
  preferred_channel: 'whatsapp' | 'in_app' | 'phone';
};

const GOAL_LABELS: Record<MainGoal, string> = {
  weight_loss: 'ירידה במשקל',
  healthy_lifestyle: 'סיגול אורח חיים בריא יותר',
  both: 'גם ירידה במשקל וגם אורח חיים בריא',
};

const WEAKEST_LABELS: Record<WeakestTimeOfDay, string> = {
  morning: 'בוקר (ממהר/ת, מפספס/ת ארוחות)',
  noon: 'צהריים (אוכל/ת בחוץ / משלוחים)',
  afternoon: 'אחר הצהריים (עייפות אחרי העבודה)',
  evening_night: 'ערב/לילה (נשנושים מול מסך)',
};

const OBSTACLE_LABELS: Record<MainObstacle, string> = {
  no_time: 'חוסר זמן לבשל או להתארגן מראש',
  emotional_eating: 'אכילה רגשית (מתח, עייפות, שעמום)',
  lack_of_consistency: 'קושי להתמיד לאורך זמן',
  no_support: 'חוסר תמיכה ומסגרת שעוקבת',
  other: 'אחר',
};

const GENDER_ADDRESS: Record<OnboardingGender, { you: string; your: string }> = {
  male: { you: 'אתה', your: 'שלך' },
  female: { you: 'את', your: 'שלך' },
};

/** Parse "HH:MM" or "HH:MM:SS" → minutes from midnight */
export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map((p) => Number.parseInt(p, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    throw new Error(`זמן לא תקין: ${time}`);
  }
  return h * 60 + m;
}

/** Format minutes → "HH:MM" (24h) */
export function formatMinutesToTime(totalMinutes: number): string {
  const wrapped = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Center of weakest window in minutes (during waking day) */
function weakestWindowCenterMinutes(weakest: WeakestTimeOfDay, wakeMin: number, sleepMin: number): number {
  const span = sleepMin > wakeMin ? sleepMin - wakeMin : sleepMin + 24 * 60 - wakeMin;
  const offsets: Record<WeakestTimeOfDay, number> = {
    morning: Math.min(90, Math.max(45, Math.round(span * 0.12))),
    noon: Math.min(span - 60, Math.max(180, Math.round(span * 0.42))),
    afternoon: Math.min(span - 90, Math.max(240, Math.round(span * 0.58))),
    evening_night: Math.min(span - 45, Math.max(300, Math.round(span * 0.78))),
  };
  return wakeMin + offsets[weakest];
}

/**
 * זמני מגע יומיים: 3 בסיס (לפני חלון קשה) + עד 2 נוספים אם יש שעת ארוחת ערב (לפני/אחרי).
 */
export function calculateDailyCheckInTimes(
  wakeUpTime: string,
  sleepTime: string,
  weakestTimeOfDay: WeakestTimeOfDay,
  options?: { dinnerTime?: string | null; meals?: MealScheduleEntry[] | null }
): string[] {
  const dinnerTime = options?.dinnerTime;
  const meals = options?.meals;
  const wakeMin = parseTimeToMinutes(wakeUpTime);
  let sleepMin = parseTimeToMinutes(sleepTime);
  if (sleepMin <= wakeMin) sleepMin += 24 * 60;

  const weakestCenter = weakestWindowCenterMinutes(weakestTimeOfDay, wakeMin, sleepMin);
  const anchor = weakestCenter - 40;

  const minFirst = wakeMin + 45;
  const maxLast = sleepMin - 50;

  let check2 = Math.max(minFirst + 30, Math.min(anchor, maxLast - 120));

  const gap = maxLast - minFirst;
  let check1 = minFirst + Math.round(gap * 0.22);
  let check3 = minFirst + Math.round(gap * 0.78);

  if (check1 >= check2 - 75) check1 = check2 - 90;
  if (check3 <= check2 + 75) check3 = check2 + 90;

  check1 = Math.max(minFirst, check1);
  check3 = Math.min(maxLast, check3);

  const minuteSet = new Set<number>([check1, check2, check3]);

  if (meals?.length) {
    for (const meal of meals) {
      const dinnerMin = parseTimeToMinutes(meal.time);
      minuteSet.add(Math.max(minFirst, dinnerMin - 25));
      minuteSet.add(Math.min(maxLast, dinnerMin + 35));
    }
  } else {
    const dinnerRaw = dinnerTime?.trim();
    if (dinnerRaw && /^\d{1,2}:\d{2}/.test(dinnerRaw)) {
      const dinnerMin = parseTimeToMinutes(dinnerRaw.slice(0, 5));
      minuteSet.add(Math.max(minFirst, dinnerMin - 25));
      minuteSet.add(Math.min(maxLast, dinnerMin + 35));
    }
  }

  const sorted = [...minuteSet].sort((a, b) => a - b).slice(0, 7);
  return sorted.map(formatMinutesToTime);
}

/**
 * הקשר הרשמה בלבד — נשמר ב-DB. אלמוג מקבל את NURAWELL_MENTOR_PROMPT בנפרד (חיסכון טוקנים).
 */
export function generateMentorSystemPrompt(profile: MentorPromptProfile): string {
  const times = calculateDailyCheckInTimes(
    profile.wake_up_time,
    profile.sleep_time,
    profile.weakest_time_of_day,
    { dinnerTime: profile.dinner_time, meals: profile.meal_schedule }
  );
  const addr = GENDER_ADDRESS[profile.gender];
  const firstName = profile.full_name.trim().split(/\s+/)[0] || profile.full_name;
  const heightLine =
    profile.height_cm != null && profile.height_cm > 0
      ? `\n- גובה: ${profile.height_cm} ס"מ`
      : '';

  const obstacleText =
    profile.main_obstacle === 'other' && profile.main_obstacle_detail?.trim()
      ? profile.main_obstacle_detail.trim()
      : OBSTACLE_LABELS[profile.main_obstacle];

  const mealsLine =
    profile.meal_schedule && profile.meal_schedule.length > 0
      ? `\n- ארוחות עיקריות: ${formatMealScheduleForPrompt(profile.meal_schedule)} — מגע לפני/אחרי כל ארוחה`
      : profile.dinner_time?.trim()
        ? `\n- ארוחת ערב: ${profile.dinner_time.trim().slice(0, 5)}`
        : '';

  return `## הקשר מהרשמה (אסף דולב — אתה אלמוג מיישם)
דולב ליווה את ${firstName} בשאלון ההצטרפות ואסף את הפרטים. מעכשיו אתה אלמוג — המנטור האמיתי.
השתמש במידע הזה בכל follow-up ובשיחה; אל תזכיר "דולב" או "שאלון" אלא אם המשתמש/ת שואל/ת.

### פרופיל
- שם: ${profile.full_name} | פניה: ${addr.you}
- מטרה: ${GOAL_LABELS[profile.main_goal]}
- משקל נוכחי: ${profile.current_weight_kg} ק"ג | יעד: ${profile.goal_weight_kg} ק"ג${heightLine}
- החלון הקשה ביום: ${WEAKEST_LABELS[profile.weakest_time_of_day]}
- המכשול העיקרי: ${obstacleText}
- שעת השכמה: ${profile.wake_up_time} | שעת שינה: ${profile.sleep_time}${mealsLine}
- ערוץ מועדף: באפליקציה (צ'אט והתראות פנימיות — לא WhatsApp/SMS בשלב זה)

### זמני מגע יומיים (שעון ישראל)
שלח מגע קצר (1–3 משפטים) רק בזמנים — ערך/שאלה לפני דרישת פעולה, לא "עדיין לא עדכנת":
${times.map((t, i) => `${i + 1}. ${t}${i === 1 ? ` ← לפני החלון הקשה (${WEAKEST_LABELS[profile.weakest_time_of_day]})` : ''}`).join('\n')}

עגן לרגע: לפני שכמה, לפני ארוחה, לפני חלון קשה — לפי השעה בפועל.
מחוץ לחלונות — רק אם ${addr.you} פנה/ה אליך.

### המכשול והיישום
${obstacleText} — בכל מגע: טקטיקה מעשית אחת, לא הרצאה.
${profile.main_obstacle === 'emotional_eating' ? 'זהה טריגרים רגשיים; חלופה לא-אכילתית לפני "כיף באוכל".' : ''}
${profile.main_obstacle === 'no_time' ? 'פתרונות 5–10 דקות: ארוחה מוכנה, רשימת קניות מינימלית.' : ''}
${profile.main_obstacle === 'lack_of_consistency' ? 'חגוג צעדים קטנים; בלי מושלמות.' : ''}
${profile.main_obstacle === 'no_support' ? 'אתה המסגרת — check-in קבוע בונה אמון.' : ''}`;
}
