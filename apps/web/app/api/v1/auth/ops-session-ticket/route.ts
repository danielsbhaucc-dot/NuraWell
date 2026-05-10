import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { isOpsLoginRedirectUrl } from '@/lib/ops-host';
import { assertServiceRoleKey } from '@/lib/supabase/service-role-jwt';

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

  const serviceKeyRaw = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = serviceKeyRaw?.trim();
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

  const expires_at = new Date(Date.now() + 120_000).toISOString();
  const restUrl = `${url.replace(/\/$/, '')}/rest/v1/ops_auth_tickets`;
  const insRes = await fetch(restUrl, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at,
    }),
  });

  const insBody = (await insRes.json().catch(() => null)) as unknown;
  if (!insRes.ok) {
    const msg =
      typeof insBody === 'object' && insBody !== null && 'message' in insBody
        ? String((insBody as { message: unknown }).message)
        : insRes.statusText;
    console.error('[ops-session-ticket] insert', insRes.status, msg, insBody);
    return NextResponse.json(
      {
        error:
          insRes.status === 401
            ? 'Supabase דחה את מפתח ה-service_role (401). ודא שהמיגרציה ops_auth_tickets רצה ושב-Vercel מוגדר Service role המלא מלוח הבקרה.'
            : `Ticket failed: ${msg}`,
        status: insRes.status,
      },
      { status: 500 },
    );
  }

  const rows = Array.isArray(insBody) ? insBody : null;
  const inserted = rows?.[0] as { id?: string } | undefined;
  if (!inserted?.id) {
    return NextResponse.json({ error: 'Ticket failed: no id returned' }, { status: 500 });
  }

  const opsBase = process.env.NEXT_PUBLIC_OPS_URL?.trim();
  if (!opsBase) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_OPS_URL missing' }, { status: 500 });
  }
  const opsOrigin = opsBase.startsWith('http') ? opsBase.replace(/\/$/, '') : `https://${opsBase.replace(/\/$/, '')}`;
  const ingestUrl = `${opsOrigin}/auth/ops-ingest?t=${inserted.id}`;

  return NextResponse.json({ ingestUrl });
}
