/**
 * Periodic Summary Engine — Cascade orchestrator ("Memory Pyramid").
 *
 * תפקיד: לקבל (userId, type, periodKey) ולהחזיר אובייקט אחד שמכיל
 * `metrics` דטרמיניסטיים + `ai_insight` של ה-LLM, **בלי** לכתוב ל-DB.
 * הקוטיינר שמטפל ב-DB upsert הוא ה-route handler / Workflow.
 *
 * קונספט הפירמידה:
 *   • Daily   — קורא מ-`task_logs` (העלה).
 *   • Weekly  — קורא רק את 7 ה-Daily summaries מ-`periodic_summaries`.
 *   • Monthly — קורא רק את ה-Weekly summaries (~4-5).
 *   • Quarterly→Monthly, Semi→Quarterly, Annual→Semi.
 *
 * טיפול ב-children חסרים: אם משתמש לוחץ "צור סיכום שנתי" אבל לא קיימים
 * סיכומים שבועיים/חודשיים מתחת — ה-engine מייצר אותם רקורסיבית עד הצורך.
 * זה הופך את ה-API ל"מ-anything-to-anything" — אין צורך בהזמנה
 * סדרתית בצד הלקוח.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CHILD_TYPE,
  getChildPeriodKeys,
  isValidPeriodKey,
  parsePeriodKey,
  type SummaryType,
} from './period-keys';
import {
  aggregateLowerMetrics,
  computeDailyMetrics,
  type ChildRecord,
  type SummaryMetrics,
  type TaskLogRow,
} from './metrics';
import { generateSummaryInsight, type SummaryLlmResult } from './llm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient | any;

export interface GenerateSummaryInput {
  userId: string;
  type: SummaryType;
  periodKey: string;
  /** Override אופציונלי של מודל ה-LLM (ב-debug). */
  modelOverride?: string;
}

export interface GeneratedSummary {
  userId: string;
  type: SummaryType;
  periodKey: string;
  metrics: SummaryMetrics;
  ai_insight: string;
  ai_model: string;
  /** משך זמן שלקח לקריאת ה-LLM (ms). */
  llm_attempts: number;
  used_fallback: boolean;
  llm_errors: string[];
}

/**
 * מייצר סיכום בודד **ושומר ל-DB** (UPSERT) — וכך גם הסיכומים שמתחתיו
 * אם הם חסרים. זו הפונקציה היחידה שצריך לקרוא לה מבחוץ; היא חוצה
 * את כל רמות הפירמידה לפי הצורך.
 */
export async function generateAndStorePeriodicSummary(
  admin: AnySupabase,
  input: GenerateSummaryInput,
  /** שם פרטי לפנייה אישית. אם null → ייטען אוטומטית מ-`profiles`. */
  firstName?: string | null
): Promise<GeneratedSummary> {
  validateInput(input);

  const resolvedFirstName =
    firstName?.trim() || (await fetchFirstName(admin, input.userId)) || 'חבר';

  const { metrics, childInsights, lowerLevelGenerated } = await buildMetricsAndChildInsights(
    admin,
    input,
    resolvedFirstName
  );

  const llmResult = await generateSummaryInsight(
    {
      type: input.type,
      periodKey: input.periodKey,
      firstName: resolvedFirstName,
      metrics,
      childInsights,
    },
    input.modelOverride ? { model: input.modelOverride } : {}
  );

  await upsertSummary(admin, {
    userId: input.userId,
    type: input.type,
    periodKey: input.periodKey,
    metrics,
    aiInsight: llmResult.insight,
    aiModel: llmResult.model,
  });

  // eslint-disable-next-line no-console
  if (lowerLevelGenerated > 0) {
    // eslint-disable-next-line no-console
    console.info(
      `[summary-engine] cascade-generated ${lowerLevelGenerated} lower-level summaries while building ${input.type}/${input.periodKey}`
    );
  }

  return {
    userId: input.userId,
    type: input.type,
    periodKey: input.periodKey,
    metrics,
    ai_insight: llmResult.insight,
    ai_model: llmResult.model,
    llm_attempts: llmResult.attempts,
    used_fallback: llmResult.usedFallback,
    llm_errors: llmResult.errors,
  };
}

// ─── שלב הבנייה: metrics + child insights ──────────────────────

interface BuildContext {
  metrics: SummaryMetrics;
  childInsights: Array<{ periodKey: string; insight: string }>;
  /** כמה רמות "תחתונות" נוצרו ב-cascade בשביל הסיכום הזה. */
  lowerLevelGenerated: number;
}

async function buildMetricsAndChildInsights(
  admin: AnySupabase,
  input: GenerateSummaryInput,
  firstName: string
): Promise<BuildContext> {
  if (input.type === 'daily') {
    const log = await fetchTaskLogForDay(admin, input.userId, input.periodKey);
    const metrics = computeDailyMetrics(input.periodKey, log);
    return { metrics, childInsights: [], lowerLevelGenerated: 0 };
  }

  // רמות אגרגטיביות: לאסוף את ילדי התקופה.
  const childType = CHILD_TYPE[input.type];
  if (!childType) {
    throw new Error(`generateSummary: no child type for ${input.type}`);
  }

  const childKeys = getChildPeriodKeys(input.type, input.periodKey);
  if (childKeys.length === 0) {
    throw new Error(
      `generateSummary: no child keys derived for ${input.type}/${input.periodKey}`
    );
  }

  // 1. שליפה אחת לכל תפוקות הילדים שכבר יש.
  const existing = await fetchExistingSummaries(admin, input.userId, childType, childKeys);
  const existingByKey = new Map(existing.map((row) => [row.period_key, row]));

  // 2. אילו ילדים חסרים? נייצר אותם רקורסיבית.
  const missing = childKeys.filter((k) => !existingByKey.has(k));
  let lowerLevelGenerated = 0;
  for (const missingKey of missing) {
    // eslint-disable-next-line no-await-in-loop
    const childResult = await generateAndStorePeriodicSummary(
      admin,
      { userId: input.userId, type: childType, periodKey: missingKey, ...(input.modelOverride ? { modelOverride: input.modelOverride } : {}) },
      firstName
    );
    existingByKey.set(missingKey, {
      period_key: missingKey,
      metrics: childResult.metrics,
      ai_insight: childResult.ai_insight,
    });
    lowerLevelGenerated += 1 + countLowerCascade(childType);
  }

  // 3. בנה ChildRecord[] בסדר קבוע (לא לפי הסדר ש-DB החזיר).
  const children: ChildRecord[] = childKeys.map((k) => {
    const row = existingByKey.get(k);
    if (!row) {
      throw new Error(`generateSummary: child still missing post-cascade: ${childType}/${k}`);
    }
    return {
      periodKey: row.period_key,
      metrics: row.metrics,
      aiInsight: row.ai_insight,
    };
  });

  const range = parsePeriodKey(input.type, input.periodKey);
  const metrics = aggregateLowerMetrics({
    type: input.type,
    startDate: range.startDate,
    endDate: range.endDate,
    children,
  });

  // ה-LLM מקבל רק את התובנות (לא JSON ענק) של הילדים — שמרנו ב-tokens.
  const childInsights = children
    .map((c) => ({ periodKey: c.periodKey, insight: c.aiInsight ?? '' }))
    .filter((c) => c.insight.trim().length > 0);

  return { metrics, childInsights, lowerLevelGenerated };
}

/** Approximation: how many cascade-levels exist below `type`. */
function countLowerCascade(type: SummaryType): number {
  switch (type) {
    case 'daily':
      return 0;
    case 'weekly':
      return 7; // מחושב מאחורי הקלעים
    case 'monthly':
      return 4;
    case 'quarterly':
      return 3;
    case 'semi_annual':
      return 2;
    case 'annual':
      return 2;
  }
}

// ─── DB I/O ────────────────────────────────────────────────────

async function fetchTaskLogForDay(
  admin: AnySupabase,
  userId: string,
  dateKey: string
): Promise<TaskLogRow | null> {
  const { data, error } = await admin
    .from('task_logs')
    .select('date_key, task_name, source, completed_at')
    .eq('user_id', userId)
    .eq('date_key', dateKey)
    .maybeSingle();

  if (error) {
    // PGRST116 = no rows; אבל maybeSingle כבר מחזיר null אז כל error הוא אמיתי.
    throw new Error(`fetchTaskLogForDay(${dateKey}): ${error.message ?? String(error)}`);
  }
  return (data as TaskLogRow | null) ?? null;
}

interface ExistingSummaryRow {
  period_key: string;
  metrics: SummaryMetrics;
  ai_insight: string;
}

async function fetchExistingSummaries(
  admin: AnySupabase,
  userId: string,
  type: SummaryType,
  periodKeys: string[]
): Promise<ExistingSummaryRow[]> {
  if (periodKeys.length === 0) return [];
  const { data, error } = await admin
    .from('periodic_summaries')
    .select('period_key, metrics, ai_insight')
    .eq('user_id', userId)
    .eq('type', type)
    .in('period_key', periodKeys);

  if (error) {
    throw new Error(`fetchExistingSummaries(${type}): ${error.message ?? String(error)}`);
  }
  return (data ?? []) as ExistingSummaryRow[];
}

interface UpsertInput {
  userId: string;
  type: SummaryType;
  periodKey: string;
  metrics: SummaryMetrics;
  aiInsight: string;
  aiModel: string;
}

async function upsertSummary(admin: AnySupabase, input: UpsertInput): Promise<void> {
  const { error } = await admin
    .from('periodic_summaries')
    .upsert(
      {
        user_id: input.userId,
        type: input.type,
        period_key: input.periodKey,
        metrics: input.metrics,
        ai_insight: input.aiInsight,
        ai_model: input.aiModel,
      },
      { onConflict: 'user_id,type,period_key' }
    );

  if (error) {
    throw new Error(`upsertSummary(${input.type}/${input.periodKey}): ${error.message ?? String(error)}`);
  }
}

async function fetchFirstName(admin: AnySupabase, userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  const fullName = (data as { full_name: string | null }).full_name ?? '';
  const first = fullName.trim().split(/\s+/)[0];
  return first || null;
}

// ─── Validation ────────────────────────────────────────────────

function validateInput(input: GenerateSummaryInput): void {
  if (!input.userId || typeof input.userId !== 'string') {
    throw new Error('generateSummary: userId is required');
  }
  if (!isValidPeriodKey(input.type, input.periodKey)) {
    throw new Error(
      `generateSummary: periodKey "${input.periodKey}" does not match format for type "${input.type}"`
    );
  }
}

// ─── Light variant: dispatchSummaryReadyNotification ───────────

/**
 * Mock "התראה" — נכתבת ל-`notifications` כשהזרימה רצה מ-cron.
 * חתימה רכה: אם הטבלה לא קיימת או חסר schema, פשוט לוג.
 */
export async function dispatchSummaryReadyNotification(
  admin: AnySupabase,
  args: { userId: string; type: SummaryType; periodKey: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const titleByType: Record<SummaryType, string> = {
      daily: 'הסיכום היומי שלך מוכן',
      weekly: 'הסיכום השבועי שלך מוכן',
      monthly: 'הסיכום החודשי שלך מוכן',
      quarterly: 'הסיכום הרבעוני שלך מוכן',
      semi_annual: 'הסיכום החצי-שנתי שלך מוכן',
      annual: 'הסיכום השנתי שלך מוכן',
    };

    const { error } = await admin.from('notifications').insert({
      user_id: args.userId,
      title: titleByType[args.type],
      body: `המבט שלי על ${args.periodKey} מחכה לך באפליקציה.`,
      type: 'periodic_summary',
      action_url: `/me/insights?type=${args.type}&period=${encodeURIComponent(args.periodKey)}`,
      icon_emoji: '✨',
      metadata: {
        summary_type: args.type,
        period_key: args.periodKey,
      },
    });

    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[summary-engine] dispatchSummaryReady soft-fail:', error.message ?? error);
      return { ok: false, error: error.message ?? String(error) };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn('[summary-engine] dispatchSummaryReady threw:', msg);
    return { ok: false, error: msg };
  }
}
