import { z } from 'zod';

export const habitCheckpointSlotSchema = z.enum(['morning', 'midday', 'evening']);

export type HabitCheckpointSlot = z.infer<typeof habitCheckpointSlotSchema>;

const habitItemSchema = z.object({
  id: z.string().max(120),
  title: z.string().max(500),
  frequency: z.enum(['daily', 'weekly', 'per_meal']),
});

const pendingTaskSchema = z.object({
  id: z.string().max(120),
  title: z.string().max(500),
  stepTitle: z.string().max(500).nullable().optional(),
  /** "יומי" / "3 פעמים ביום" / "לפני כל ארוחה" — לצורך הקשר אנושי בפרומפט. */
  scheduleLabel: z.string().max(120).optional(),
  /** שמות עבריים של הסלוטים שעוד פתוחים היום (לדוגמה ["ערב"]). */
  pendingSlotLabels: z.array(z.string().max(60)).max(8).optional(),
});

const completedItemSchema = z.object({
  id: z.string().max(120),
  title: z.string().max(500),
});

export const habitCheckpointNotifyModeSchema = z.enum(['remind', 'reinforce']);

export const habitCheckpointReinforceKindSchema = z.enum(['completion', 'presence']);

/**
 * State machine רב-יומי של דורמנסי — נקבע ב-cron מתוך תגובה אמיתית אחרונה
 * (צ'אט משתמש או ביצוע משימה), לא מתוך פתיחת אפליקציה.
 *  0 = Active     — פעילות אמיתית ב-24h האחרונות
 *  1 = Slipping   — 1–2 ימים שקטים
 *  2 = Dormant    — 3–6 ימים שקטים
 *  3 = Ghosted    — 7+ ימים שקטים (קיבל back-off של שבוע ב-cron)
 */
export const habitCheckpointNudgeLevelSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

export type HabitCheckpointNudgeLevel = z.infer<typeof habitCheckpointNudgeLevelSchema>;

/** סטטוס ביצוע כפי שמחושב מ-Supabase בלבד (SSOT). */
export const habitCheckpointCompletionStatusSchema = z.enum(['none', 'partial', 'full']);

export type HabitCheckpointCompletionStatus = z.infer<
  typeof habitCheckpointCompletionStatusSchema
>;

/**
 * שלב cadence — קובע כמה הודעות ביום וכמה מהן אמפתיות:
 *   active            — 0–2 ימים: 3/יום (בוקר + צהריים + ערב)
 *   dormant_early     — 3–7 ימים: 2/יום (בוקר + ערב)
 *   withdrawing       — 8 ימים: 1/יום (רק בוקר, אמפתי "אני כאן")
 *   extended_absence  — 9–13 ימים: 1/יום (רק צהריים, נוכחות שקטה)
 *   ghosted           — 14+ ימים: 1/שבוע (cooldown של 7 ימים)
 */
export const habitCheckpointCadenceStageSchema = z.enum([
  'active',
  'dormant_early',
  'withdrawing',
  'extended_absence',
  'ghosted',
]);

export type HabitCheckpointCadenceStage = z.infer<
  typeof habitCheckpointCadenceStageSchema
>;

/**
 * רמת דחיפות רגשית — מודולציית טון מעל ה-cadence (לפי "הנחיה 1" של Claude).
 * מחושבת דטרמיניסטית ב-`deriveUrgencyLevel` בצד ה-cron, ועוברת ל-LLM
 * כ-style hint יחד עם system prompt של אלמוג.
 *   gentle          — יום ראשון, חם ומעודד
 *   friendly_nudge  — יום 1, שובב ועדין
 *   concerned       — 2 ימים, מודאג קצת בלי דרמה
 *   worried         — 3-6 ימים, מתגעגע אבל מקבל
 *   check_in        — 7+, רגוע ונוכח כמו חבר ישן
 */
export const habitCheckpointUrgencyLevelSchema = z.enum([
  'gentle',
  'friendly_nudge',
  'concerned',
  'worried',
  'check_in',
]);

export type HabitCheckpointUrgencyLevel = z.infer<
  typeof habitCheckpointUrgencyLevelSchema
>;

/**
 * מהלך re-engagement (churn) — שכבת אסטרטגיית תוכן מעל ה-cadence.
 * נקבע ב-cron מ-`computeReengagementMove` ומועבר ל-LLM כדי לגבור על
 * ה-behavioralRule הרגיל. ראה docs/CHURN_REENGAGEMENT_SPEC.md.
 * חייב להישאר זהה ל-`ReengagementMove` ב-`lib/churn/reengagement-moves.ts` (נבדק ב-tests).
 */
export const reengagementMoveSchema = z.enum([
  'none',
  'open_door',
  'mini_task',
  'fresh_start',
  'identity',
  'withdrawing',
  'quiet_presence',
  'breakup',
  'welcome_back',
  'passive_soft',
  'passive_value',
  'passive_trigger',
]);

export type ReengagementMovePayload = z.infer<typeof reengagementMoveSchema>;

/** מצב מעורבות persisted (analytics). */
export const engagementStatusSchema = z.enum([
  'active',
  'slipping',
  'at_risk',
  'dormant',
  'churned',
]);

/** קונטקסט זהות מ-onboarding ל-Identity Reconnection (יום 7). */
export const identityContextSchema = z.object({
  mainGoal: z.string().max(120).nullable(),
  mainObstacle: z.string().max(120).nullable(),
  mainObstacleDetail: z.string().max(2000).nullable(),
  streakDays: z.number().int().min(0).max(100000).nullable(),
  userWords: z.string().max(4000).nullable().optional(),
  stepTitle: z.string().max(500).nullable().optional(),
});

/**
 * Payload לטריגר Workflow של habit checkpoint.
 *
 * remind — יש הרגל/משימה שלא סומנו בוצעו ב-DB.
 * reinforce — חיזוק חברי: completion (בוצע ב-DB) או presence (שיחה היום, בלי תזכורת).
 *
 * שדות nudgeLevel / daysSinceLastActive / completionStatus נחושבים ב-cron route
 * (לפני טריגר Workflow) כדי שה-LLM יקבל קונטקסט התנהגותי מלא — בלי לחזור ל-DB
 * מתוך ה-Worker.
 */
export const almogHabitCheckpointPayloadSchema = z
  .object({
    userId: z.string().uuid(),
    slot: habitCheckpointSlotSchema,
    /** YYYY-MM-DD — לוח שנה בירושלים (למניעת כפילויות) */
    checkpointDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notifyMode: habitCheckpointNotifyModeSchema.default('remind'),
    reinforceKind: habitCheckpointReinforceKindSchema.optional(),
    habits: z.array(habitItemSchema).max(200).default([]),
    pendingTasks: z.array(pendingTaskSchema).max(200).default([]),
    completedTodayHabits: z.array(completedItemSchema).max(50).default([]),
    completedTodayTasks: z.array(completedItemSchema).max(50).default([]),
    stepTitle: z.string().max(500).nullable().optional(),
    stationTitle: z.string().max(500).nullable().optional(),

    /** State machine — נקבע ב-cron, מועבר אטומית ל-Worker וה-LLM. */
    nudgeLevel: habitCheckpointNudgeLevelSchema.default(0),
    /** מספר ימים שלמים מאז תגובה אמיתית אחרונה. ערך 0 = ענה/ביצע היום. */
    daysSinceLastActive: z.number().int().min(0).max(3650).default(0),
    /** סטטוס ביצוע כפי שמחושב מ-DB (SSOT) — לא מהמלל שהמשתמש שלח. */
    completionStatus: habitCheckpointCompletionStatusSchema.default('none'),
    /** שלב cadence — קובע תדירות והאמפתיות של ההודעה. */
    cadenceStage: habitCheckpointCadenceStageSchema.default('active'),
    /**
     * רמת דחיפות רגשית (5 רמות) — מודולציית טון לפי המסמך המקורי.
     * מחושבת מ-`daysSinceLastActive` ו-`slot` ב-cron.
     */
    urgencyLevel: habitCheckpointUrgencyLevelSchema.default('gentle'),
    /** סה"כ התראות שאי-פעם נשלחו למשתמש (`profiles.notification_count`). */
    notificationCount: z.number().int().min(0).max(100000).default(0),
    /** שעות מאז שהמשתמש פעיל לאחרונה (כתב בצ'אט/סימן משימה). undefined כשאין. */
    hoursSinceLastResponse: z.number().int().min(0).max(100000).optional(),
    /** הצעת העלאת/הורדת רמת קושי למשימה (אופציונלי) */
    taskLevelTune: z
      .object({
        taskId: z.string().max(120),
        taskTitle: z.string().max(500),
        currentLevelLabel: z.string().max(500),
        nextLevelLabel: z.string().max(500).nullable().optional(),
        kind: z.enum(['level_up', 'downgrade']),
        reason: z.string().max(2000),
        successStreakDays: z.number().int().min(0).max(365),
      })
      .optional(),

    /**
     * 🔄 שכבת churn / re-engagement (אופציונלי — ברירת מחדל 'none' לתאימות
     * לאחור). נקבעים ב-cron כשה-feature flag דולק.
     */
    reengagementMove: reengagementMoveSchema.optional(),
    identityContext: identityContextSchema.optional(),
    engagementStatus: engagementStatusSchema.optional(),
    /** מטא ל-Exit Survey — מצורף רק כש-reengagementMove === 'breakup'. */
    breakupSurvey: z.boolean().optional(),
    /**
     * סיבת העזיבה האחרונה מ-Exit Survey (churn_feedback.reason) — מצורף
     * למהלך welcome_back כדי שאלמוג "יזכור" למה היה קשה ויחבר אליו ברגישות.
     */
    churnReason: z
      .enum(['too_busy', 'too_hard', 'no_results', 'personal', 'other'])
      .optional(),
  })
  .refine(
    (v) => {
      if (v.notifyMode === 'reinforce') {
        if (v.reinforceKind === 'presence') return true;
        return v.completedTodayHabits.length + v.completedTodayTasks.length > 0;
      }
      return v.habits.length + v.pendingTasks.length > 0;
    },
    {
      message:
        'remind דורש הרגל/משימה פתוחה; reinforce דורש ביצועים ב-DB או reinforceKind=presence',
      path: ['habits'],
    }
  );

export type AlmogHabitCheckpointPayload = z.infer<typeof almogHabitCheckpointPayloadSchema>;

export function parseAlmogHabitCheckpointPayload(raw: unknown): AlmogHabitCheckpointPayload {
  return almogHabitCheckpointPayloadSchema.parse(raw);
}
