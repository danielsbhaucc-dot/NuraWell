import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { isOpsLoginRedirectUrl } from '@/lib/ops-host';

export const runtime = 'nodejs';

const bodySchema = z.object({
  next: z.string().url(),
});

export async function POST(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = bodySchema.safeParse(raw.value);
  if (!parsed.success || !isOpsLoginRedirectUrl(parsed.data.next)) {
    return NextResponse.json({ error: 'Invalid next' }, { status: 400 });
  }

  const { supabase } = auth;
  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession();
  if (sessErr || !session?.refresh_token) {
    return NextResponse.json({ error: 'No session' }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const expires_at = new Date(Date.now() + 120_000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insErr } = await (admin as any)
    .from('ops_auth_tickets')
    .insert({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at,
    })
    .select('id')
    .single();

  if (insErr || !inserted?.id) {
    return NextResponse.json({ error: 'Ticket failed' }, { status: 500 });
  }

  const opsBase = process.env.NEXT_PUBLIC_OPS_URL?.trim();
  if (!opsBase) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_OPS_URL missing' }, { status: 500 });
  }
  const opsOrigin = opsBase.startsWith('http') ? opsBase.replace(/\/$/, '') : `https://${opsBase.replace(/\/$/, '')}`;
  const ingestUrl = `${opsOrigin}/auth/ops-ingest?t=${inserted.id as string}`;

  return NextResponse.json({ ingestUrl });
}
