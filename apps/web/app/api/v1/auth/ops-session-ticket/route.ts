import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { isOpsLoginRedirectUrl } from '@/lib/ops-host';
import { createServiceSupabaseAdmin } from '@/lib/supabase/service-admin-client';
import {
  assertSupabaseBackendSecretKey,
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
  const serviceKey = normalizeServiceRoleKeyEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
  );
  if (!serviceKey || !url) {
    return NextResponse.json(
      {
        error:
          'חסר NEXT_PUBLIC_SUPABASE_URL או מפתח שרת (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY) ב-Vercel',
      },
      { status: 500 },
    );
  }

  const keyCheck = assertSupabaseBackendSecretKey(serviceKey, url);
  if (!keyCheck.ok) {
    return NextResponse.json({ error: keyCheck.message }, { status: 500 });
  }

  const expires_at = new Date(Date.now() + 120_000).toISOString();
  const admin = createServiceSupabaseAdmin(url, serviceKey);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc('insert_ops_auth_ticket', {
    p_access_token: session.access_token,
    p_refresh_token: session.refresh_token,
    p_expires_at: expires_at,
  });

  if (error) {
    console.error('[ops-session-ticket] rpc', error.message, error.code, error.details, error.hint);
    const msg = error.message || 'RPC failed';
    const hint =
      msg.toLowerCase().includes('invalid api key') || msg.includes('401')
        ? ' עדכון SUPABASE_SERVICE_ROLE_KEY ב-Vercel לא מנתק את מסד הנתונים ולא משנה את Supabase — רק מתקן מה שהשרת שולח. אל תלחץ Rotate ב-Supabase אלא אם בכוונה מחליפים מפתח בכל המערכת. השווה לטאב Legacy: הערך חייב להיות בדיוק ה-service_role (JWT) או sb_secret ב-SUPABASE_SECRET_KEY, בלי רווח או שורה בסוף.'
        : '';
    return NextResponse.json(
      {
        error: `${msg}.${hint}`,
        code: error.code,
      },
      { status: 500 },
    );
  }

  const insertedId = typeof data === 'string' ? data : null;
  if (!insertedId || !z.string().uuid().safeParse(insertedId).success) {
    return NextResponse.json({ error: 'Ticket failed: unexpected RPC response', detail: data }, { status: 500 });
  }

  const opsBase = process.env.NEXT_PUBLIC_OPS_URL?.trim();
  if (!opsBase) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_OPS_URL missing' }, { status: 500 });
  }
  const opsOrigin = opsBase.startsWith('http') ? opsBase.replace(/\/$/, '') : `https://${opsBase.replace(/\/$/, '')}`;
  const ingestUrl = `${opsOrigin}/auth/ops-ingest?t=${insertedId}`;

  return NextResponse.json({ ingestUrl });
}
