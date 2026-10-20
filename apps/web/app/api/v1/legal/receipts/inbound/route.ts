import { NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { timingSafeEqualStr } from '@/lib/api/timing-safe-equal';
import { ingestReceipt } from '@/lib/legal/media/receipts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** receipts@ email worker → here. HMAC over `${ts}.${envelopeFrom}.${raw}`, 5-minute window. */
export async function POST(request: Request) {
  const secret = process.env.RECEIPTS_INBOUND_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const ts = request.headers.get('x-nw-ts') ?? '';
  const from = request.headers.get('x-nw-envelope-from') ?? '';
  const sig = request.headers.get('x-nw-signature') ?? '';
  if (!/^\d{10}$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return NextResponse.json({ error: 'stale' }, { status: 401 });
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length > 10 * 1024 * 1024) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  const expect = createHmac('sha256', secret).update(Buffer.concat([Buffer.from(`${ts}.${from}.`), raw])).digest('hex');
  if (!timingSafeEqualStr(expect, sig)) return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  const r = await ingestReceipt(createAdminClient(), { raw, source: 'email', envelopeFrom: from });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === 'forwarder_not_allowed' ? 403 : 500 });
  return NextResponse.json({ ok: true, id: r.id, duplicate: r.duplicate });
}
