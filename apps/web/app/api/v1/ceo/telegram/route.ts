import { after, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createTelegramChannel } from '@/lib/ceo/telegram';
import { handleTelegramUpdate, verifyTelegramSecret } from '@/lib/ceo/webhook';
import { reportError } from '@/lib/monitoring/report-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Telegram webhook for the AI CEO. Answers 200 immediately (no Telegram retries), works in after(). */
export async function POST(request: Request) {
  if (!verifyTelegramSecret(request.headers.get('x-telegram-bot-api-secret-token'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const update = await request.json().catch(() => null);
  if (!update) return NextResponse.json({ ok: true });
  after(async () => {
    try {
      await handleTelegramUpdate(createAdminClient(), createTelegramChannel(), update);
    } catch (e) {
      await reportError(e, { source: 'ceo-telegram' }).catch(() => {});
    }
  });
  return NextResponse.json({ ok: true });
}
