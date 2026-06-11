import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiSession } from '../../../../lib/api/route-guards';
import { createAdminClient } from '../../../../lib/supabase/admin';
import type { AssignmentHistoryEntry } from '../../../../lib/ai/almog-commitments/types';

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
    action: z.enum(['confirm_focus', 'decline_focus']),
    focus_id: z.string().uuid(),
  }),
]);

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const [{ data: assignments }, { data: focus }] = await Promise.all([
    supabase
      .from('almog_assignments')
      .select(
        'id, title, reason, detail, status, schedule, given_at, due_at, last_done_at, done_count, related_habit_id'
      )
      .eq('user_id', user.id)
      .in('status', ['active', 'frozen'])
      .order('given_at', { ascending: false })
      .limit(20),
    supabase
      .from('almog_focus_periods')
      .select('id, status, reason, paused_scope, ends_at, assignment_ids')
      .eq('user_id', user.id)
      .in('status', ['proposed', 'active'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    assignments: assignments ?? [],
    focus: focus ?? null,
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
  const nowIso = new Date().toISOString();
  const data = parsed.data;

  if (data.action === 'confirm_focus' || data.action === 'decline_focus') {
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
    } else {
      await admin
        .from('almog_focus_periods')
        .update({ status: 'declined' })
        .eq('id', data.focus_id)
        .eq('user_id', user.id);
    }
    return NextResponse.json({ ok: true });
  }

  // ── פעולות על משימה אישית ──
  if (data.action !== 'done' && data.action !== 'drop' && data.action !== 'reactivate') {
    return NextResponse.json({ ok: true });
  }
  const assignmentId = data.assignment_id;
  const { data: assignment } = await admin
    .from('almog_assignments')
    .select('id, status, done_count, history, schedule')
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
  };
  const history = Array.isArray(row.history) ? row.history : [];

  if (data.action === 'done') {
    // משימה חוזרת (יומי/שבועי) נשארת פעילה; חד-פעמית עוברת ל-completed.
    const nextStatus = row.schedule === 'one_time' ? 'completed' : 'active';
    await admin
      .from('almog_assignments')
      .update({
        status: nextStatus,
        last_done_at: nowIso,
        done_count: (row.done_count ?? 0) + 1,
        history: [...history, { at: nowIso, action: 'done' }].slice(-50),
      })
      .eq('id', row.id)
      .eq('user_id', user.id);
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
