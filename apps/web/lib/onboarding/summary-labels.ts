import type { MainGoal, MainObstacle, OnboardingGender, WeakestTimeOfDay } from './types';
import type { MealScheduleEntry } from './meal-schedule';
import { isValidHeightCm, isValidWeightKg, parseMetric } from './body-metrics';
import { formatWeightRangeKg } from './format-weight-range';

const GOAL: Record<MainGoal, string> = {
  weight_loss: 'ירידה במשקל',
  healthy_lifestyle: 'אורח חיים בריא',
  both: 'גם וגם',
};

const WEAKEST: Record<WeakestTimeOfDay, string> = {
  morning: 'בוקר',
  noon: 'צהריים',
  afternoon: 'אחר הצהריים',
  evening_night: 'ערב/לילה',
};

const OBSTACLE: Record<MainObstacle, string> = {
  no_time: 'חוסר זמן',
  emotional_eating: 'אכילה רגשית',
  lack_of_consistency: 'קושי להתמיד',
  no_support: 'חוסר תמיכה',
  other: 'אחר',
};

const GENDER: Record<OnboardingGender, string> = {
  male: 'גבר',
  female: 'אישה',
};

export type OnboardingSummaryData = {
  fullName: string;
  gender: OnboardingGender | '';
  mainGoal: MainGoal | '';
  currentWeight: string;
  targetWeight: string;
  height: string;
  weakest: WeakestTimeOfDay | '';
  obstacle: MainObstacle | '';
  obstacleDetail: string;
  mealCount: number | null;
  mealTimes: string[];
  wakeUp: string;
  sleep: string;
  email: string;
};

export type OnboardingSummaryRow = { label: string; value: string; editStep: number };

export function formatOnboardingSummary(data: OnboardingSummaryData): OnboardingSummaryRow[] {
  const meals =
    data.mealCount && data.mealCount > 0 ?
      data.mealTimes
        .slice(0, data.mealCount)
        .filter(Boolean)
        .join(', ') || '—'
    : 'ללא שעות ארוחה (לוח כללי)';

  const cwParsed = parseMetric(data.currentWeight);
  const twParsed = parseMetric(data.targetWeight);
  const cw = cwParsed !== null && isValidWeightKg(cwParsed) ? cwParsed : null;
  const tw = twParsed !== null && isValidWeightKg(twParsed) ? twParsed : null;
  const heightParsed = parseMetric(data.height);
  const heightCm =
    data.height.trim() && heightParsed !== null && isValidHeightCm(heightParsed) ?
      heightParsed
    : null;

  const rows: OnboardingSummaryRow[] = [
    { label: 'שם', value: data.fullName.trim() || '—', editStep: 1 },
    { label: 'מין', value: data.gender ? GENDER[data.gender] : '—', editStep: 2 },
    { label: 'מטרה', value: data.mainGoal ? GOAL[data.mainGoal] : '—', editStep: 2 },
    {
      label: 'משקל (נוכחי → יעד)',
      value: formatWeightRangeKg(cw, tw),
      editStep: 2,
    },
  ];
  if (heightCm !== null) {
    rows.push({ label: 'גובה', value: `${heightCm} ס״מ`, editStep: 2 });
  }
  rows.push(
    { label: 'חלון קשה', value: data.weakest ? WEAKEST[data.weakest] : '—', editStep: 3 },
    {
      label: 'מכשול',
      value:
        data.obstacle === 'other' && data.obstacleDetail.trim() ?
          data.obstacleDetail.trim()
        : data.obstacle ?
          OBSTACLE[data.obstacle]
        : '—',
      editStep: 3,
    },
    { label: 'ארוחות', value: meals, editStep: 4 },
    { label: 'השכמה / שינה', value: `${data.wakeUp} · ${data.sleep}`, editStep: 4 },
    { label: 'אימייל', value: data.email.trim() || '—', editStep: 6 }
  );
  return rows;
}
