import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiSession } from '../../../../lib/api/route-guards';
import { createAdminClient } from '../../../../lib/supabase/admin';
import type { AssignmentHistoryEntry } from '../../../../lib/ai/almog-commitments/types';
import {
  evaluateRecoveryGraduation,
  MICRO_SUCCESS_DAYS_BEFORE_REACTIVATE,
  scheduleRecoveryEncouragement,
  type StepDifficultyRating,
} from '../../../../lib/ai/almog-commitments/recovery-plan-engine';
import { persistRecoveryInsight } from '../../../../lib/ai/almog-commitments/persist-recovery-insight';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * API למשימות אישיות של אלמוג + תקופות פוקוס.
 *  GET  → רשימת המשימות הפעילות + תקופת פוקוס חיה (לסקשן "מאלמוג" ב-/journey).
 *  POST → המשתמש מסמן ביצוע/דחייה/החזרה, או מאשר/דוחה הצעת פוקוס.
 *
 * קריאה: דרך ה-supabase של המשתמש (RLS). כתיבה: דרך service role אחרי אימות
 * סשן, מוגבל ל-user_id של המשתמש — כדי לשמור על נעילה הדוקה של הטבלאות.
 */

const actionSchema = z.union([
  z.object({
    action: z.enum(['done', 'drop', 'reactivate']),
    assignment_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('rate_difficulty'),
    assignment_id: z.string().uuid(),
    rating: z.enum(['easy', 'ok', 'hard']),
    blocker_id: z.string().uuid().optional(),
  }),
  z.object({
    action: z.enum(['confirm_focus', 'decline_focus', 'end_focus']),
    focus_id: z.string().uuid(),
  }),
  z.object({
    action: z.enum([
      'improve_blocker',
      'resolve_blocker',
      'blocker_helped',
      'blocker_not_helped',
    ]),
    blocker_id: z.string().uuid(),
  }),
]);

type SupabaseResult = { error: { code?: string } | null };

function hasMissingTable(...results: SupabaseResult[]): boolean {
  return results.some((r) => r.error?.code === '42P01');
}

type AssignmentRow = {
  id: string;
  user_id: string;
  title: string;
  schedule: 'one_time' | 'daily' | 'weekly';
  relation: string | null;
  parent_assignment_id: string | null;
  related_step_id: string | null;
  metadata: Record<string, unknown> | null;
  history: AssignmentHistoryEntry[] | null;
  done_count: number;
};

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const [assignmentsRes, focusRes, completedRes, remindersRes, blockersRes] = await Promise.all([
    supabase
      .from('almog_assignments')
      .select(
        'id, title, reason, detail, status, schedule, given_at, due_at, last_done_at, done_count, related_habit_id, source_excerpt, relation, parent_assignment_id, history, metadata'
      )
      .eq('user_id', user.id)
      .in('status', ['active', 'frozen'])
      .order('given_at', { ascending: false })
      .limit(20),
    supabase
      .from('almog_focus_periods')
      .select('id, status, reason, paused_scope, started_at, ends_at, user_confirmed, assignment_ids')
      .eq('user_id', user.id)
      .in('status', ['proposed', 'active'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // משימות שהושלמו (חד-פעמיות) — מוצגות כ"הושלמו" כדי שיהיה תיעוד גלוי למשתמש.
    supabase
      .from('almog_assignments')
      .select('id, title, reason, detail, status, schedule, given_at, due_at, last_done_at, done_count, related_habit_id, source_excerpt')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('last_done_at', { ascending: false, nullsFirst: false })
      .limit(8),
    supabase
      .from('scheduled_reminders')
      .select('id, kind, title, body, status, fire_at, sent_at, assignment_id, blocker_id')
      .eq('user_id', user.id)
      .in('status', ['pending', 'sent'])
      .order('fire_at', { ascending: true })
      .limit(20),
    supabase
      .from('almog_blockers')
      .select('id, description, strategy, category, attempt_count, current_options, status, identified_at, last_checked_at, next_check_at, history, metadata, related_assignment_id')
      .eq('user_id', user.id)
      .in('status', ['open', 'improving'])
      .order('identified_at', { ascending: false })
      .limit(12),
  ]);

  return NextResponse.json({
    tables_ready: !hasMissingTable(assignmentsRes, focusRes, completedRes, remindersRes, blockersRes),
    assignments: assignmentsRes.data ?? [],
    focus: focusRes.data ?? null,
    completed: completedRes.data ?? [],
    reminders: remindersRes.data ?? [],
    blockers: blockersRes.data ?? [],
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const data = parsed.data;

  if (
    data.action === 'confirm_focus' ||
    data.action === 'decline_focus' ||
    data.action === 'end_focus'
  ) {
    const { data: row } = await admin
      .from('almog_focus_periods')
      .select('id, status')
      .eq('id', data.focus_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (data.action === 'confirm_focus') {
      await admin
        .from('almog_focus_periods')
        .update({ status: 'active', user_confirmed: true, started_at: nowIso })
        .eq('id', data.focus_id)
        .eq('user_id', user.id);
    } else if (data.action === 'decline_focus') {
      await admin
        .from('almog_focus_periods')
        .update({ status: 'declined' })
        .eq('id', data.focus_id)
        .eq('user_id', user.id);
    } else {
      await admin
        .from('almog_focus_periods')
        .update({ status: 'ended', ends_at: nowIso })
        .eq('id', data.focus_id)
        .eq('user_id', user.id);
    }
    return NextResponse.json({ ok: true });
  }

  if (
    data.action === 'improve_blocker' ||
    data.action === 'resolve_blocker' ||
    data.action === 'blocker_helped' ||
    data.action === 'blocker_not_helped'
  ) {
    const { data: blocker } = await admin
      .from('almog_blockers')
      .select('id, history, status')
      .eq('id', data.blocker_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!blocker) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const row = blocker as {
      id: string;
      history: { at: string; status: string; note?: string }[] | null;
      status: string;
    };
    const history = Array.isArray(row.history) ? row.history : [];

    // status חדש לפי הפעולה. "עזר" מקדם ל-improving; "לא עזר" משאיר את הסטטוס
    // הנוכחי אבל מתעד שצריך גישה אחרת — מידע יקר לאלמוג.
    const nextStatus =
      data.action === 'resolve_blocker'
        ? 'resolved'
        : data.action === 'improve_blocker' || data.action === 'blocker_helped'
          ? 'improving'
          : row.status;

    const note =
      data.action === 'resolve_blocker'
        ? 'נפתר'
        : data.action === 'blocker_helped'
          ? 'עזר לי'
          : data.action === 'blocker_not_helped'
            ? 'לא עזר — צריך גישה אחרת'
            : 'יש שיפור';

    await admin
      .from('almog_blockers')
      .update({
        status: nextStatus,
        last_checked_at: nowIso,
        ...(nextStatus === 'resolved' ? { next_check_at: null } : {}),
        history: [...history, { at: nowIso, status: nextStatus, note }].slice(-50),
      })
      .eq('id', row.id)
      .eq('user_id', user.id);

    if (nextStatus === 'resolved') {
      await admin
        .from('scheduled_reminders')
        .update({ status: 'cancelled' })
        .eq('user_id', user.id)
        .eq('blocker_id', row.id)
        .eq('kind', 'check_progress')
        .eq('status', 'pending');
    }

    return NextResponse.json({ ok: true });
  }

  // ── פעולות על משימה אישית ──
  if (data.action === 'rate_difficulty') {
    const { data: rated } = await admin
      .from('almog_assignments')
      .select(
        'id, user_id, title, schedule, relation, parent_assignment_id, related_step_id, metadata, history, done_count'
      )
      .eq('id', data.assignment_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!rated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const assignment = rated as AssignmentRow;
    const rating = data.rating as StepDifficultyRating;

    if (rating === 'hard') {
      return NextResponse.json({
        ok: true,
        pivot: true,
        message: 'בוא ננסה משהו קל יותר — פתח את כרטיס הקושי או לחץ "לא עובד".',
      });
    }

    const encouragement = await scheduleRecoveryEncouragement({
      admin,
      userId: user.id,
      assignment,
      rating,
      blockerId: data.blocker_id ?? null,
      now,
    });

    const graduation = await evaluateRecoveryGraduation({
      admin,
      userId: user.id,
      assignment,
      nowIso,
    });

    const meta = (assignment.metadata ?? {}) as Record<string, unknown>;
    await persistRecoveryInsight(admin, {
      userId: user.id,
      taskTitle: assignment.title,
      journeyTaskId: typeof meta.journey_task_id === 'string' ? meta.journey_task_id : null,
      stepId: assignment.related_step_id,
      kind: rating === 'easy' ? 'easy' : 'ok',
      strategy: assignment.title,
      outcome: 'helped',
      note: `דירוג קושי אחרי ביצוע: ${rating}`,
      blockerId: data.blocker_id ?? null,
    }).catch(() => null);

    return NextResponse.json({
      ok: true,
      encouragement,
      graduation,
    });
  }

  if (data.action !== 'done' && data.action !== 'drop' && data.action !== 'reactivate') {
    return NextResponse.json({ ok: true });
  }
  const assignmentId = data.assignment_id;
  const { data: assignment } = await admin
    .from('almog_assignments')
    .select(
      'id, status, done_count, history, schedule, relation, parent_assignment_id, title, metadata, related_step_id'
    )
    .eq('id', assignmentId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const row = assignment as {
    id: string;
    status: string;
    done_count: number;
    history: AssignmentHistoryEntry[] | null;
    schedule: string;
    relation: string | null;
    parent_assignment_id: string | null;
    title: string;
    metadata: Record<string, unknown> | null;
    related_step_id: string | null;
  };
  const history = Array.isArray(row.history) ? row.history : [];

  if (data.action === 'done') {
    // גרסה מוקלת ("eases") נשארת פעילה לכמה ימים טובים לפני שמחזירים את ההרגל המקורי.
    const nextStatus = row.schedule === 'one_time' && row.relation !== 'eases' ? 'completed' : 'active';
    const doneEntry: AssignmentHistoryEntry = { at: nowIso, action: 'done' };
    const doneHistory = [...history, doneEntry].slice(-50);
    await admin
      .from('almog_assignments')
      .update({
        status: nextStatus,
        last_done_at: nowIso,
        done_count: (row.done_count ?? 0) + 1,
        history: doneHistory,
      })
      .eq('id', row.id)
      .eq('user_id', user.id);

    if (nextStatus === 'completed') {
      await admin
        .from('scheduled_reminders')
        .update({ status: 'cancelled' })
        .eq('user_id', user.id)
        .eq('assignment_id', row.id)
        .eq('status', 'pending');
    }

    /**
     * חזרה הדרגתית: אם הצעד שבוצע היה גרסה *מקלה* — בודקים רצף הצלחות
     * ומחזירים את המשימה המקורית כשמוכנים.
     */
    const graduation = await evaluateRecoveryGraduation({
      admin,
      userId: user.id,
      assignment: {
        id: row.id,
        user_id: user.id,
        title: row.title,
        schedule: row.schedule as 'one_time' | 'daily' | 'weekly',
        relation: row.relation,
        parent_assignment_id: row.parent_assignment_id,
        related_step_id: row.related_step_id,
        metadata: row.metadata,
        history: doneHistory,
        done_count: (row.done_count ?? 0) + 1,
      },
      nowIso,
    });

    const needsRating = row.relation === 'eases' || row.parent_assignment_id !== null;

    return NextResponse.json({
      ok: true,
      needs_rating: needsRating,
      graduation,
    });
  } else if (data.action === 'drop') {
    await admin
      .from('almog_assignments')
      .update({
        status: 'dropped',
        history: [...history, { at: nowIso, action: 'dropped' }].slice(-50),
      })
      .eq('id', row.id)
      .eq('user_id', user.id);
  } else if (data.action === 'reactivate') {
    await admin
      .from('almog_assignments')
      .update({
        status: 'active',
        history: [...history, { at: nowIso, action: 'reactivated' }].slice(-50),
      })
      .eq('id', row.id)
      .eq('user_id', user.id);
  }

  return NextResponse.json({ ok: true });
}