import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeRateLimit, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasSensitiveStepUp } from '@/lib/ops/sensitive-stepup';
import { opsSetIdentity } from '@/lib/ceo/telegram-verify';
import { alertOwner } from '@/lib/ceo/stepup-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

/** Admin-only list of extra Telegram identities. Never returns code hashes/salts. */
export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const { data } = await createAdminClient()
    .from('gideon_telegram_identities')
    .select('from_id, status, expires_at, attempts, created_at, decided_at, decided_by, reason')
    .order('created_at', { ascending: false })
    .limit(100);
  const now = Date.now();
  const rows = ((data ?? []) as Array<Record<string, unknown> & { status: string; expires_at: string | null }>).map((r) => ({
    ...r,
    // an expired pending row is effectively blocked (it is finalized on the next message)
    status: r.status === 'pending' && r.expires_at && Date.parse(r.expires_at) <= now ? 'expired' : r.status,
  }));
  return NextResponse.json({ identities: rows }, { headers: NO_STORE });
}

const Body = z.object({ action: z.enum(['allow', 'block', 'unblock']), from_id: z.string().regex(/^\d{1,20}$/) });

/** allow / unblock raise privileges → require the sensitive step-up (Face ID / QR from #269). Block never does. */
export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const rl = await consumeRateLimit({ key: auth.user.id, namespace: 'ops-tg-identity', limit: 20, windowSeconds: 600 });
  if (!rl.ok) return rateLimitResponse(rl);
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const p = Body.safeParse(raw.value);
  if (!p.success) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400, headers: NO_STORE });
  if (p.data.action !== 'block') {
    const { data: sess } = await auth.supabase.auth.getSession();
    const ok = await hasSensitiveStepUp({ accessToken: sess.session?.access_token, userId: auth.user.id, req: request });
    if (!ok) return NextResponse.json({ error: 'stepup_required', stepUp: true }, { status: 403, headers: NO_STORE });
  }
  const done = await opsSetIdentity(createAdminClient(), p.data.from_id, p.data.action, `admin:${auth.user.id}`);
  if (!done) return NextResponse.json({ error: 'הפעולה לא התאפשרה (אולי כבר טופלה).' }, { status: 409, headers: NO_STORE });
  const tail = p.data.from_id.slice(-4);
  const msg = { allow: `✅ אישרת מ-Ops חשבון טלגרם (מסתיים ב-${tail}). הוא נוסף לגדעון.`, block: `🚫 חסמת מ-Ops חשבון טלגרם (מסתיים ב-${tail}).`, unblock: `🔓 שחררת מ-Ops חסימה של חשבון טלגרם (מסתיים ב-${tail}). בהודעה הבאה שלו יתחיל אימות מחדש.` }[p.data.action];
  await alertOwner(msg).catch(() => {});
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
