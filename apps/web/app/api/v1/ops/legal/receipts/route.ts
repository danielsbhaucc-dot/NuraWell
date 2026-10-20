import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { uploadReceiptFile } from '@/lib/legal/media/receipts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const { data, error } = await createAdminClient().from('media_receipts').select('id, source, vendor, plan, amount, currency, receipt_date, period_start, period_end, subject, original_from, forwarder_ok, dkim, spf, trust, attachments, confirmation_code, record_hash, created_at').order('created_at', { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  return NextResponse.json({ receipts: data ?? [], address: process.env.RECEIPTS_INBOUND_ADDRESS ?? 'receipts@nurawell.ai', configured: !!process.env.RECEIPTS_INBOUND_SECRET && !!process.env.RECEIPTS_ALLOWED_FORWARDERS }, { headers: { 'Cache-Control': 'no-store' } });
}

const d = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional();
const body = z.object({ name: z.string().min(1).max(200), mime: z.string().max(120), data_b64: z.string().min(4).max(11_000_000),
  vendor: z.string().max(40).optional(), plan: z.string().max(120).nullable().optional(), receipt_date: d, period_start: d, period_end: d,
  amount: z.number().nullable().optional(), currency: z.string().max(5).nullable().optional() }).strict();

export async function POST(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const p = body.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'bad_input' }, { status: 400 });
  const x = p.data;
  const r = await uploadReceiptFile(createAdminClient(), { name: x.name, mime: x.mime || 'application/pdf', bytes: Buffer.from(x.data_b64, 'base64') },
    { vendor: x.vendor ?? 'unknown', plan: x.plan ?? null, receipt_date: x.receipt_date ?? null, period_start: x.period_start ?? x.receipt_date ?? null, period_end: x.period_end ?? null, amount: x.amount ?? null, currency: x.currency ?? null }, auth.user.id);
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
