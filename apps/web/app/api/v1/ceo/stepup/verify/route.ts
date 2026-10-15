import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createStepupLink, verifyStepup } from '@/lib/ceo/security';
import { issueRecoveryCodes } from '@/lib/ceo/recovery';
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
  if (v.grant === 'register' && v.userId) {
    // existing key verified → hand out a registration link for the new device
    return NextResponse.json({ ok: true, text: 'אומת. עובר לרישום המפתח החדש…', redirect: await createStepupLink(db, 'register', { userId: v.userId }) }, noStore);
  }
  if (v.grant === 'recovery' && v.userId) {
    const codes = await issueRecoveryCodes(db, v.userId);
    await alertOwner('🔑 נוצרו קודי שחזור חדשים לגדעון (הקודמים בוטלו).');
    return NextResponse.json({ ok: true, text: 'קודי שחזור חדשים (מוצגים פעם אחת בלבד):', recoveryCodes: codes }, noStore);
  }
  if (v.purpose === 'settings') await alertOwner('🔐 הגדרות האבטחה של גדעון שונו (אומת עם Face ID).');
  if (v.purpose === 'remove_key') await alertOwner('🔑 מפתח Face ID הוסר מגדעון (אומת עם Face ID).');
  if (v.purpose === 'unlock') await alertOwner('🔓 גדעון שוחרר והופעל מחדש (אומת עם Face ID).');
  const text = v.purpose === 'unlock' ? 'גדעון שוחרר ופעיל.' : v.purpose === 'settings' ? 'ההגדרות נשמרו.' : v.purpose === 'remove_key' ? 'המפתח הוסר.' : 'אומת.';
  return NextResponse.json({ ok: true, text }, noStore);
}
