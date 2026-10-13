import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { withAiUsage } from '@/lib/ai/usage-meter';
import { applyAdminInput, createAgentSession, JourneyAgent, loadAgentSession, type AgentEvent } from '@/lib/admin/journey-agent/agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), sourceText: z.string().min(40).max(60_000), stepId: z.string().uuid().nullish() }),
  z.object({ action: z.literal('answer'), sessionId: z.string().uuid(), answers: z.record(z.string(), z.string().max(12_000)).default({}), comment: z.string().max(4000).optional() }),
]);

/** GET ?id= — session snapshot (reload / Telegram follow-up). */
export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const s = await loadAgentSession(createAdminClient(), id);
  return s ? NextResponse.json({ session: s }) : NextResponse.json({ error: 'not found' }, { status: 404 });
}

/** POST — start or continue the agent; streams NDJSON AgentEvents live. */
export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const rl = await consumeMultiRateLimits(auth.user.id, 'journey-agent', [
    { limit: 10, windowSeconds: 60 },
    { limit: 120, windowSeconds: 86_400 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = Body.safeParse(raw.value);
  if (!parsed.success) return NextResponse.json({ error: 'צריך טקסט מקור (לפחות 40 תווים) או תשובה לסשן קיים' }, { status: 400 });

  const db = createAdminClient();
  let session;
  if (parsed.data.action === 'start') {
    session = await createAgentSession(db, { createdBy: `admin:${auth.user.id}`, sourceText: parsed.data.sourceText.trim(), stepId: parsed.data.stepId ?? null });
  } else {
    const s = await loadAgentSession(db, parsed.data.sessionId);
    if (!s) return NextResponse.json({ error: 'הסשן לא נמצא' }, { status: 404 });
    if (s.status === 'working') return NextResponse.json({ error: 'הסוכן עדיין עובד על הסשן הזה' }, { status: 409 });
    session = applyAdminInput(s, { answers: parsed.data.answers, comment: parsed.data.comment });
  }

  const encoder = new TextEncoder();
  const sid = session.id;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AgentEvent | { type: 'session'; sessionId: string }) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          /* client went away — the agent keeps going and persists */
        }
      };
      send({ type: 'session', sessionId: sid });
      await withAiUsage({ feature: 'journey_agent', userId: auth.user.id }, () => new JourneyAgent(db, session, send).run());
      try {
        controller.close();
      } catch {
        /* closed */
      }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' },
  });
}
