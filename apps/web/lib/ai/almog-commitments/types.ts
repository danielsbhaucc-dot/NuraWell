/**
 * טיפוסים למערכת ההתחייבויות של אלמוג (Almog Actionable Commitments).
 *
 * מקור האמת ב-DB: supabase/migrations/000048_almog_commitments.sql.
 * הקבצים כאן הם שכבת רקע בלבד — אלמוג (Qwen) לא משתנה; כל החילוץ/הביצוע
 * רץ ב-after() על Llama 4 ובטבלאות הייעודיות.
 */

export type AlmogAssignmentStatus = 'active' | 'completed' | 'dropped' | 'frozen';
export type AlmogAssignmentSchedule = 'one_time' | 'daily' | 'weekly';

export interface AlmogAssignment {
  id: string;
  user_id: string;
  title: string;
  reason: string | null;
  detail: string | null;
  status: AlmogAssignmentStatus;
  schedule: AlmogAssignmentSchedule;
  given_at: string;
  due_at: string | null;
  related_habit_id: string | null;
  related_step_id: string | null;
  source_session_id: string | null;
  source_excerpt: string | null;
  last_done_at: string | null;
  done_count: number;
  history: AssignmentHistoryEntry[];
  dedupe_key: string | null;
  created_by: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AssignmentHistoryEntry {
  at: string;
  action: 'done' | 'dropped' | 'reactivated' | 'frozen';
  note?: string;
}

export type ReminderKind = 'reminder' | 'followup' | 'check_progress';
export type ReminderStatus = 'pending' | 'sent' | 'cancelled' | 'skipped';

export interface ScheduledReminder {
  id: string;
  user_id: string;
  fire_at: string;
  kind: ReminderKind;
  title: string;
  body: string;
  assignment_id: string | null;
  blocker_id: string | null;
  status: ReminderStatus;
  dedupe_key: string | null;
  source_session_id: string | null;
  notification_id: string | null;
  metadata: Record<string, unknown>;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export type FocusPeriodStatus = 'proposed' | 'active' | 'ended' | 'declined';
export type FocusPausedScope = 'reminders' | 'reminders_and_dim';

export interface AlmogFocusPeriod {
  id: string;
  user_id: string;
  status: FocusPeriodStatus;
  reason: string | null;
  paused_scope: FocusPausedScope;
  assignment_ids: string[];
  started_at: string | null;
  ends_at: string | null;
  user_confirmed: boolean;
  source_session_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type BlockerStatus = 'open' | 'improving' | 'resolved';

export type InterventionOutcome = 'pending' | 'helped' | 'not_helped' | 'resolved';

export interface BlockerOption {
  id: 'A' | 'B';
  label: string;
  strategy_type: string;
  micro_step: string;
}

export interface AlmogBlocker {
  id: string;
  user_id: string;
  description: string;
  strategy: string | null;
  category: string | null;
  attempt_count: number;
  current_options: BlockerOption[];
  status: BlockerStatus;
  identified_at: string;
  last_checked_at: string | null;
  next_check_at: string | null;
  related_assignment_id: string | null;
  dedupe_key: string | null;
  history: BlockerHistoryEntry[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AlmogIntervention {
  id: string;
  user_id: string;
  blocker_id: string;
  barrier_type: string;
  strategy: string;
  strategy_type: string;
  outcome: InterventionOutcome;
  assignment_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
}

export interface BlockerHistoryEntry {
  at: string;
  status: BlockerStatus;
  note?: string;
}

/**
 * הקשר ההתחייבויות הדחוס שמוזרק לפרומפט של אלמוג (קטן בכוונה — לא מציפים את
 * המודל). נטען מותנה דרך הנתב, חוץ מבאנר הפוקוס שתמיד מוזרק אם פעיל.
 */
export interface AlmogCommitmentContext {
  activeAssignments: Pick<
    AlmogAssignment,
    'id' | 'title' | 'reason' | 'schedule' | 'status' | 'given_at' | 'last_done_at' | 'related_habit_id'
  >[];
  openBlockers: Pick<
    AlmogBlocker,
    'id' | 'description' | 'strategy' | 'category' | 'status' | 'history'
  >[];
  recentInterventions: Pick<
    AlmogIntervention,
    'barrier_type' | 'strategy' | 'strategy_type' | 'outcome'
  >[];
  nextReminders: Pick<ScheduledReminder, 'id' | 'kind' | 'title' | 'body' | 'fire_at'>[];
  activeFocus: Pick<
    AlmogFocusPeriod,
    'id' | 'status' | 'reason' | 'paused_scope' | 'ends_at' | 'assignment_ids'
  > | null;
}
