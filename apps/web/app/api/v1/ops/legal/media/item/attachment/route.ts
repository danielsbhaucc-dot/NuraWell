import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { addAttachment } from '@/lib/legal/media/provenance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MIMES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/html', 'message/rfc822'];
const body = z.object({ key: z.string().min(3).max(400), name: z.string().min(1).max(200), mime: z.enum(MIMES as [string, ...string[]]), label: z.string().min(1).max(120), data_b64: z.string().min(4).max(11_000_000) }).strict();

/** Receipt / invoice / screenshot of the generator page. Stored content-addressed, recorded + timestamped. */
export async function POST(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const p = body.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'bad_input' }, { status: 400 });
  const r = await addAttachment(createAdminClient(), p.data.key, { bytes: Buffer.from(p.data.data_b64, 'base64'), name: p.data.name, mime: p.data.mime, label: p.data.label }, { id: auth.user.id });
  return NextResponse.json(r, { status: r.ok ? 200 : r.error === 'not_found' ? 404 : r.error === 'too_large' ? 413 : 500 });
}
