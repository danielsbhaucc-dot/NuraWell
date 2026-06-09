/**
 * kickoff-status.ts
 * -----------------
 * עדכון טבלת `almog_kickoff_status` — ה-ground truth לכל קריאה ראשונה של אלמוג.
 *
 * זרימה:
 *   1. post-verify קורא ל-`markKickoffScheduled` (גם אם QStash נכשל ירוץ עם error).
 *   2. cron יומי קורא ל-`fetchOverdueKickoffs` כדי לתפוס כשלים בשקט.
 *   3. אחרי שליחת notification → `markKickoffSent`.
 *   4. אם משתמש לא רלוונטי (avoid_push, journey complete) → `markKickoffSkipped`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type KickoffState = 'pending' | 'scheduled' | 'sent' | 'failed' | 'skipped';

export type KickoffStatusRow = {
  user_id: string;
  state: KickoffState;
  scheduled_at: string | null;
  last_attempt_at: string | null;
  sent_at: string | null;
  attempts: number;
  last_error: string | null;
  skip_reason: string | null;
  workflow_run_id: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

/**
 * מתעד ניסיון תזמון — בין אם QStash הצליח או נכשל.
 *  - QStash הצליח: state='scheduled' + workflowRunId.
 *  - QStash נכשל: state='pending' (cron יתפוס) + last_error.
 *  - אם השורה כבר קיימת ובסטטוס 'sent' — לא נדרוס.
 */
export async function markKickoffScheduled(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  result:
    | { ok: true; workflowRunId: string; source?: string }
    | { ok: false; reason: string; source?: string }
): Promise<void> {
  const nowIso = new Date().toISOString();
  const base = {
    user_id: userId,
    last_attempt_at: nowIso,
    source: result.source ?? 'post_verify',
  };

  try {
    const { data: existing } = await admin
      .from('almog_kickoff_status')
      .select('state, attempts')
      .eq('user_id', userId)
      .maybeSingle();

    /** לא דורסים sent — אם כבר נשלח, רק מעלים attempt למחקר. */
    if (existing?.state === 'sent') return;

    const attempts = (existing?.attempts ?? 0) + 1;

    if (result.ok) {
      await admin.from('almog_kickoff_status').upsert(
        {
          ...base,
          state: 'scheduled',
          scheduled_at: nowIso,
          workflow_run_id: result.workflowRunId,
          attempts,
          last_error: null,
        },
        { onConflict: 'user_id' }
      );
    } else {
      await admin.from('almog_kickoff_status').upsert(
        {
          ...base,
          state: 'pending',
          attempts,
          last_error: result.reason.slice(0, 500),
        },
        { onConflict: 'user_id' }
      );
    }
  } catch (e) {
    /** לא רוצים שכישלון תיעוד יקפיץ את ה-post-verify */
    console.warn('[kickoff-status] markScheduled failed', {
      userId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/** מסמן ניסיון שליחה ישיר (לא דרך QStash) — לפני שמנסים בפועל. */
export async function markKickoffAttempt(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  source: string
): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    const { data: existing } = await admin
      .from('almog_kickoff_status')
      .select('attempts, state')
      .eq('user_id', userId)
      .maybeSingle();
    if (existing?.state === 'sent') return;
    await admin.from('almog_kickoff_status').upsert(
      {
        user_id: userId,
        last_attempt_at: nowIso,
        attempts: (existing?.attempts ?? 0) + 1,
        source,
      },
      { onConflict: 'user_id' }
    );
  } catch (e) {
    console.warn('[kickoff-status] markAttempt failed', e);
  }
}

/** מסמן שהתראה ראשונה נשלחה בהצלחה. */
export async function markKickoffSent(
  admin: SupabaseClient<any, any, any>,
  userId: string
): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    await admin.from('almog_kickoff_status').upsert(
      {
        user_id: userId,
        state: 'sent',
        sent_at: nowIso,
        last_error: null,
      },
      { onConflict: 'user_id' }
    );
  } catch (e) {
    console.warn('[kickoff-status] markSent failed', e);
  }
}

/** מסמן דילוג מסיבה לגיטימית (לא ניסיון נוסף). */
export async function markKickoffSkipped(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  reason: string
): Promise<void> {
  try {
    await admin.from('almog_kickoff_status').upsert(
      {
        user_id: userId,
        state: 'skipped',
        skip_reason: reason.slice(0, 200),
      },
      { onConflict: 'user_id' }
    );
  } catch (e) {
    console.warn('[kickoff-status] markSkipped failed', e);
  }
}

/** מסמן כישלון מתמשך — לא יוגדר כ-sent ולא ידלג. cron ינסה שוב. */
export async function markKickoffFailed(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  error: string
): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    const { data: existing } = await admin
      .from('almog_kickoff_status')
      .select('attempts')
      .eq('user_id', userId)
      .maybeSingle();
    await admin.from('almog_kickoff_status').upsert(
      {
        user_id: userId,
        state: 'failed',
        last_attempt_at: nowIso,
        attempts: (existing?.attempts ?? 0) + 1,
        last_error: error.slice(0, 500),
      },
      { onConflict: 'user_id' }
    );
  } catch (e) {
    console.warn('[kickoff-status] markFailed failed', e);
  }
}

/**
 * שולפת משתמשים שצריך לנסות מחדש: פתוחים יותר מ-`minMinutesSinceLastAttempt`,
 * ו-state ב-pending/failed.
 *
 *  - מחזיר גם משתמשים בלי כלל שורה בטבלה (= QStash schedule הצליח אבל
 *    הסטטוס לא נכתב, או שמשתמש ישן לפני הטבלה). אלה ייתפסו דרך JOIN
 *    שמוסיף שורה כש-`onboarding_completed` ובלי שורה.
 */
export async function fetchKickoffWatchdogCandidates(
  admin: SupabaseClient<any, any, any>,
  options?: {
    minMinutesSinceOnboarding?: number;
    minMinutesSinceLastAttempt?: number;
    maxAttempts?: number;
    limit?: number;
  }
): Promise<Array<{ userId: string; state: KickoffState | null; attempts: number }>> {
  const minMinutesSinceOnboarding = options?.minMinutesSinceOnboarding ?? 90;
  const minMinutesSinceLastAttempt = options?.minMinutesSinceLastAttempt ?? 60;
  const maxAttempts = options?.maxAttempts ?? 5;
  const limit = options?.limit ?? 50;

  const onboardCutoffIso = new Date(
    Date.now() - minMinutesSinceOnboarding * 60 * 1000
  ).toISOString();
  const attemptCutoffIso = new Date(
    Date.now() - minMinutesSinceLastAttempt * 60 * 1000
  ).toISOString();

  /**
   * שני שאילתות נפרדות כדי לא להסתבך עם LEFT JOIN ב-supabase-js:
   *   1) משתמשים עם onboarding_completed=true שאין להם שורה בכלל בטבלה.
   *   2) משתמשים עם שורה בסטטוס 'pending'/'failed' ועברו X דקות מהניסיון.
   */

  const { data: candidates } = await admin
    .from('almog_kickoff_status')
    .select('user_id, state, attempts, last_attempt_at')
    .in('state', ['pending', 'failed'])
    .lt('attempts', maxAttempts)
    .or(`last_attempt_at.is.null,last_attempt_at.lt.${attemptCutoffIso}`)
    .limit(limit);

  const candidateIds = new Set<string>(
    (candidates ?? []).map((r: { user_id: string }) => r.user_id)
  );

  const { data: orphanProfiles } = await admin
    .from('profiles')
    .select('id, created_at')
    .eq('onboarding_completed', true)
    .lt('created_at', onboardCutoffIso)
    .limit(limit * 2);

  const orphanProfileIds = ((orphanProfiles ?? []) as Array<{ id: string }>).map((r) => r.id);
  const statusByUser = new Set<string>();
  if (orphanProfileIds.length > 0) {
    const { data: existingStatuses } = await admin
      .from('almog_kickoff_status')
      .select('user_id')
      .in('user_id', orphanProfileIds);
    for (const row of (existingStatuses ?? []) as Array<{ user_id: string }>) {
      statusByUser.add(row.user_id);
    }
  }

  const out: Array<{ userId: string; state: KickoffState | null; attempts: number }> = [];

  for (const row of (candidates ?? []) as Array<{
    user_id: string;
    state: KickoffState;
    attempts: number;
  }>) {
    out.push({ userId: row.user_id, state: row.state, attempts: row.attempts });
  }

  for (const row of (orphanProfiles ?? []) as Array<{
    id: string;
  }>) {
    if (candidateIds.has(row.id)) continue;
    if (statusByUser.has(row.id)) continue;
    out.push({ userId: row.id, state: null, attempts: 0 });
    if (out.length >= limit) break;
  }

  return out.slice(0, limit);
}
