import { NextResponse } from 'next/server';
import { timingSafeEqualStr } from '@/lib/api/timing-safe-equal';
import { runLinkTick, shouldRunHeavyLinkTick } from '@/lib/central/product-link-tick';
import { pushClaims } from '@/lib/central/push-claims';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MIN_BEARER_LENGTH = 32;
const MAX_BODY_BYTES = 64;

const authorized = (request: Request): boolean => {
  const expected = process.env.PLATFORM_LINK_TICK_SECRET ?? '';
  const header = request.headers.get('authorization') ?? '';
  return expected.length >= MIN_BEARER_LENGTH && timingSafeEqualStr(header, `Bearer ${expected}`);
}

const bodyIsEmpty = async (request: Request): Promise<boolean> => {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(declared) || declared > MAX_BODY_BYTES) return false;
  const text = (await request.text()).trim();
  return text === '' || text === '{}';
}

/**
 * Parent-platform link tick (SHADOW mode). Called by central's scheduler with `Authorization: Bearer <PLATFORM_LINK_TICK_SECRET>`.
 * Body must be empty or `{}`. Response = HTTP statuses and counts only (no data, no secrets).
 */
// skipcq: JS-0067 -- Next.js route handler export, not a global
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false }, { status: 401 });
  if (!(await bodyIsEmpty(request))) return NextResponse.json({ ok: false }, { status: 400 });
  const nowMs = Date.now();
  const result = await runLinkTick(process.env, fetch, nowMs);
  const claims = result.heavy || shouldRunHeavyLinkTick(nowMs, process.env)
    ? await pushClaims()
    : { sent: 0, applied: 0 };
  console.log('[link-tick]', JSON.stringify({ heavy: result.heavy, heartbeat: result.heartbeat, usage: result.usage, decisions: result.decisions, claims })); // skipcq: JS-0002 -- server-only counts, no values
  return NextResponse.json({ ok: result.status === 'sent', ...result, claims }, { headers: { 'cache-control': 'no-store' } });
}
