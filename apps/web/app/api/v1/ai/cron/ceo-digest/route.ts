import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';
import { createTelegramChannel } from '@/lib/ceo/telegram';
import { periodsFor, sendDigest } from '@/lib/ceo/digest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function handle(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) return NextResponse.json({ skipped: 'telegram not configured' });
  const db = createAdminClient();
  const ch = createTelegramChannel();
  const out: Record<string, unknown> = {};
  for (const p of periodsFor(new Date(), new URL(request.url).searchParams.get('period'))) out[p] = await sendDigest(db, ch, p);
  return NextResponse.json({ ok: true, ...out });
}

export const GET = handle;
export const POST = handle;
