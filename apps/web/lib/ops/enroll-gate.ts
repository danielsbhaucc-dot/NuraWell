/** Pure routing decision for the hidden-admin pre-login gate (OPS_ENROLL_ONLY). Unit-tested. */
export const ENROLL_PREFIX = '/k/';
export function enrollOnly(env: NodeJS.ProcessEnv = process.env): boolean { return env.OPS_ENROLL_ONLY === 'on'; }
/** Admin reachable only on the ops host (no /ops fallback on the app host). Prepared, off by default. */
export function adminHostOnly(env: NodeJS.ProcessEnv = process.env): boolean { return env.OPS_ADMIN_HOST_ONLY === 'on'; }
/** Paths that must stay reachable without an enrolled device. Everything else on the admin surface → plain 404. */
export function exemptFromDeviceGate(pathname: string): boolean {
  return pathname.startsWith(ENROLL_PREFIX) || pathname === '/k' || pathname.startsWith('/api/') || pathname.startsWith('/_next/') ||
    pathname === '/__nf' || pathname === '/gideon' || pathname.startsWith('/gideon/');
}
