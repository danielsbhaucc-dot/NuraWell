/**
 * 🧩 Daily Action Instance — API ל"משימה של היום".
 *
 *   GET  → מחזיר את ה-instance של היום (אם קיים) ל-Dumb UI.
 *   POST → עדכון סטטוס (completed/skipped/pending). מעבר ל-completed על pivot
 *          הוא מה שה-heartbeat הבא מזהה כ-"Successful Intervention Cluster".
 */

import { NextResponse } from 'next/server';

import { requireApiSession } from '../../../../../../lib/api/route-guards';
import { createAdminClient } from '../../../../../../lib/supabase/admin';
import { israelDateKey } from '../../../../../../lib/ai/onboarding-check-in-time';
import {
  getInstanceForDate,
  setInstanceStatus,
  type DailyActionStatus,
} from '../../../../../../lib/ai/orchestrator/daily-action-instances';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;
    const admin = createAdminClient();
    const instance = await getInstanceForDate(admin, auth.user.id, israelDateKey());
    return NextResponse.json({ instance: instance ?? null });
  } catch (error) {
    console.error('[API /v1/ai/program/daily-action GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const VALID_STATUSES: DailyActionStatus[] = ['pending', 'completed', 'skipped'];

export async function POST(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    let body: { status?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const status = typeof body.status === 'string' ? (body.status as DailyActionStatus) : null;
    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: 'status must be one of pending|completed|skipped' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const instance = await setInstanceStatus(admin, auth.user.id, status);
    if (!instance) {
      return NextResponse.json({ error: 'No daily action instance for today' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, instance });
  } catch (error) {
    console.error('[API /v1/ai/program/daily-action POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
