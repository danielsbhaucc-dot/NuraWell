export const MAIN_GOALS = ['weight_loss', 'healthy_lifestyle', 'both'] as const;
export type MainGoal = (typeof MAIN_GOALS)[number];

export const WEAKEST_TIMES = ['morning', 'noon', 'afternoon', 'evening_night'] as const;
export type WeakestTimeOfDay = (typeof WEAKEST_TIMES)[number];

export const MAIN_OBSTACLES = [
  'no_time',
  'emotional_eating',
  'lack_of_consistency',
  'no_support',
  'other',
] as const;
export type MainObstacle = (typeof MAIN_OBSTACLES)[number];

export const PREFERRED_CHANNELS = ['whatsapp', 'in_app', 'phone'] as const;
export type PreferredChannel = (typeof PREFERRED_CHANNELS)[number];

export const GENDERS = ['male', 'female'] as const;
export type OnboardingGender = (typeof GENDERS)[number];

export type OnboardingProfileInput = {
  full_name: string;
  gender: OnboardingGender;
  main_goal: MainGoal;
  current_weight: number;
  target_weight: number;
  height?: number | null;
  weakest_time_of_day: WeakestTimeOfDay;
  main_obstacle: MainObstacle;
  main_obstacle_detail?: string | null;
  wake_up_time: string;
  sleep_time: string;
  preferred_channel: PreferredChannel;
  email: string;
  password: string;
};

export type OnboardingProfileRow = {
  id: string;
  full_name: string | null;
  gender: string | null;
  main_goal: MainGoal | null;
  current_weight_kg: number | null;
  goal_weight_kg: number | null;
  height_cm: number | null;
  weakest_time_of_day: WeakestTimeOfDay | null;
  main_obstacle: MainObstacle | null;
  main_obstacle_detail: string | null;
  wake_up_time: string | null;
  sleep_time: string | null;
  preferred_channel: PreferredChannel | null;
  ai_check_in_times: string[] | null;
  ai_system_prompt: string | null;
  onboarding_completed: boolean | null;
};
