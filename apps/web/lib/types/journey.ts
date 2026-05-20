// Journey Step Types — for the "המסע שלי" interactive lesson system

export interface JourneyStep {
  id: string;
  course_id: string | null;
  /** תחנה במסע (אופציונלי) */
  station_id?: string | null;
  journey_stations?: { id: string; title: string; sort_order: number } | null;
  title: string;
  description: string | null;
  step_number: number;
  is_published: boolean;

  // Video
  video_provider: 'heygen' | 'bunny' | 'youtube' | 'vimeo' | 'custom' | null;
  video_external_id: string | null;
  video_external_url: string | null;
  video_title: string | null;

  // Content
  summary_text: string | null;
  text_content: string | null;
  duration_minutes: number | null;

  // Structured data (JSONB in DB)
  quiz_questions: QuizQuestion[];
  game_items: GameItem[];
  commitment: CommitmentData | null;
  researches: Research[];
  tasks: JourneyTask[];
  habits: JourneyHabit[];

  // PDF / downloads
  pdf_url: string | null;
  pdf_name: string | null;

  created_at: string;
  updated_at: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

export interface GameItem {
  id: string;
  statement: string;
  is_true: boolean;
  explanation: string;
}

export interface CommitmentData {
  text: string;
  emoji: string;
  description: string;
}

export interface Research {
  id: string;
  title: string;
  authors: string;
  year: string;
  journal: string;
  finding: string;
  url: string | null;
}

/**
 * תזמון משימה — קובע איך המשתמש מסמן ביצוע ואיך אלמוג מתייחס:
 *  - one_time      = משימה חד-פעמית. accept/reject + execution_done יחיד (תאימות לאחור).
 *  - daily         = יומית. checkbox יומי שמתאפס בכל בוקר.
 *  - multi_daily   = X פעמים ביום. times_per_day קובע את מספר הסלוטים (2..6).
 *                    סלוטים גנריים: morning / noon / evening (2-3) או slot_1..slot_n (4+).
 *  - weekly        = שבועי. תיבת סימון אחת ביום שנקבע (weekly_day, 0=ראשון..6=שבת).
 *  - per_meal      = לפני כל ארוחה. סלוטים: meal_breakfast / meal_lunch / meal_dinner
 *                    (לפי profile.meal_schedule כשקיים).
 */
export type JourneyTaskSchedule =
  | 'one_time'
  | 'daily'
  | 'multi_daily'
  | 'weekly'
  | 'per_meal';

/** slot מזהה את הסלוט בתוך היום הספציפי לצורך טבלת journey_task_executions */
export type JourneyTaskSlot =
  | 'full_day'
  | 'morning'
  | 'noon'
  | 'evening'
  | 'meal_breakfast'
  | 'meal_lunch'
  | 'meal_dinner'
  | `slot_${number}`;

export interface JourneyTask {
  id: string;
  title: string;
  description: string | null;
  emoji: string;
  /** תזמון; אם חסר → 'one_time' (תאימות לאחור) */
  schedule?: JourneyTaskSchedule;
  /** רלוונטי ל-multi_daily (2..6) */
  times_per_day?: number | null;
  /** רלוונטי ל-weekly (0..6) */
  weekly_day?: number | null;
}

export interface JourneyHabit {
  id: string;
  title: string;
  description: string | null;
  emoji: string;
  frequency: 'daily' | 'weekly' | 'per_meal';
  /** יום בשבוע לבדיקות שבועיות — 0=ראשון … 6=שבת (אזור ירושלים) */
  weekly_day?: number | null;
}

export type JourneyTaskDecisionStatus = 'accepted' | 'rejected' | 'pending';

export interface JourneyTaskDecision {
  status: JourneyTaskDecisionStatus;
  decided_at: string | null;
  reason?: string | null;
  /** המשתמש סימן במסך הדיווח שביצע בפועל את המשימה (מפעיל גם דילוג על תזכורת workflow) */
  execution_done?: boolean;
}

// Progress tracking
export interface JourneyStepProgress {
  step_id: string;
  user_id: string;
  created_at?: string;
  updated_at?: string;
  video_watched: boolean;
  quiz_answers: Record<string, number>; // questionId -> selectedIndex
  quiz_score: number | null;
  game_answers: Record<string, boolean>; // itemId -> userAnswer
  game_score: number | null;
  commitment_accepted: boolean;
  tasks_completed: Record<string, boolean>;
  task_statuses: Record<string, JourneyTaskDecision>;
  habits_progress: Record<string, boolean[]>;
  is_completed: boolean;
  completed_at: string | null;
  last_section: StepSection;
}

export type StepSection = 'video' | 'quiz' | 'game' | 'commitment' | 'summary';

// For the journey list page
export interface JourneyStepWithProgress extends JourneyStep {
  progress: JourneyStepProgress | null;
}

/** Row של ביצוע משימה בלוח (journey_task_executions) */
export interface JourneyTaskExecution {
  id: string;
  user_id: string;
  step_id: string;
  task_id: string;
  /** YYYY-MM-DD בלוח ירושלים */
  date_key: string;
  slot: JourneyTaskSlot;
  completed_at: string;
  source: 'manual' | 'chat' | 'reminder';
  note?: string | null;
}
