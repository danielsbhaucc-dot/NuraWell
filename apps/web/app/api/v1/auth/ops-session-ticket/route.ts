import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { isOpsLoginRedirectUrl } from '@/lib/ops-host';
import {
  assertServiceRoleKey,
  assertServiceRoleMatchesProjectUrl,
  normalizeServiceRoleKeyEnv,
} from '@/lib/supabase/service-role-jwt';

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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = normalizeServiceRoleKeyEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!serviceKey || !url) {
    return NextResponse.json(
      { error: 'חסר SUPABASE_SERVICE_ROLE_KEY או NEXT_PUBLIC_SUPABASE_URL ב-Vercel' },
      { status: 500 },
    );
  }

  const keyCheck = assertServiceRoleKey(serviceKey);
  if (!keyCheck.ok) {
    return NextResponse.json({ error: keyCheck.message }, { status: 500 });
  }

  const refCheck = assertServiceRoleMatchesProjectUrl(serviceKey, url);
  if (!refCheck.ok) {
    return NextResponse.json({ error: refCheck.message }, { status: 500 });
  }

  const expires_at = new Date(Date.now() + 120_000).toISOString();
  const base = url.replace(/\/$/, '');
  const rpcUrl = `${base}/rest/v1/rpc/insert_ops_auth_ticket`;

  const insRes = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_access_token: session.access_token,
      p_refresh_token: session.refresh_token,
      p_expires_at: expires_at,
    }),
  });

  const insBody = (await insRes.json().catch(() => null)) as unknown;
  if (!insRes.ok) {
    const msg =
      typeof insBody === 'object' && insBody !== null && 'message' in insBody
        ? String((insBody as { message: unknown }).message)
        : insRes.statusText;
    const hint =
      typeof insBody === 'object' && insBody !== null && 'hint' in insBody
        ? String((insBody as { hint: unknown }).hint)
        : '';
    console.error('[ops-session-ticket] rpc insert', insRes.status, msg, hint, insBody);
    return NextResponse.json(
      {
        error:
          insRes.status === 401
            ? `Supabase דחה את הבקשה (401). ${msg}${hint ? ` — ${hint}` : ''} אם הודעת ref כבר עברה, הרץ מיגרציה 000009 (פונקציות RPC) ב-Supabase.`
            : `Ticket failed: ${msg}`,
        code: insRes.status,
      },
      { status: 500 },
    );
  }

  const insertedId = typeof insBody === 'string' ? insBody : null;

  if (!insertedId || !z.string().uuid().safeParse(insertedId).success) {
    return NextResponse.json({ error: 'Ticket failed: unexpected RPC response', detail: insBody }, { status: 500 });
  }

  const opsBase = process.env.NEXT_PUBLIC_OPS_URL?.trim();
  if (!opsBase) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_OPS_URL missing' }, { status: 500 });
  }
  const opsOrigin = opsBase.startsWith('http') ? opsBase.replace(/\/$/, '') : `https://${opsBase.replace(/\/$/, '')}`;
  const ingestUrl = `${opsOrigin}/auth/ops-ingest?t=${insertedId}`;

  return NextResponse.json({ ingestUrl });
}
