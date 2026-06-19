/**
 * טיפוסים למערכת ההתחייבויות של אלמוג (Almog Actionable Commitments).
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
  parent_assignment_id: string | null;
  relation: AssignmentRelation;
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

export type AssignmentRelation = 'standalone' | 'replaces' | 'eases' | 'supports';

export interface BlockerOption {
  id: 'A' | 'B';
  label: string;
  strategy_type: string;
  micro_step: string;
  /** יחס הצעד למשימה המקורית (כשהחסם קשור למשימה) */
  relation: AssignmentRelation;
}

/**
 * הצעת "Pivot" יחידה במודל "המאמן הבלתי-נראה" — צעד אחד חסר-חיכוך (B=MAP).
 * `strategy_type` נשאר נסתר מהמשתמש (לוגיקה/זיכרון בלבד) — ה-UI מציג רק
 * `label` + `micro_step` בקולו האנושי של אלמוג.
 */
export interface BlockerProposal {
  label: string;
  /** סיווג פנימי — לא מוצג למשתמש */
  strategy_type: string;
  micro_step: string;
  relation: AssignmentRelation;
}

/**
 * מצב ה"מאמן" השמור על החסם (ב-`almog_blockers.metadata.coach`). זהו הפלט
 * המובנה של ה-LLM: הודעת אמפתיה אחת + הצעה אחת. נשמר כדי לשרוד רענון/realtime
 * ולמנוע קריאת LLM חוזרת.
 */
export interface BlockerCoachState {
  empathy: string;
  proposal: BlockerProposal;
  /** מתי נוצר (לתפוגה/רענון עדין) */
  generated_at: string;
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
  /** מסלול recovery פעיל — משימה מקורית מוקפאת, מעקב על צעד מקל */
  recoveryState: import('./recovery-state').UserRecoveryState | null;
  /** שאילתות recovery / צעדים מותאמים שלא נענו */
  unansweredRecovery: import('./recovery-response-detection').UnansweredRecoverySignal[];
  activeStruggles: import('./struggle-detection').StruggleSignal[];
}
