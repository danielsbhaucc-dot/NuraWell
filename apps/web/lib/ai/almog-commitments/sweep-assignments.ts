/**
 * Sweep — מעקב אוטומטי אחרי צעדים שאלמוג נתן ושהמשתמש לא סימן.
 *
 * מזהה משימות חד-פעמיות (`almog_assignments`, schedule='one_time') שתקועות
 * זמן-מה בלי שבוצעו, ויוצר עבורן נדנוד עדין ב-`scheduled_reminders` (kind=
 * followup). הנדנוד הוא **טקסט קבוע — בלי קריאת LLM**, כדי שלא ישתה טוקנים.
 *
 * מאוחד בתוך `onboarding-check-ins` (רץ כל 30 דק'), בדיוק כמו drainAlmogReminders.
 * רץ *לפני* ה-drain כדי שנדנודים עם fire_at=now יישלחו באותה ריצה.
 *
 * שמירה מפני הצפה:
 *  • רק one_time (משימות daily/weekly מטופלות ע"י habit-checkpoints).
 *  • dedupe יומי — לכל היותר נדנוד אחד ליום לכל צעד.
 *  • מדלגים אם כבר יש תזכורת pending על אותו צעד.
 *  • תקרת גיל — לא מנדנדים על צעד ישן מאוד (כנראה כבר לא רלוונטי).
 *  • avoid_push נאכף ע"י ה-drain בשליחה בפועל.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

type Admin = SupabaseClient;

export interface SweepAssignmentsResult {
  now: string;
  candidates: number;
  nudges_created: number;
  skipped_existing: number;
  errors_count: number;
  errors?: string[];
  mode?: 'dry_run';
  disabled?: boolean;
}

type AssignmentRow = {
  id: string;
  user_id: string;
  title: string;
  reason: string | null;
  given_at: string;
  last_done_at: string | null;
};

/** ניסוחי נדנוד עדינים — נבחרים דטרמיניסטית לפי מזהה הצעד (בלי LLM). */
const NUDGE_BODIES: readonly ((title: string) => string)[] = [
  (t) => `עוד לא סימנו את "${t}". בלי לחץ — רוצה לנסות צעד קטן עכשיו?`,
  (t) => `חשבתי על "${t}" שסיכמנו. מה שלומו? כל התקדמות קטנה נחשבת.`,
  (t) => `"${t}" עדיין מחכה לך. אם זה מרגיש גדול — נוכל לפרק אותו ביחד.`,
  (t) => `רק בודק בעדינות לגבי "${t}". אני כאן אם משהו תקוע.`,
];

function pickBody(id: string, title: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const idx = Math.abs(hash) % NUDGE_BODIES.length;
  return NUDGE_BODIES[idx](title.slice(0, 60));
}

function israelDateKey(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export async function sweepStaleAssignments(
  admin: Admin,
  opts?: { dryRun?: boolean; now?: Date; userId?: string; maxBatch?: number }
): Promise<SweepAssignmentsResult> {
  const now = opts?.now ?? new Date();
  const nowIso = now.toISOString();

  if (process.env.ALMOG_ASSIGNMENT_SWEEP_ENABLED === '0') {
    return { now: nowIso, candidates: 0, nudges_created: 0, skipped_existing: 0, errors_count: 0, disabled: true };
  }

  const staleDays = Math.max(1, Number(process.env.ALMOG_ASSIGNMENT_STALE_DAYS) || 2);
  const maxAgeDays = Math.max(staleDays + 1, Number(process.env.ALMOG_ASSIGNMENT_SWEEP_MAX_AGE_DAYS) || 14);
  const maxBatch = Math.min(500, Math.max(1, opts?.maxBatch || Number(process.env.CRON_MAX_ASSIGNMENT_SWEEP) || 300));

  const staleBefore = new Date(now.getTime() - staleDays * 86_400_000).toISOString();
  const tooOldBefore = new Date(now.getTime() - maxAgeDays * 86_400_000).toISOString();
  const scopeUserId = opts?.userId?.trim() || null;

  // מועמדים: צעד חד-פעמי פעיל, ניתן לפני staleDays, לא ישן מדי, ולא בוצע לאחרונה.
  let query = admin
    .from('almog_assignments')
    .select('id, user_id, title, reason, given_at, last_done_at')
    .eq('status', 'active')
    .eq('schedule', 'one_time')
    .lte('given_at', staleBefore)
    .gte('given_at', tooOldBefore)
    .order('given_at', { ascending: true })
    .limit(maxBatch);
  if (scopeUserId) query = query.eq('user_id', scopeUserId);

  const { data: rows, error } = await query;
  if (error) {
    return { now: nowIso, candidates: 0, nudges_created: 0, skipped_existing: 0, errors_count: 1, errors: [error.message] };
  }

  // סינון: רק כאלה שלא בוצעו לאחרונה (last_done_at null או ישן מ-staleDays).
  const candidates = ((rows ?? []) as AssignmentRow[]).filter(
    (a) => !a.last_done_at || a.last_done_at <= staleBefore
  );

  if (candidates.length === 0) {
    return { now: nowIso, candidates: 0, nudges_created: 0, skipped_existing: 0, errors_count: 0, ...(opts?.dryRun ? { mode: 'dry_run' } : {}) };
  }

  // מדלגים על צעדים שכבר יש להם תזכורת pending (לא כופלים).
  const assignmentIds = candidates.map((a) => a.id);
  const { data: pendingRows } = await admin
    .from('scheduled_reminders')
    .select('assignment_id')
    .in('assignment_id', assignmentIds)
    .eq('status', 'pending');
  const hasPending = new Set(
    ((pendingRows ?? []) as { assignment_id: string | null }[])
      .map((r) => r.assignment_id)
      .filter((x): x is string => Boolean(x))
  );

  const dateKey = israelDateKey(now);
  let nudgesCreated = 0;
  let skippedExisting = 0;
  const errors: string[] = [];

  for (const a of candidates) {
    if (hasPending.has(a.id)) {
      skippedExisting += 1;
      continue;
    }
    if (opts?.dryRun) {
      nudgesCreated += 1;
      continue;
    }
    try {
      /**
       * select-first ואז insert — האינדקס הייחודי `uq_scheduled_reminders_dedupe`
       * חלקי (`WHERE dedupe_key IS NOT NULL`), ולכן `.upsert({ onConflict })` נכשל
       * ב-42P10. בלי זה הנדנודים לא נשמרו כלל (השגיאה נבלעה).
       */
      const remKey = `staletrack|${a.id}|${dateKey}`;
      const { data: existingRem } = await admin
        .from('scheduled_reminders')
        .select('id')
        .eq('user_id', a.user_id)
        .eq('dedupe_key', remKey)
        .maybeSingle();
      if (existingRem) {
        skippedExisting += 1;
        continue;
      }
      const { error: upErr } = await admin.from('scheduled_reminders').insert({
        user_id: a.user_id,
        fire_at: nowIso,
        kind: 'followup',
        title: 'אלמוג חושב עליך 🌿',
        body: pickBody(a.id, a.title),
        assignment_id: a.id,
        status: 'pending',
        dedupe_key: remKey,
        metadata: { source: 'assignment_sweep' },
      });
      if (upErr) throw new Error(upErr.message);
      nudgesCreated += 1;
    } catch (e) {
      errors.push(`${a.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    now: nowIso,
    candidates: candidates.length,
    nudges_created: nudgesCreated,
    skipped_existing: skippedExisting,
    errors_count: errors.length,
    errors: errors.length ? errors : undefined,
    ...(opts?.dryRun ? { mode: 'dry_run' } : {}),
  };
}
