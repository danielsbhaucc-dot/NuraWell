import { NextResponse } from 'next/server';
import { timingSafeEqualStr } from '@/lib/api/timing-safe-equal';
import { runLinkTick } from '@/lib/central/product-link-tick';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Parent-platform link tick (SHADOW mode). Called by central's scheduler with `Authorization: Bearer <PLATFORM_LINK_TICK_SECRET>`.
 * Body must be empty or `{}`. Response = HTTP statuses and counts only (no data, no secrets).
 */
export async function POST(request: Request) {
  const want = process.env.PLATFORM_LINK_TICK_SECRET ?? '';
  const got = request.headers.get('authorization') ?? '';
  if (want.length < 32 || !timingSafeEqualStr(got, `Bearer ${want}`)) return NextResponse.json({ ok: false }, { status: 401 });
  const len = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(len) || len > 64) return NextResponse.json({ ok: false }, { status: 413 });
  const body = (await request.text()).trim();
  if (body !== '' && body !== '{}') return NextResponse.json({ ok: false }, { status: 400 });
  const r = await runLinkTick();
  return NextResponse.json({ ok: r.status === 'sent', ...r }, { headers: { 'cache-control': 'no-store' } });
}
