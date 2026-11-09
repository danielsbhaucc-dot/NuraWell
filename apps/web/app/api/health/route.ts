/**
 * Release health check for the parent monitor (platform-core central.monitor_targets, kind 'health').
 * `version` is this Vercel deployment's id without the `dpl_` prefix, so the parent can tell which build
 * is serving and, after failed checks following a release, move production back to the previous READY
 * deployment and confirm it here. Runtime only on purpose: no database or AI call, so a Supabase or
 * provider blip never triggers a rollback that could not fix it. No user data, no secrets.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || null;
  const deployment = (process.env.VERCEL_DEPLOYMENT_ID || '').replace(/^dpl_/, '');
  const version = (deployment || sha || 'local').replace(/[^0-9A-Za-z.+-]/g, '').slice(0, 40) || 'local';
  return Response.json({ ok: true, product: 'nurawell', version, sha }, { headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}
