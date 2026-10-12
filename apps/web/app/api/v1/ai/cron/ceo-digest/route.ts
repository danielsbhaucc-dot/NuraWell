import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';
import { createTelegramChannel } from '@/lib/ceo/telegram';
import { periodsFor, sendDigest } from '@/lib/ceo/digest';
import { runNightlyTaskMerge } from '@/lib/almog/nightly-task-merge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function handle(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  const db = createAdminClient();
  // Nightly "Almog checks" ride on this existing 21:00 IL schedule (no extra cron). Runs before the digest.
  const almogChecks = await runNightlyTaskMerge(db).catch((e) => ({ error: String(e).slice(0, 200) }));
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) return NextResponse.json({ skipped: 'telegram not configured', almogChecks });
  const ch = createTelegramChannel();
  const out: Record<string, unknown> = { almogChecks };
  for (const p of periodsFor(new Date(), new URL(request.url).searchParams.get('period'))) out[p] = await sendDigest(db, ch, p);
  return NextResponse.json({ ok: true, ...out });
}

export const GET = handle;
export const POST = handle;
