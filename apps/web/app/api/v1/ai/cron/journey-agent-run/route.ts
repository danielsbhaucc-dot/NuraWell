import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';
import { JourneyAgent, loadAgentSession } from '@/lib/admin/journey-agent/agent';
import { formatSessionForTelegram } from '@/lib/admin/journey-agent/telegram-bridge';
import { createTelegramChannel } from '@/lib/ceo/telegram';
import { allowedChatIds } from '@/lib/ceo/channel';
import { withAiUsage } from '@/lib/ai/usage-meter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Background run of the journey agent for Gideon/Telegram (QStash-signed). Reports back on Telegram. */
export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  const body = z.object({ sessionId: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'bad body' }, { status: 400 });
  const db = createAdminClient();
  const s = await loadAgentSession(db, body.data.sessionId);
  if (!s) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (s.status === 'done' || s.status === 'waiting') return NextResponse.json({ skipped: s.status });
  const out = await withAiUsage({ feature: 'journey_agent' }, () => new JourneyAgent(db, s).run());
  const text = formatSessionForTelegram(out);
  const ch = createTelegramChannel();
  for (const c of allowedChatIds()) await ch.send(c, text, undefined, { kind: 'report', topic: 'agent_report' }).catch(() => {});
  return NextResponse.json({ ok: true, status: out.status });
}
