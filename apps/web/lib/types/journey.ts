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

  /** פלייליסט מוזיקת רקע שינוגן לאורך הצעד (NULL = ללא) */
  audio_playlist_id: string | null;

  /** קרדיט לתמונת רקע (JSON) */
  cover_credit?: string | null;

  created_at: string;
  updated_at: string;
}

/** Cached ElevenLabs TTS for a quiz question or game statement (stored in JSONB). */
export interface QuestionTtsMeta {
  /** Hash of normalized text + voice + model — skip regen when unchanged. */
  content_hash: string;
  object_key: string;
  url: string;
  media_asset_id?: string;
  voice_id: string;
  model_id: string;
  size_bytes?: number;
  status: 'ready' | 'error';
  error?: string;
  generated_at?: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  /** Pre-generated question audio (R2 + media library). */
  tts?: QuestionTtsMeta | null;
}

export interface GameItem {
  id: string;
  statement: string;
  is_true: boolean;
  explanation: string;
  /** Pre-generated statement audio (R2 + media library). */
  tts?: QuestionTtsMeta | null;
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
  /** טקסט מקור שהודבק ידנית או חולץ מהקישור לפני סריקת AI */
  source_text?: string;
  /** סיכום מדעי קצר בעברית שאלמוג יכול להשתמש בו */
  ai_summary?: string;
  /** ממצאים עיקריים שנשלפו מהמחקר */
  key_findings?: string[];
  /** איך המחקר מתחבר לשיעור/להרגל בנורהוול */
  practical_takeaway?: string;
  /** סייגים ומתודולוגיה שחשוב לא להפריז מעבר אליהם */
  limitations?: string;
  evidence_level?: 'low' | 'moderate' | 'high' | 'unknown';
  /** קישור למסמך ב-almog_knowledge לאחר סנכרון ל-RAG */
  rag_doc_id?: string;
  last_scanned_at?: string;
  scan_status?: 'idle' | 'scanning' | 'ready' | 'error';
  scan_error?: string;
}

/**
 * תזמון משימה — קובע איך המשתמש מסמן ביצוע ואיך אלמוג מתייחס:
 *  - one_time      = משימה חד-פעמית. accept/reject + execution_done יחיד (תאימות לאחור).
 *  - daily         = יומית. checkbox יומי שמתאפס בכל בוקר.
 *  - multi_daily   = X פעמים ביום. times_per_day קובע את מספר הסלוטים (2..6).
 *                    סלוטים גנריים: morning / noon / evening (2-3) או slot_1..slot_n (4+).
 *  - weekly        = שבועי. תיבת סימון אחת ביום שנקבע (weekly_day, 0=ראשון..6=שבת).
 *  - monthly       = חודשי. תיבת סימון ביום בחודש שנקבע (monthly_day, 1..31).
 *  - per_meal      = משימה הקשורה לארוחה. `meal_timing` קובע אם זה לפני / בזמן / אחרי,
 *                    ו-`meal_target` קובע אם מספר הארוחות מוגדר ידנית (`fixed`) או
 *                    נגזר מ-`profile.meal_count` (`all`). סלוטים: meal_breakfast /
 *                    meal_lunch / meal_dinner (וכן meal_snack_morning / meal_snack_evening
 *                    כשמשתמש הגדיר 4-5 ארוחות).
 */
export type JourneyTaskSchedule =
  | 'one_time'
  | 'daily'
  | 'multi_daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'custom'
  | 'per_meal';

/**
 * האם המשימה מבוצעת לפני או אחרי הארוחה.
 *  - before = "לפני כל ארוחה"
 *  - during = "בזמן הארוחה"
 *  - after  = "אחרי כל ארוחה"
 *  ברירת מחדל כשחסר: 'before' (תאימות לאחור לקוד שדידע רק per_meal).
 */
export type MealTiming = 'before' | 'during' | 'after';

/**
 * איך לקבוע כמה סלוטי-ארוחה יש במשימת per_meal:
 *  - fixed = לפי `times_per_day` שהוגדר בעורך (1..3) — כמו עד היום.
 *  - all   = "כל הארוחות של המשתמש" — נגזר דינמית מ-`profile.meal_count`
 *            ו-`profile.meal_schedule`. אם למשתמש 4 ארוחות, המשימה תקבל 4 סלוטים.
 */
export type MealTarget = 'fixed' | 'all';

/** slot מזהה את הסלוט בתוך היום הספציפי לצורך טבלת journey_task_executions */
export type JourneyTaskSlot =
  | 'full_day'
  | 'morning'
  | 'noon'
  | 'evening'
  | 'meal_snack_morning'
  | 'meal_breakfast'
  | 'meal_lunch'
  | 'meal_dinner'
  | 'meal_snack_evening'
  | `slot_${number}`;

export type TaskDifficultyFeedback = 'too_easy' | 'ok' | 'too_hard';

export type TaskLevelFeedbackAction =
  | TaskDifficultyFeedback
  | 'accept_level_up'
  | 'decline_level_up'
  | 'downgrade';

export interface JourneyTaskDifficultyLevel {
  id: string;
  label: string;
  description: string;
  emoji?: string;
  order: number;
  is_recommended?: boolean;
  is_minimum_viable?: boolean;
  metric?: {
    kind:
      | 'quantity'
      | 'time_before_event'
      | 'time_after_event'
      | 'time_of_day'
      | 'frequency'
      | 'duration'
      | 'custom';
    value?: number | string | null;
    unit?: 'cups' | 'minutes' | 'hours' | 'times' | 'days' | 'custom';
    direction?: 'higher_is_harder' | 'lower_is_harder' | 'custom';
  };
}

export interface JourneyTaskLevelingConfig {
  levels: JourneyTaskDifficultyLevel[];
  start_level_id: string | null;
  recommended_level_id: string | null;
  level_up_after_success_days: number;
  allow_user_downgrade: boolean;
  allow_user_upgrade: boolean;
  ai_rationale?: string | null;
}

/** state פר משתמש לרמת קושי של משימה (נשמר ב-journey_progress.task_level_meta) */
export interface JourneyTaskLevelMeta {
  current_level_id: string;
  recommended_level_id: string | null;
  started_level_id: string | null;
  current_level_started_at: string;
  last_feedback: TaskDifficultyFeedback | null;
  last_feedback_at: string | null;
  success_streak_current_level: number;
  success_days_current_level: number;
  best_level_id: string | null;
  reached_recommended_at: string | null;
  recommended_streak_current: number;
  recommended_streak_best: number;
  level_up_suggested_at: string | null;
  level_up_declined_at: string | null;
}

export interface JourneyTask {
  id: string;
  title: string;
  description: string | null;
  emoji: string;
  /** תזמון; אם חסר → 'one_time' (תאימות לאחור) */
  schedule?: JourneyTaskSchedule;
  /** רלוונטי ל-multi_daily (2..6) ול-per_meal (1..3 כשfixed) */
  times_per_day?: number | null;
  /** רלוונטי ל-weekly (0..6) */
  weekly_day?: number | null;
  /** רלוונטי ל-monthly/quarterly/semi_annual (1..31) */
  monthly_day?: number | null;
  /** רלוונטי ל-custom — כל כמה ימים (2..365) */
  interval_days?: number | null;
  /** רלוונטי ל-per_meal — דקות לפני/אחרי/בזמן הארוחה (שלילי=לפני, 0=בזמן, חיובי=אחרי) */
  meal_offset_minutes?: number | null;
  /** רלוונטי ל-per_meal; ברירת מחדל 'before' לתאימות לאחור */
  meal_timing?: MealTiming | null;
  /** רלוונטי ל-per_meal; ברירת מחדל 'fixed' לתאימות לאחור */
  meal_target?: MealTarget | null;
  /** סולם רמות קושי הדרגתי — אופציונלי */
  leveling?: JourneyTaskLevelingConfig | null;
}

export interface JourneyHabit {
  id: string;
  title: string;
  description: string | null;
  emoji: string;
  frequency: 'daily' | 'weekly' | 'per_meal';
  /** יום בשבוע לבדיקות שבועיות — 0=ראשון … 6=שבת (אזור ירושלים) */
  weekly_day?: number | null;
  /** ברירת מחדל 'before' — לפני/אחרי כל ארוחה (תקף ל-per_meal). */
  meal_timing?: MealTiming | null;
  /** ברירת מחדל 'fixed'. אם 'all' → נגזר מ-profile.meal_count. */
  meal_target?: MealTarget | null;
  /**
   * משך יעד ההרגל בימים — אחרי כמה ימים רצופים של ביצוע ההרגל ייחשב "הושג".
   * אם לא מוגדר ברירת מחדל: 14 ימים (שבועיים). הדאשבורד מאפשר לערוך פר-משתמש.
   */
  target_days?: number | null;
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
  /** פעולת-משתמש אמיתית אחרונה (migration 000047) — מקור האמת ל-dormancy. */
  last_engaged_at?: string | null;
  video_watched: boolean;
  quiz_answers: Record<string, number>; // questionId -> selectedIndex
  quiz_score: number | null;
  game_answers: Record<string, boolean>; // itemId -> userAnswer
  game_score: number | null;
  commitment_accepted: boolean;
  tasks_completed: Record<string, boolean>;
  task_statuses: Record<string, JourneyTaskDecision>;
  habits_progress: Record<string, boolean[]>;
  /** meta פר משתמש לרמות קושי של משימות (taskId → JourneyTaskLevelMeta) */
  task_level_meta?: Record<string, JourneyTaskLevelMeta>;
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
  outcome?: 'completed' | 'attempt_failed' | 'partial' | 'skipped' | null;
}
