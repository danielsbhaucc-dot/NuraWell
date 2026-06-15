/**
 * שמירת תוצאות החילוץ לטבלאות ההתחייבויות (רקע, דרך service role).
 *
 * עקרונות:
 *  • dedupe — לא יוצרים אותה משימה/תזכורת/חסם פעמיים (unique index + בדיקה).
 *  • זמנים מדויקים — חישוב שעון-קיר ישראל ל-UTC עם תמיכת DST.
 *  • לא הרסני — focus מתחיל כ-proposed; שום משימה רגילה לא נמחקת.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommitmentExtraction } from './extract-commitments';
import { normalizeFrictionCategory } from './friction';
import { israelDayOffsetToUtcIso, israelHour } from './time';

type Admin = SupabaseClient;

export interface PersistResult {
  assignments_created: number;
  reminders_created: number;
  blockers_upserted: number;
  blockers_updated: number;
  focus_action: 'none' | 'proposed' | 'activated' | 'updated';
}

type BlockerHistoryEntry = { at: string; status: string; note?: string };

/**
 * הכנסה עם מניעת כפילויות — select-first ואז insert.
 *
 * ⚠️ קריטי: האינדקסים הייחודיים של הטבלאות האלה הם *חלקיים*
 * (`UNIQUE ... WHERE dedupe_key IS NOT NULL`, ראה 000048). Postgres לא יכול
 * להשתמש באינדקס חלקי כ-arbiter של `ON CONFLICT (user_id, dedupe_key)` בלי
 * ה-predicate, ולכן `.upsert({ onConflict })` נכשל בשגיאה 42P10
 * ("no unique or exclusion constraint matching the ON CONFLICT specification").
 * בעבר השגיאה נבלעה (`if (!error)`) — ולכן תזכורות/משימות מהצ'אט *לא נשמרו כלל*,
 * והעמוד "התוכנית שלי" נשאר ריק. זה הדפוס הבטוח (כמו ב-almog-blockers/route.ts).
 */
async function insertDeduped(
  admin: Admin,
  table: string,
  userId: string,
  key: string,
  payload: Record<string, unknown>
): Promise<'inserted' | 'exists' | 'error'> {
  const { data: existing } = await admin
    .from(table)
    .select('id')
    .eq('user_id', userId)
    .eq('dedupe_key', key)
    .maybeSingle();
  if (existing) return 'exists';
  const { error } = await admin.from(table).insert(payload);
  return error ? 'error' : 'inserted';
}

/** מנרמל טקסט עברי/אנגלי למפתח dedupe יציב. */
function dedupeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/**
 * ברירת מחדל לזמן תזכורת כשהמודל לא נתן זמן מפורש.
 *
 * תיקון באג "אלמוג הבטיח להזכיר אבל לא הופיעה תזכורת": קודם ברירת המחדל הייתה
 * מחר 08:00, כך שגם אם ה-CRON רץ כל 30 דק' — לא היה מה לשלוח עד למחרת בבוקר,
 * והמשתמש לא ראה כלום. עכשיו, אם אלמוג מבטיח להזכיר בלי לציין מתי, התזכורת
 * נקבעת לזמן קרוב *באותו יום* (בעוד ~90 דק', בתוך שעות הערות), כך שה-CRON
 * מוסר אותה תוך הסיבוב-שניים הקרובים. מאוחר בלילה/מוקדם בבוקר — נדחה לבוקר 09:00.
 */
function defaultReminderIso(now: Date): string {
  const hour = israelHour(now);
  // לפנות בוקר (00:00–07:59) — להזכיר היום בבוקר ב-09:00.
  if (hour < 8) return israelDayOffsetToUtcIso(now, 0, 9, 0);
  // שעות ערות (08:00–20:59) — בעוד ~90 דקות, באותו יום.
  if (hour < 21) return new Date(now.getTime() + 90 * 60_000).toISOString();
  // לילה (21:00–23:59) — להזכיר מחר בבוקר ב-09:00.
  return israelDayOffsetToUtcIso(now, 1, 9, 0);
}
/** ברירת מחדל ל-follow-up: בעוד יומיים 18:00 ישראל. */
function defaultFollowUpIso(now: Date): string {
  return israelDayOffsetToUtcIso(now, 2, 18, 0);
}
/** ברירת מחדל לבדיקת חסם: בעוד 3 ימים 18:00 ישראל. */
function defaultBlockerCheckIso(now: Date): string {
  return israelDayOffsetToUtcIso(now, 3, 18, 0);
}

/** מפתח dedupe יומי לתזכורת — אותה תזכורת באותו יום לא נכפלת. */
function reminderDedupeKey(text: string, fireAtIso: string): string {
  return `${dedupeKey(text).slice(0, 50)}|${fireAtIso.slice(0, 10)}`;
}

export async function persistCommitmentExtraction(params: {
  admin: Admin;
  userId: string;
  sessionId?: string | null;
  extraction: CommitmentExtraction;
  habitTitleToId?: Map<string, string>;
  blockerTagToId?: Map<string, string>;
  relatedStepId?: string | null;
  sourceExcerpt?: string | null;
  now?: Date;
}): Promise<PersistResult> {
  const { admin, userId, extraction } = params;
  const now = params.now ?? new Date();
  const sessionId = params.sessionId ?? null;
  const result: PersistResult = {
    assignments_created: 0,
    reminders_created: 0,
    blockers_upserted: 0,
    blockers_updated: 0,
    focus_action: 'none',
  };

  // ── משימות אישיות ──────────────────────────────────────────────
  for (const task of extraction.tasks) {
    const key = dedupeKey(task.title);
    if (!key) continue;
    const relatedHabitId = task.related_habit
      ? params.habitTitleToId?.get(task.related_habit.trim()) ?? null
      : null;
    const outcome = await insertDeduped(admin, 'almog_assignments', userId, key, {
      user_id: userId,
      title: task.title,
      reason: task.reason,
      detail: task.detail,
      status: 'active',
      schedule: task.schedule,
      given_at: now.toISOString(),
      due_at: task.due_at_iso,
      related_habit_id: relatedHabitId,
      related_step_id: params.relatedStepId ?? null,
      source_session_id: sessionId,
      source_excerpt: params.sourceExcerpt ?? null,
      dedupe_key: key,
      created_by: 'almog',
      metadata: task.related_habit ? { related_habit_title: task.related_habit } : {},
    });
    if (outcome === 'inserted') result.assignments_created += 1;
  }

  // ── תזכורות ────────────────────────────────────────────────────
  for (const rem of extraction.reminders) {
    const fireAt = rem.fire_at_iso ?? defaultReminderIso(now);
    const key = reminderDedupeKey(rem.what, fireAt);
    const outcome = await insertDeduped(admin, 'scheduled_reminders', userId, key, {
      user_id: userId,
      fire_at: fireAt,
      kind: 'reminder',
      title: 'תזכורת מאלמוג',
      body: rem.notify_text ?? rem.what,
      status: 'pending',
      dedupe_key: key,
      source_session_id: sessionId,
    });
    if (outcome === 'inserted') result.reminders_created += 1;
  }

  // ── follow-ups (מעקב אחרי משימה שניתנה) ────────────────────────
  for (const fu of extraction.followups) {
    const fireAt = fu.fire_at_iso ?? defaultFollowUpIso(now);
    const key = `fu|${reminderDedupeKey(fu.what, fireAt)}`;
    const outcome = await insertDeduped(admin, 'scheduled_reminders', userId, key, {
      user_id: userId,
      fire_at: fireAt,
      kind: 'followup',
      title: 'בדיקה קצרה מאלמוג',
      body: fu.notify_text ?? fu.what,
      status: 'pending',
      dedupe_key: key,
      source_session_id: sessionId,
    });
    if (outcome === 'inserted') result.reminders_created += 1;
  }

  // ── חסמים ──────────────────────────────────────────────────────
  for (const blocker of extraction.blockers) {
    const key = dedupeKey(blocker.description);
    if (!key) continue;
    const nextCheck = defaultBlockerCheckIso(now);
    const { data: existing } = await admin
      .from('almog_blockers')
      .select('id')
      .eq('user_id', userId)
      .eq('dedupe_key', key)
      .maybeSingle();

    const category = normalizeFrictionCategory(blocker.category);

    if (existing) {
      await admin
        .from('almog_blockers')
        .update({
          strategy: blocker.strategy,
          category,
          next_check_at: nextCheck,
        })
        .eq('id', (existing as { id: string }).id);
      result.blockers_upserted += 1;
    } else {
      const { data: inserted } = await admin
        .from('almog_blockers')
        .insert({
          user_id: userId,
          description: blocker.description,
          strategy: blocker.strategy,
          category,
          status: 'open',
          identified_at: now.toISOString(),
          next_check_at: nextCheck,
          dedupe_key: key,
          history: [{ at: now.toISOString(), status: 'open' }],
        })
        .select('id')
        .maybeSingle();
      if (inserted) {
        result.blockers_upserted += 1;
        // בדיקת התקדמות מתוזמנת — אלמוג יחזור לוודא שהחסם נפתר.
        const checkBody = blocker.strategy
          ? `רציתי לבדוק איתך — הצלחת לנסות "${blocker.strategy}"? איך הלך עם ${blocker.description}?`
          : `רציתי לבדוק איתך מה קורה עם ${blocker.description}. הצלחת להתקדם קצת?`;
        await insertDeduped(admin, 'scheduled_reminders', userId, `blk|${key}`, {
          user_id: userId,
          fire_at: nextCheck,
          kind: 'check_progress',
          title: 'אלמוג חושב עליך 🧭',
          body: checkBody,
          blocker_id: (inserted as { id: string }).id,
          status: 'pending',
          dedupe_key: `blk|${key}`,
          source_session_id: sessionId,
        });
      }
    }
  }

  // ── עדכוני התקדמות על חסמים קיימים (סגירת לולאת המעקב) ──────────
  if (extraction.blocker_updates.length && params.blockerTagToId?.size) {
    for (const upd of extraction.blocker_updates) {
      const blockerId = params.blockerTagToId.get(upd.tag.trim());
      if (!blockerId) continue;
      const { data: existing } = await admin
        .from('almog_blockers')
        .select('id, history, status')
        .eq('id', blockerId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!existing) continue;
      const row = existing as { id: string; history: BlockerHistoryEntry[] | null; status: string };
      if (row.status === 'resolved') continue; // כבר סגור — לא נוגעים
      const hist = Array.isArray(row.history) ? row.history : [];
      await admin
        .from('almog_blockers')
        .update({
          status: upd.status,
          last_checked_at: now.toISOString(),
          ...(upd.status === 'resolved' ? { next_check_at: null } : {}),
          history: [
            ...hist,
            { at: now.toISOString(), status: upd.status, ...(upd.note ? { note: upd.note } : {}) },
          ].slice(-50),
        })
        .eq('id', row.id)
        .eq('user_id', userId);
      result.blockers_updated += 1;

      // חסם שנפתר — מבטלים בדיקות התקדמות ממתינות כדי שאלמוג לא ינדנד עליו שוב.
      if (upd.status === 'resolved') {
        await admin
          .from('scheduled_reminders')
          .update({ status: 'cancelled' })
          .eq('user_id', userId)
          .eq('blocker_id', row.id)
          .eq('kind', 'check_progress')
          .eq('status', 'pending');
      }
    }
  }

  // ── מצב פוקוס ───────────────────────────────────────────────────
  if (extraction.focus?.proposed) {
    const f = extraction.focus;
    const endsAt = f.ends_at_iso ?? israelDayOffsetToUtcIso(now, 3, 20, 0);
    const { data: live } = await admin
      .from('almog_focus_periods')
      .select('id, status')
      .eq('user_id', userId)
      .in('status', ['proposed', 'active'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const willActivate = f.user_agreed;
    const payload = {
      user_id: userId,
      status: willActivate ? ('active' as const) : ('proposed' as const),
      reason: f.reason,
      paused_scope: f.scope,
      started_at: willActivate ? now.toISOString() : null,
      ends_at: endsAt,
      user_confirmed: willActivate,
      source_session_id: sessionId,
    };

    if (live) {
      await admin
        .from('almog_focus_periods')
        .update(payload)
        .eq('id', (live as { id: string }).id);
      result.focus_action = willActivate ? 'activated' : 'updated';
    } else {
      await admin.from('almog_focus_periods').insert(payload);
      result.focus_action = willActivate ? 'activated' : 'proposed';
    }
  }

  return result;
}
