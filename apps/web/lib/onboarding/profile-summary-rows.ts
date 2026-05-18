import type { OnboardingGender, MainGoal, MainObstacle, WeakestTimeOfDay } from './types';

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

export type ProfileSummarySource = {
  full_name: string | null;
  gender: OnboardingGender | null;
  main_goal: MainGoal | null;
  current_weight_kg: number | null;
  goal_weight_kg: number | null;
  weakest_time_of_day: WeakestTimeOfDay | null;
  main_obstacle: MainObstacle | null;
  main_obstacle_detail?: string | null;
  wake_up_time: string | null;
  sleep_time: string | null;
  meal_schedule: Array<{ time: string; label: string }> | null;
};

export function buildProfileSummaryRows(profile: ProfileSummarySource): { label: string; value: string }[] {
  const meals =
    profile.meal_schedule?.length ?
      profile.meal_schedule.map((m) => `${m.time} (${m.label})`).join(', ')
    : 'לפי לוח כללי';

  return [
    { label: 'שם', value: profile.full_name?.trim() || '—' },
    { label: 'מין', value: profile.gender ? GENDER[profile.gender] : '—' },
    { label: 'מטרה', value: profile.main_goal ? GOAL[profile.main_goal] : '—' },
    {
      label: 'משקל',
      value:
        profile.current_weight_kg && profile.goal_weight_kg ?
          `${profile.current_weight_kg} → ${profile.goal_weight_kg} ק״ג`
        : '—',
    },
    {
      label: 'חלון קשה',
      value: profile.weakest_time_of_day ? WEAKEST[profile.weakest_time_of_day] : '—',
    },
    {
      label: 'מכשול',
      value:
        profile.main_obstacle === 'other' && profile.main_obstacle_detail?.trim() ?
          profile.main_obstacle_detail.trim()
        : profile.main_obstacle ?
          OBSTACLE[profile.main_obstacle]
        : '—',
    },
    { label: 'ארוחות', value: meals },
    {
      label: 'שינה',
      value: `${profile.wake_up_time ?? '—'} · ${profile.sleep_time ?? '—'}`,
    },
  ];
}

export function firstNameFromFull(fullName: string | null): string {
  return fullName?.trim().split(/\s+/)[0] || '';
}
