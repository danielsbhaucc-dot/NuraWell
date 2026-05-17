import type { MainGoal, MainObstacle, OnboardingGender, WeakestTimeOfDay } from './types';
import type { MealScheduleEntry } from './meal-schedule';

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

export function formatOnboardingSummary(data: OnboardingSummaryData): { label: string; value: string }[] {
  const meals =
    data.mealCount && data.mealCount > 0 ?
      data.mealTimes
        .slice(0, data.mealCount)
        .filter(Boolean)
        .join(', ') || '—'
    : 'ללא שעות ארוחה (לוח כללי)';

  const rows: { label: string; value: string }[] = [
    { label: 'שם', value: data.fullName.trim() || '—' },
    { label: 'מין', value: data.gender ? GENDER[data.gender] : '—' },
    { label: 'מטרה', value: data.mainGoal ? GOAL[data.mainGoal] : '—' },
    { label: 'משקל נוכחי', value: data.currentWeight ? `${data.currentWeight} ק״ג` : '—' },
    { label: 'משקל יעד', value: data.targetWeight ? `${data.targetWeight} ק״ג` : '—' },
  ];
  if (data.height.trim()) rows.push({ label: 'גובה', value: `${data.height} ס״מ` });
  rows.push(
    { label: 'חלון קשה', value: data.weakest ? WEAKEST[data.weakest] : '—' },
    {
      label: 'מכשול',
      value:
        data.obstacle === 'other' && data.obstacleDetail.trim() ?
          data.obstacleDetail.trim()
        : data.obstacle ?
          OBSTACLE[data.obstacle]
        : '—',
    },
    { label: 'ארוחות', value: meals },
    { label: 'השכמה / שינה', value: `${data.wakeUp} · ${data.sleep}` },
    { label: 'אימייל', value: data.email.trim() || '—' }
  );
  return rows;
}
