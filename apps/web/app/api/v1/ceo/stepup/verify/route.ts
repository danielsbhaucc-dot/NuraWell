import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyStepup } from '@/lib/ceo/security';
import { decideAction } from '@/lib/ceo/actions';
import { alertOwner, limitIp, noStore } from '@/lib/ceo/stepup-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const b = z.string().regex(/^[A-Za-z0-9_-]+$/).max(4096);
const Body = z.object({ t: b, credentialId: b, clientDataJSON: b, authenticatorData: b, signature: b });

export async function POST(request: Request) {
  const limited = await limitIp(request, 'ceo-stepup-ver', 20);
  if (limited) return limited;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400, ...noStore });
  const { t, ...assertion } = p.data;
  const db = createAdminClient();
  const v = await verifyStepup(db, t, assertion, alertOwner);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 403, ...noStore });
  if (v.purpose === 'approve' && v.actionId) {
    const r = await decideAction(db, v.actionId, true, 'admin:passkey', { stepupVerified: true });
    await alertOwner(r.text);
    return NextResponse.json({ ok: r.ok, text: r.text }, noStore);
  }
  if (v.purpose === 'unlock') await alertOwner('🔓 גדעון שוחרר והופעל מחדש (אומת עם Face ID).');
  return NextResponse.json({ ok: true, text: v.purpose === 'unlock' ? 'גדעון שוחרר ופעיל.' : 'אומת.' }, noStore);
}
