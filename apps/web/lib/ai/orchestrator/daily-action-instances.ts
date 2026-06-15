/**
 * 🧩 Daily Action Instances — מחזור-החיים של צעדים דינמיים (Pivots).
 *
 * "המשימה של היום" (instance אחד לכל user ליום) מקבלת state lifecycle:
 *   - override: כשמתקבל pivot, display_title נדרס בטקסט המיקרו, is_pivot=true.
 *   - evaluation: בכל heartbeat האורקסטרטור בודק את ה-instance. pivot שהושלם
 *     נרשם כ-"Successful Intervention Cluster" ופותח מסלול טיפוס הדרגתי
 *     (progression path) חזרה ליעד המקורי על פני כמה ימים.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { groq, AI_MODELS } from '../client';
import { israelDateKey } from '../onboarding-check-in-time';

export type DailyActionStatus = 'pending' | 'completed' | 'skipped';

export type DailyActionInstance = {
  id: string;
  user_id: string;
  date_key: string;
  display_title: string;
  status: DailyActionStatus;
  is_pivot: boolean;
  original_title: string | null;
  progression_step: number;
  pivot_proposal_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

/** מספר השלבים שלוקח לטפס מצעד-המיקרו בחזרה ליעד המלא. */
const PROGRESSION_TARGET_STEPS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

function dateKeyOffset(now: Date, offsetDays: number): string {
  return israelDateKey(new Date(now.getTime() + offsetDays * DAY_MS));
}

export async function getInstanceForDate(
  admin: SupabaseClient,
  userId: string,
  dateKey: string
): Promise<DailyActionInstance | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await admin
    .from('daily_action_instances')
    .select('*')
    .eq('user_id', userId)
    .eq('date_key', dateKey)
    .maybeSingle();
  return (data ?? null) as DailyActionInstance | null;
}

/**
 * 🔁 ה-Override Mutation — מתקבל pivot: דורס את ה-instance של היום בטקסט
 * המיקרו, מסמן is_pivot ומאפס את מסלול ההתקדמות. upsert על (user_id, date_key).
 */
export async function applyPivotOverride(
  admin: SupabaseClient,
  userId: string,
  params: {
    displayTitle: string;
    originalTitle: string | null;
    proposalId: string | null;
    now?: Date;
  }
): Promise<DailyActionInstance | null> {
  const now = params.now ?? new Date();
  const dateKey = israelDateKey(now);
  const iso = now.toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await admin
    .from('daily_action_instances')
    .upsert(
      {
        user_id: userId,
        date_key: dateKey,
        display_title: params.displayTitle,
        status: 'pending',
        is_pivot: true,
        original_title: params.originalTitle,
        progression_step: 0,
        pivot_proposal_id: params.proposalId,
        metadata: { source: 'ai_pivot_accept' },
        updated_at: iso,
        completed_at: null,
      },
      { onConflict: 'user_id,date_key' }
    )
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(`applyPivotOverride failed: ${error.message}`);
  }
  return (data ?? null) as DailyActionInstance | null;
}

/** עדכון סטטוס ה-instance של היום (משמש את ה-UI/endpoint). */
export async function setInstanceStatus(
  admin: SupabaseClient,
  userId: string,
  status: DailyActionStatus,
  now: Date = new Date()
): Promise<DailyActionInstance | null> {
  const dateKey = israelDateKey(now);
  const iso = now.toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await admin
    .from('daily_action_instances')
    .update({
      status,
      updated_at: iso,
      completed_at: status === 'completed' ? iso : null,
    })
    .eq('user_id', userId)
    .eq('date_key', dateKey)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`setInstanceStatus failed: ${error.message}`);
  return (data ?? null) as DailyActionInstance | null;
}

/** הצעד האחרון שב-pivot (לכל user) — לשליפת מצב ה-cluster. */
async function fetchLatestPivotInstance(
  admin: SupabaseClient,
  userId: string
): Promise<DailyActionInstance | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await admin
    .from('daily_action_instances')
    .select('*')
    .eq('user_id', userId)
    .eq('is_pivot', true)
    .order('date_key', { ascending: false })
    .limit(1);
  const row = Array.isArray(data) ? data[0] : null;
  return (row ?? null) as DailyActionInstance | null;
}

/** ניסוח טקסט הצעד הבא במסלול הטיפוס — LLM קצר עם fallback דטרמיניסטי. */
async function generateProgressionStepTitle(params: {
  microTitle: string;
  originalTitle: string;
  step: number;
  target: number;
}): Promise<string> {
  const deterministic = `${params.originalTitle} — בונים בחזרה בהדרגה (${params.step}/${params.target})`;
  if (!process.env.GROQ_API_KEY?.trim()) return deterministic;

  try {
    const completion = await groq.chat.completions.create({
      model: AI_MODELS.background_groq,
      temperature: 0.5,
      max_tokens: 80,
      messages: [
        {
          role: 'system',
          content:
            'אתה אלמוג, מאמן הרגלים תומך (לא מטפל/דיאטן). נסח כותרת קצרה אחת בעברית למשימת היום ' +
            'שהיא צעד ביניים בדרך *חזרה* מהצעד הזעיר אל היעד המלא — מעט גדול יותר מאתמול אך עדיין בר-השגה. ' +
            'החזר שורה אחת בלבד, בלי גרשיים ובלי הסבר.',
        },
        {
          role: 'user',
          content: `צעד זעיר נוכחי: "${params.microTitle}". היעד המלא: "${params.originalTitle}". זה שלב ${params.step} מתוך ${params.target}.`,
        },
      ],
    });
    const raw = (completion.choices[0]?.message?.content ?? '')
      .replace(/\s+/g, ' ')
      .replace(/^["'״׳`]+|["'״׳`]+$/g, '')
      .trim();
    if (raw.length >= 3 && raw.length <= 120) return raw;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[daily-action] progression title LLM failed, using fallback', err);
  }
  return deterministic;
}

export type PivotProgressionResult =
  | { advanced: false; reason: string }
  | {
      advanced: true;
      kind: 'progressed' | 'graduated';
      fromStep: number;
      toStep: number;
      nextDateKey?: string;
      nextTitle?: string;
    };

/**
 * 🫀 הערכת ה-pivot ב-heartbeat (Requirement 3).
 *
 * שולף את ה-pivot האחרון. אם הוא הושלם (status='completed', is_pivot=true)
 * ועוד לא טופל — רושם "Successful Intervention Cluster" ופותח/מקדם את מסלול
 * הטיפוס: יוצר את ה-instance של *מחר* בשלב הבא, קרוב יותר ליעד. בהגיעו ליעד
 * המלא וההשלמה שלו — graduation (סוף ה-pivot, חזרה לשגרה).
 *
 * אידמפוטנטי: לא רושם cluster פעמיים (metadata.cluster_logged_at) ולא יוצר
 * instance כפול ליום נתון.
 */
export async function advancePivotProgression(
  admin: SupabaseClient,
  userId: string,
  now: Date = new Date()
): Promise<PivotProgressionResult> {
  const latest = await fetchLatestPivotInstance(admin, userId);
  if (!latest) return { advanced: false, reason: 'no_pivot' };
  if (latest.status !== 'completed') return { advanced: false, reason: `status_${latest.status}` };

  const meta = (latest.metadata ?? {}) as Record<string, unknown>;
  if (meta.cluster_logged_at) return { advanced: false, reason: 'already_clustered' };

  const nowIso = now.toISOString();

  // רישום ה-Cluster על ה-instance שהושלם (idempotency anchor).
  const clusterMeta = {
    ...meta,
    cluster_logged_at: nowIso,
    cluster_from_step: latest.progression_step,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await admin
    .from('daily_action_instances')
    .update({ metadata: clusterMeta, updated_at: nowIso })
    .eq('id', latest.id);

  // eslint-disable-next-line no-console
  console.log(
    '[program-orchestrator] Successful Intervention Cluster',
    JSON.stringify({
      userId,
      instanceId: latest.id,
      step: latest.progression_step,
      graduating: meta.graduating === true,
    })
  );

  // היה זה הצעד שכבר חזר ליעד המלא → graduation, אין pivot חדש.
  if (meta.graduating === true) {
    return { advanced: true, kind: 'graduated', fromStep: latest.progression_step, toStep: latest.progression_step };
  }

  const nextStep = latest.progression_step + 1;
  const originalTitle = latest.original_title?.trim() || latest.display_title;
  const reachedGoal = nextStep >= PROGRESSION_TARGET_STEPS;
  const nextTitle = reachedGoal
    ? originalTitle
    : await generateProgressionStepTitle({
        microTitle: latest.display_title,
        originalTitle,
        step: nextStep,
        target: PROGRESSION_TARGET_STEPS,
      });

  // ה-instance הבא מתוזמן ליום שלמחרת — טיפוס "על פני כמה ימים".
  const nextDateKey = dateKeyOffset(now, 1);
  const existing = await getInstanceForDate(admin, userId, nextDateKey);
  if (existing) {
    return { advanced: true, kind: 'progressed', fromStep: latest.progression_step, toStep: nextStep, nextDateKey };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await admin.from('daily_action_instances').insert({
    user_id: userId,
    date_key: nextDateKey,
    display_title: nextTitle,
    status: 'pending',
    is_pivot: true,
    original_title: originalTitle,
    progression_step: nextStep,
    pivot_proposal_id: latest.pivot_proposal_id,
    metadata: {
      source: 'pivot_progression',
      progression_of: latest.id,
      graduating: reachedGoal,
    },
    updated_at: nowIso,
  });
  if (error) {
    throw new Error(`advancePivotProgression insert failed: ${error.message}`);
  }

  return {
    advanced: true,
    kind: 'progressed',
    fromStep: latest.progression_step,
    toStep: nextStep,
    nextDateKey,
    nextTitle,
  };
}
