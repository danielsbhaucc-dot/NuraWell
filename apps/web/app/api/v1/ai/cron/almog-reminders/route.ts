import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '../../../../../../lib/api/authorize-cron';

export const runtime = 'nodejs';
export const maxDuration = 10;
export const dynamic = 'force-dynamic';

/**
 * DEPRECATED — reminders are drained ONLY by `onboarding-check-ins` (phase=all|reminders)
 * through the unified notification system. Kept as an authorized no-op so an old QStash schedule
 * doesn't error; delete that schedule in Upstash (see docs/CRON_SCHEDULES_SETUP.md).
 */
export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed — POST only' }, { status: 405, headers: { Allow: 'POST' } });
}

export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  return NextResponse.json({
    ok: true,
    deprecated: true,
    message: 'Reminders are drained by /api/v1/ai/cron/onboarding-check-ins. Remove this QStash schedule.',
  });
}
