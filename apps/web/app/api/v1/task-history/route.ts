import { NextResponse } from 'next/server';

import { requireApiSession } from '../../../../lib/api/route-guards';
import {
  buildTaskHistoryReport,
  type TaskHistoryRange,
} from '../../../../lib/journey/build-task-history';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const ALLOWED_RANGES: ReadonlyArray<TaskHistoryRange> = [
  'day',
  'week',
  'month',
  'year',
  'custom',
  'all',
];

/**
 * GET /api/v1/task-history
 *
 * Query params (כולם אופציונליים):
 *   - range: day | week | month | year | custom | all (ברירת מחדל: month)
 *   - from:  YYYY-MM-DD (חובה כש-range='custom')
 *   - to:    YYYY-MM-DD (אופציונלי גם ל-custom — ברירת מחדל היום)
 *
 * תגובה:
 *   {
 *     meta: { range, from, to, days_in_range, label },
 *     total_accepted_lifetime, total_executions_in_range, active_days_in_range,
 *     overall_success_rate_pct, tasks: [...], rejected_tasks: [...]
 *   }
 *
 * RLS על journey_progress / journey_task_executions ⇒ המשתמש רואה רק את עצמו.
 * מיועד לשימוש ב-UI מובייל-פרסט (`/progress/history`) וב-AI/Agents (כקריאה בלבד).
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const rawRange = url.searchParams.get('range') ?? 'month';
    const range = (ALLOWED_RANGES as ReadonlyArray<string>).includes(rawRange)
      ? (rawRange as TaskHistoryRange)
      : 'month';
    const from = url.searchParams.get('from') ?? undefined;
    const to = url.searchParams.get('to') ?? undefined;

    const report = await buildTaskHistoryReport(auth.supabase, auth.user.id, {
      range,
      from: from ?? undefined,
      to: to ?? undefined,
    });

    return NextResponse.json(report, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('task-history GET exception:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
