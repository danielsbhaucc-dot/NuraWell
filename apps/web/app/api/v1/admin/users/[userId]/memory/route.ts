import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  deleteUserMemoryVectorById,
  isUpstashVectorConfigured,
  listUserMemoryVectors,
} from '@/lib/ai/upstash-vector-rest';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const { userId } = await context.params;

  if (!isUpstashVectorConfigured()) {
    return NextResponse.json({
      items: [],
      configured: false,
      message: 'אינדקס זיכרון משתמש לא מוגדר',
    });
  }

  try {
    const items = await listUserMemoryVectors(userId);
    return NextResponse.json({ items, configured: true, total: items.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'שגיאת שליפה';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const deleteBodySchema = z.object({
  id: z.string().min(1),
});

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  if (!isUpstashVectorConfigured()) {
    return NextResponse.json({ error: 'אינדקס זיכרון לא מוגדר' }, { status: 500 });
  }

  const { userId } = await context.params;
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = deleteBodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  }

  const items = await listUserMemoryVectors(userId);
  const owned = items.some((i) => i.id === parsed.data.id);
  if (!owned) {
    return NextResponse.json({ error: 'פריט לא נמצא למשתמש זה' }, { status: 404 });
  }

  try {
    await deleteUserMemoryVectorById(parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'שגיאת מחיקה';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
