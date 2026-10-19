import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';
import { createTelegramChannel } from '@/lib/ceo/telegram';
import { flushOutbox, scheduleFlush } from '@/lib/ceo/outbound';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** QStash, scheduled for 1 minute after each quiet window ends (Shabbat → after tzeit). Idempotent. */
async function handle(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  const ch = createTelegramChannel();
  const r = await flushOutbox(createAdminClient(), (c, t, b) => ch.send(c, t, b, { kind: 'outbox' }));
  // still quiet (e.g. Shabbat followed by a quiet window) → try again when that one ends
  if (r.quietUntil) await scheduleFlush(new Date(r.quietUntil)).catch(() => null);
  return NextResponse.json(r);
}

export const POST = handle;
export const GET = handle;
