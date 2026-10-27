export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { runNotificationJob } from '@/lib/module-api/notifications/lib-notifications-scheduler';

/** Thin trigger — all notification decisions live in the unified scheduler. */
export async function GET(request: Request) {
  return runNotificationJob('guardian', 'GET', request);
}

export async function POST(request: Request) {
  return runNotificationJob('guardian', 'POST', request);
}
