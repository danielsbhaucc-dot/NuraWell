/**
 * 🎛️ Program Orchestrator — טיפוסי הליבה + פונקציית הערכת המצב.
 *
 * זהו הלב הדטרמיניסטי של ה-"Program Orchestrator": בהינתן אותות פעילות
 * (streak, חוסר פעילות, החמצת חלון, אות קושי) הוא מסווג את המשתמש לאחד משלושה
 * מצבים, וקובע איזו *הצעה יזומה* (proposal) ה-AI אמור לנסח עבורו.
 *
 * עיקרון: ההחלטה *מי במצב מה* היא דטרמיניסטית, זולה ויציבה (קוד). ה-LLM נכנס
 * רק כדי *לנסח* את ההצעה (ראה build-program-proposal.ts) — אותו עיקרון
 * "דטרמיניסטי קודם, LLM רק לחידוד" שמנחה את כל שכבת ה-AI כאן.
 */

import type { JourneyCompanionPhase } from '../../workflows/journey-companion';

/** שלושת המצבים של המשתמש בתוכנית. */
export type ProgramState = 'ready_to_advance' | 'maintaining' | 'struggling';

/** סוג ההצעה היזומה שנגזר מהמצב. */
export type ProgramProposalKind = 'level_up' | 'daily_kickoff' | 'pivot';

/** הצעד הבא המוצע (קיים בעיקר ב-level_up). */
export type ProgramProposalNextStep = {
  /** ניסוח אנושי וקצר של הצעד הבא, בקולו של אלמוג. */
  title: string;
  /** משפט הסבר קצר (אופציונלי). */
  detail?: string | null;
  /** journey_steps.id אם ההצעה קשורה לצעד פורמלי במסע. */
  next_step_id?: string | null;
  /** רמז להרגל המיקרו החדש (אופציונלי). */
  habit_hint?: string | null;
  /**
   * ב-pivot: היעד המקורי שאליו "מטפסים בחזרה" אחרי שהמיקרו-צעד יצליח.
   * משמש את daily_action_instances.original_title למסלול ההתקדמות.
   */
  restore_to?: string | null;
};

/**
 * ההצעה היזומה — מה שנשמר ב-profiles.pending_ai_proposal וה-Dumb UI מצייר.
 * כל השדות שה-UI צריך כדי לרנדר בלי "לחשוב" בעצמו.
 */
export type ProgramProposal = {
  /** מזהה ייחודי — ל-idempotency של תגובת המשתמש (accept/decline). */
  id: string;
  kind: ProgramProposalKind;
  state: ProgramState;
  /** כותרת קצרה לכרטיס ("מוכן לשלב הבא?"). */
  headline: string;
  /** גוף ההודעה בקולו של אלמוג (מיוצר ע"י LLM). */
  body: string;
  /** הצעד הבא המוצע — null כשאין (kickoff/pivot). */
  next_step: ProgramProposalNextStep | null;
  cta_accept_label: string;
  cta_decline_label: string;
  /**
   * true → ה-UI *נועל* את מסך הבית ומציג "Level Up" עד שהמשתמש מגיב.
   * false → כרטיס שאפשר לבטל (kickoff/pivot).
   */
  requires_buyin: boolean;
  created_at: string;
  model: string | null;
};

/**
 * אותות הפעילות שמוזנים למנוע ההערכה. כולם נגזרים בקוד מ-Supabase
 * (journey_task_executions / journey_progress / ai_context), בלי LLM.
 */
export type ProgramActivitySignals = {
  /** ימים שלמים מאז תגובה אמיתית אחרונה (צ'אט/ביצוע/עדכון פרוגרס). */
  daysSinceLastActive: number;
  /** רצף ימים רצופים (לוח ירושלים) שבהם בוצעה לפחות משימה אחת. */
  consecutiveCompletedDays: number;
  /** היו משימות פתוחות בחלון והמשתמש לא סגר אף אחת. */
  missedActiveWindow: boolean;
  /** אות קושי מפורש: relapse בצ'אט / חסם טרי / זמינות נמוכה. */
  reportedDifficulty: boolean;
  /** יש משימות פתוחות להיום. */
  hasOpenTasksToday: boolean;
  /** יש צעד הבא זמין להתקדם אליו במסע. */
  hasNextStepAvailable: boolean;
  /** שלב הליווי במסע (אם ידוע). */
  journeyPhase: JourneyCompanionPhase | null;
};

/** תוצאת ההערכה — מצב + ההצעה הנגזרת + reason קצר ללוג/לפרומפט. */
export type ProgramStateDecision = {
  state: ProgramState;
  reason: string;
  proposalKind: ProgramProposalKind;
  requiresBuyin: boolean;
};

const READY_STREAK_DAYS = 3;
const STRUGGLING_INACTIVE_DAYS = 2;

/** רצף הימים שנדרש כדי להיחשב "מוכן להתקדם". */
export function readyStreakDays(): number {
  return READY_STREAK_DAYS;
}

/** ימי חוסר-פעילות שמעבירים אוטומטית ל-struggling. */
export function strugglingInactiveDays(): number {
  return STRUGGLING_INACTIVE_DAYS;
}

/**
 * 🧠 מנוע ההערכה — הלב של ה-Orchestrator.
 *
 * סדר ההכרעה חשוב ומכוון:
 *   1. STRUGGLING מנצח תמיד. ברגע שיש אות קושי / נשירה / החמצה — אנחנו לא
 *      "מקדמים" אף אחד. זה גם עיקרון בטיחות: לא דוחפים שלב חדש למי שמתקשה.
 *   2. READY_TO_ADVANCE — רק כשיש עקביות מוכחת (streak) *וגם* יש לאן להתקדם.
 *   3. MAINTAINING — ברירת המחדל: התקדמות תקינה בתוך השלב הנוכחי.
 *
 * הפונקציה טהורה (pure) — קלה לבדיקה ביחידה.
 */
export function evaluateProgramState(
  signals: ProgramActivitySignals
): ProgramStateDecision {
  const readyStreak = readyStreakDays();
  const inactiveCap = strugglingInactiveDays();

  // (1) STRUGGLING — gatekeeper. מנצח על כל השאר.
  if (signals.reportedDifficulty) {
    return {
      state: 'struggling',
      reason: 'אות קושי מפורש (נפילה/חסם טרי)',
      proposalKind: 'pivot',
      requiresBuyin: false,
    };
  }
  if (Number.isFinite(signals.daysSinceLastActive) && signals.daysSinceLastActive >= inactiveCap) {
    return {
      state: 'struggling',
      reason: `${signals.daysSinceLastActive} ימים ללא פעילות`,
      proposalKind: 'pivot',
      requiresBuyin: false,
    };
  }
  if (signals.missedActiveWindow) {
    return {
      state: 'struggling',
      reason: 'החמצת חלון פעיל (משימות פתוחות, אפס ביצוע)',
      proposalKind: 'pivot',
      requiresBuyin: false,
    };
  }

  // (2) READY_TO_ADVANCE — עקביות מוכחת + יש צעד הבא.
  if (signals.consecutiveCompletedDays >= readyStreak && signals.hasNextStepAvailable) {
    return {
      state: 'ready_to_advance',
      reason: `רצף ${signals.consecutiveCompletedDays} ימים — בשל לצעד הבא`,
      proposalKind: 'level_up',
      requiresBuyin: true,
    };
  }

  // (3) MAINTAINING — ברירת מחדל.
  return {
    state: 'maintaining',
    reason: 'מתקדם תקין בתוך השלב הנוכחי',
    proposalKind: 'daily_kickoff',
    requiresBuyin: false,
  };
}
