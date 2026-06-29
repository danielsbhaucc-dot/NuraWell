export type ChallengeEnrollmentStatus = 'waiting' | 'active' | 'completed' | 'dropped';

export type ChallengeDemoScenario = 'waiting' | 'intro' | 'active' | 'wrap_up';

export type ChallengePhase =
  | 'none'
  | 'waiting'
  | 'intro'
  | 'eating_window_setup'
  | 'interview'
  | 'active'
  | 'wrap_up'
  | 'completed';

export type ChallengeScheduleType = 'daily' | 'per_meal' | 'morning' | 'evening' | 'once';

export type EatingWindowConfig = {
  start: string;
  end: string;
  last_meal_recommended: string;
  sleep_buffer_minutes: number;
  first_meal: string;
  last_meal: string;
};

export type ChallengeCampaign = {
  id: string;
  slug: string;
  title: string;
  duration_days: number;
  is_active: boolean;
  config: Record<string, unknown>;
};

export type ChallengeCompletionSummary = {
  total_success_events: number;
  total_task_completions: number;
  days_active: number;
  top_successes: Array<{ title: string; description: string | null }>;
  message: string;
  generated_at: string;
};

export type ChallengeEnrollment = {
  id: string;
  user_id: string;
  campaign_id: string;
  registered_at: string;
  challenge_start_date: string;
  challenge_end_date: string;
  status: ChallengeEnrollmentStatus;
  eating_window: EatingWindowConfig | null;
  intro_completed_at: string | null;
  interview_completed_at: string | null;
  wrap_up_seen_at?: string | null;
  completion_summary?: ChallengeCompletionSummary | null;
  is_demo: boolean;
  demo_scenario: ChallengeDemoScenario | null;
  demo_simulated_day: number | null;
  metadata: Record<string, unknown>;
  campaign?: ChallengeCampaign | null;
};

export type ChallengeTaskDefinition = {
  id: string;
  campaign_id: string;
  task_key: string;
  day_index: number;
  sort_order: number;
  title_he: string;
  description_he: string | null;
  schedule_type: ChallengeScheduleType;
  icon: string | null;
  celebration_key: string | null;
  is_active: boolean;
};

export type ChallengeTaskCompletion = {
  id: string;
  enrollment_id: string;
  task_definition_id: string;
  day_index: number;
  slot_key: string | null;
  completed_at: string;
};

export type ChallengeSuccessEvent = {
  id: string;
  event_type: string;
  title: string;
  description: string | null;
  detected_by: 'rule' | 'ai' | 'admin';
  occurred_at: string;
};

export type ChallengeStateResponse = {
  phase: ChallengePhase;
  enrollment: ChallengeEnrollment | null;
  current_day: number;
  days_total: number;
  countdown_to_start: { days: number; hours: number; minutes: number; seconds: number } | null;
  is_demo: boolean;
};
