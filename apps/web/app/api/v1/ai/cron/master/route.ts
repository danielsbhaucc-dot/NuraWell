export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

import { runNotificationJob } from '@/lib/notifications/scheduler';
import { createAdminClient } from '@/lib/supabase/admin';

/** Retention (data minimization) — runs after an authorized master job. Never blocks the job. */
async function runRetention(res: Response): Promise<Response> {
  if (res.status !== 200) return res;
  try {
    const includeUserContent = process.env.RETENTION_INCLUDE_USER_CONTENT === 'true';
    await createAdminClient().rpc('purge_expired_personal_data', { p_include_user_content: includeUserContent });
  } catch (err) {
    console.warn('[cron/master] retention purge failed', err);
  }
  return res;
}

/** Thin trigger — all notification decisions live in the unified scheduler. */
export async function GET(request: Request) {
  return runRetention(await runNotificationJob('master', 'GET', request));
}

export async function POST(request: Request) {
  return runRetention(await runNotificationJob('master', 'POST', request));
}
