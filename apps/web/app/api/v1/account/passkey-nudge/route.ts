import { requireApiSession } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { isDemoAccessActiveForUser } from '@/lib/demo-access/server';
import { listPasskeys } from '@/lib/auth/passkeys';
import { json, readBody } from '@/lib/auth/http';
import { isPasskeyNudgeEnabled, nudgeEligible, type NudgeState } from '@/lib/auth/passkey-nudge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function ctx(req: Request) {
  const auth = await requireApiSession(req);
  if (!auth.ok) return null;
  const db = createAdminClient();
  const uid = auth.user.id;
  const [{ data: prof }, keys, { data: st }, demo] = await Promise.all([
    db.from('profiles').select('role').eq('id', uid).maybeSingle(),
    listPasskeys(db, uid),
    db.from('passkey_nudge_state').select('shown_count, last_shown_at, last_outcome').eq('user_id', uid).maybeSingle(),
    isDemoAccessActiveForUser(uid),
  ]);
  const state = (st as NudgeState) ?? null;
  const eligible = nudgeEligible({ isAdmin: (prof as { role?: string } | null)?.role === 'admin', isDemo: Boolean(demo), passkeyCount: keys.length, state });
  return { db, uid, state, eligible };
}

export async function GET(req: Request): Promise<Response> {
  if (!isPasskeyNudgeEnabled()) return json({ eligible: false });
  const c = await ctx(req);
  return json({ eligible: Boolean(c?.eligible) });
}

/** action: 'shown' (counts toward the cap + starts the 30-day cooldown) | 'dismissed' | 'enrolled' */
export async function POST(req: Request): Promise<Response> {
  if (!isPasskeyNudgeEnabled()) return json({ ok: true });
  const c = await ctx(req);
  if (!c) return json({ error: 'unauthorized' }, 401);
  const action = (await readBody(req, 500))?.action;
  if (action !== 'shown' && action !== 'dismissed' && action !== 'enrolled') return json({ error: 'bad_request' }, 400);
  if (action === 'shown' && !c.eligible) return json({ ok: false });
  const now = new Date().toISOString();
  await c.db.from('passkey_nudge_state').upsert({
    user_id: c.uid,
    shown_count: (c.state?.shown_count ?? 0) + (action === 'shown' ? 1 : 0),
    last_shown_at: action === 'shown' ? now : (c.state?.last_shown_at ?? now),
    last_outcome: action,
    updated_at: now,
  });
  return json({ ok: true });
}
