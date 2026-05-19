import { z } from 'zod';
import { readJsonBody } from '../../../../../lib/api/json-request';
import { requireApiSession } from '../../../../../lib/api/route-guards';
import { updateAiContext } from '../../../../../lib/ai/memory';
import type { WebPushStored } from '../../../../../lib/push/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const subSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(10),
    auth: z.string().min(10),
  }),
});

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = subSchema.safeParse(raw.value);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid subscription' }, { status: 400 });
  }

  const stored: WebPushStored = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  };

  await updateAiContext(auth.supabase, auth.user.id, {
    web_push: stored,
  });

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  await updateAiContext(auth.supabase, auth.user.id, {
    web_push: null,
  });

  return Response.json({ ok: true });
}

export async function GET() {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? null;
  return Response.json({ configured: Boolean(publicKey), publicKey });
}
