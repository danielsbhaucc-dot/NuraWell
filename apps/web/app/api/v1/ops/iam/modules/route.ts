import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasSensitiveStepUp } from '@/lib/ops/sensitive-stepup';
import { alertOwnerSecurity } from '@/lib/ops/device-notify';
import { loadActor, loadModuleStates, selectedProduct } from '@/lib/platform/authorize';
import { toggleModule } from '@/lib/platform/iam-admin';
import { MODULES } from '@/lib/platform/catalog';
import { REGISTRY, registryLocked } from '@platform/module-library-ui/server';

export const dynamic = 'force-dynamic';
const json = (b: unknown, s = 200) => NextResponse.json(b, { status: s, headers: { 'Cache-Control': 'no-store' } });
const Body = z.object({ productId: z.string().max(40), moduleId: z.string().max(40), enabled: z.boolean() });

export async function GET(request: Request) {
  const g = await requireApiAdmin(request);
  if (!g.ok) return g.response;
  const product = selectedProduct(request);
  const states = await loadModuleStates(createAdminClient(), product, { fresh: true });
  return json({ product, modules: MODULES.map((m) => ({ id: m.id, name: m.name, core: Boolean(m.core), dependsOn: m.dependsOn ?? [], enabled: Boolean(m.core) || states.some((s) => s.moduleId === m.id && s.enabled) })) });
}

export async function POST(request: Request) {
  const g = await requireApiAdmin(request);
  if (!g.ok) return g.response;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return json({ error: 'בקשה לא תקינה' }, 400);
  if (registryLocked(REGISTRY, p.data.moduleId, p.data.enabled)) return json({ error: 'המודול הזה תמיד פועל ואי אפשר לכבות אותו.' }, 409);
  const uid = g.user.id;
  const rl = await consumeMultiRateLimits(uid, 'ops-iam-modules', [{ limit: 30, windowSeconds: 600 }]);
  if (!rl.ok) return rateLimitResponse(rl);
  const { data: sess } = await g.supabase.auth.getSession();
  const steppedUp = await hasSensitiveStepUp({ accessToken: sess.session?.access_token, userId: uid, req: request });
  if (!steppedUp) return json({ error: 'נדרש אימות נוסף.', stepUp: true, code: 'stepup_required' }, 403);
  const db = createAdminClient();
  const out = await toggleModule(db, await loadActor(db, uid), p.data.productId, p.data.moduleId, p.data.enabled, {
    steppedUp,
    alert: async (t) => { await alertOwnerSecurity(db, uid, t, 'NuraWell: שינוי מודולים'); },
  });
  return out.ok ? json({ ok: true }) : json({ error: out.error, reason: out.reason }, out.status);
}
