import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiSession } from '@/lib/api/route-guards';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { readJsonBody } from '@/lib/api/json-request';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteUserAccountCompletely } from '@/lib/privacy/delete-user-account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const deleteSchema = z.object({
  confirm_email: z.string().email('אימייל לא תקין'),
});

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'account-delete', [
    { limit: 3, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = deleteSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'נא לאשר את כתובת האימייל שלך' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(auth.user.id);
  const email = authUser.user?.email?.trim().toLowerCase();
  if (!email || email !== parsed.data.confirm_email.trim().toLowerCase()) {
    return NextResponse.json(
      { error: 'כתובת האימייל לא תואמת לחשבון. הזן/י את האימייל המדויק.' },
      { status: 400 }
    );
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (profile?.role === 'admin') {
    return NextResponse.json(
      { error: 'מחיקת חשבון מנהל אינה זמינה דרך האפליקציה. פנה/י לתמיכה.' },
      { status: 403 }
    );
  }

  const result = await deleteUserAccountCompletely(admin, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, vectorsRemoved: result.vectorsRemoved });
}
