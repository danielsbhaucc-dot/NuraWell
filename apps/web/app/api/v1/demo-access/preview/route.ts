import { NextResponse } from 'next/server';
import { z } from 'zod';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import {
  buildDemoPublicPreview,
  isDemoLinkUsable,
  loadDemoLinkByRawToken,
} from '@/lib/demo-access/claim';
import { buildDemoWelcomeHeadline } from '@/lib/demo-access/greeting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const querySchema = z.object({
  token: z.string().min(20).max(200),
  hour: z.coerce.number().int().min(0).max(23).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    token: url.searchParams.get('token') ?? '',
    hour: url.searchParams.get('hour') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'קישור לא תקין' }, { status: 400 });
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'anon';
  const rl = await consumeMultiRateLimits(ip, 'demo-access-preview', [
    { limit: 30, windowSeconds: 60 },
    { limit: 200, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const link = await loadDemoLinkByRawToken(parsed.data.token);
  if (!link) {
    return NextResponse.json({ error: 'קישור לא נמצא או אינו תקף.' }, { status: 404 });
  }

  const usability = isDemoLinkUsable(link);
  if (usability) {
    return NextResponse.json({ error: usability, expired: true }, { status: 410 });
  }

  const preview = await buildDemoPublicPreview(link);
  const hour = parsed.data.hour ?? new Date().getHours();

  return NextResponse.json({
    ...preview,
    headline: buildDemoWelcomeHeadline(preview.guest_name, hour),
  });
}
