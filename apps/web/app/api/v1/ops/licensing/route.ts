// Glue only: issue/renew/revoke/reinstate/publish live in @platform/module-library-ui/server.
import { httpStatusPusher } from '@platform/licensing/online';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { decide } from '@platform/iam';
import { fileRevocationPublisher } from '@platform/licensing';
import { REGISTRY, supabaseLicenseStore, type Deps, licenseAction } from '@platform/module-library-ui/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasSensitiveStepUp } from '@/lib/ops/sensitive-stepup';
import { audit, loadActor, productsFor } from '@/lib/platform/authorize';
import { CATALOG, DEFAULT_PRODUCT } from '@/lib/platform/catalog';
import { encryptValue } from '@/lib/security/field-crypto';

const no = (error: string, status: number, extra: object = {}) => ({ response: NextResponse.json({ error, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } }) });

async function opsLicensingDeps(request: Request, bucket: string): Promise<{ deps: Deps } | { response: Response }> {
  const g = await requireApiAdmin(request);
  if (!g.ok) return { response: g.response };
  const uid = g.user.id;
  const rl = await consumeMultiRateLimits(uid, bucket, [{ limit: 20, windowSeconds: 600 }]);
  if (!rl.ok) return { response: rateLimitResponse(rl) };
  const { data: sess } = await g.supabase.auth.getSession();
  if (!(await hasSensitiveStepUp({ accessToken: sess.session?.access_token, userId: uid, req: request }))) return no('נדרש אימות נוסף.', 403, { stepUp: true, code: 'stepup_required' });
  const db = createAdminClient();
  const actor = await loadActor(db, uid);
  const allowed = productsFor(actor).founder || decide(CATALOG, actor, DEFAULT_PRODUCT, 'modules.manage').allow;
  const revFile = process.env.LICENSE_REVOCATION_FILE;
  return {
    deps: {
      registry: REGISTRY,
      root: path.resolve(process.cwd(), '../..'),
      gate: async () => (allowed ? { ok: true, actorId: uid } : { ok: false, status: 403, error: 'אין הרשאה לנהל מודולים.' }),
      audit: (kind, target, detail) => audit(db, kind, uid, null, target, detail),
      privatePem: process.env.LICENSE_SIGNING_KEY?.replace(/\\n/g, '\n') || null,
      revocationUrl: process.env.LICENSE_REVOCATION_URL || undefined,
      verifierUrl: process.env.LICENSE_VERIFIER_URL || undefined,
      verifierPublicKeyPem: process.env.LICENSE_VERIFIER_PUBLIC_KEY?.replace(/\\n/g, '\n') || undefined,
      statusPusher: process.env.LICENSE_VERIFIER_URL ? httpStatusPusher(`${process.env.LICENSE_VERIFIER_URL.replace(/\/$/, '')}/status`) : null,
      store: await supabaseLicenseStore(db),
      publisher: revFile ? fileRevocationPublisher(revFile, (p, s) => writeFile(p, s, 'utf8')) : null,
      encrypt: async (rowId, v) => String(await encryptValue('platform_licenses', 'licensee_name_enc', uid, rowId, v)),
    },
  };
}


export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const d = await opsLicensingDeps(request, 'ops-licensing');
  if ('response' in d) return d.response;
  const out = await licenseAction(d.deps, await request.json().catch(() => ({})));
  return NextResponse.json(out.body, { status: out.status, headers: { 'Cache-Control': 'no-store' } });
}
