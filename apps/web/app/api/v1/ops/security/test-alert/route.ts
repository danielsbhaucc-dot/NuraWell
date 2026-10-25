import { NextResponse } from 'next/server';
import { consumeRateLimit, rateLimitResponse } from '@/lib/api/rate-limit';
import { alertOwnerSecurity } from '@/lib/ops/device-notify';
import { investigateLink } from '@/lib/logs/signals';
import { fail, NO_STORE, requireIrAdmin } from '@/lib/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One real test alert through the same path as log/storage alerts (Telegram + email). Max 1 per 10 min. */
export async function POST(request: Request) {
  const g = await requireIrAdmin(request);
  if (!g.ok) return g.response;
  const rl = await consumeRateLimit({ key: g.actor.userId, namespace: 'ops-ir-test-alert', limit: 1, windowSeconds: 600 });
  if (!rl.ok) return rateLimitResponse(rl, 'אפשר לשלוח התראת בדיקה אחת כל 10 דקות.');
  const d = await alertOwnerSecurity(g.db, null, '🧪 התראת בדיקה ממסך היומנים.\nאם קיבלת את זה גם בטלגרם וגם במייל, ההתראות עובדות. אין צורך לעשות כלום.', 'התראת בדיקה: אבטחה', { emailLink: { href: investigateLink({}), label: 'פתח את מסך היומנים' }, purpose: 'security_test_alert' }).catch(() => null);
  if (!d) return fail(500, 'השליחה נכשלה');
  await g.db.from('admin_audit_log').insert({ actor_id: g.actor.userId, method: 'SECURITY', path: 'ir.test_alert', detail: { telegram: d.telegram, email: d.email, session: g.actor.sessionId, ip_hash: g.actor.ipHash } }).then(() => undefined, () => undefined);
  return NextResponse.json({ ok: d.telegram > 0 && d.email > 0, telegram: d.telegram, email: d.email }, { headers: NO_STORE });
}
