export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

import { runNotificationJob } from '@/lib/notifications/scheduler';

/** Thin trigger — all notification decisions live in the unified scheduler. */
export async function GET(request: Request) {
  return runNotificationJob('habit-checkpoints', 'GET', request);
}

export async function POST(request: Request) {
  return runNotificationJob('habit-checkpoints', 'POST', request);
}
