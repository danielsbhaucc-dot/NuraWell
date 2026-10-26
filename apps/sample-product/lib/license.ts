// The sample product's link to the central control plane:
//  1. register this instance (opaque id + sha256 of the host; no secrets, no PII),
//  2. hold a signed license token (valid until the next billing date + 3 grace days, renewed on payment),
//  3. poll the signed status file every ~2 minutes for block/unblock,
//  4. fail closed: if the status file can't be verified for more than 6 hours, the product locks itself.
import { createHash, randomBytes } from 'node:crypto';
import { createLicenseGuard, type GuardStatus, type RevocationList } from '@platform/licensing';
import { PRODUCT_ID } from './platform';

export const SAMPLE_MODULE_ID = 'sample-product';
export const SAMPLE_VERSION = '0.1.0';

type Rpc = { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };

export const newInstanceId = () => `ins_${randomBytes(12).toString('base64url')}`;

/** Registers this running copy with the central control plane. Throws (fails closed) when central refuses. */
export async function registerWithControlPlane(central: Rpc, a: { instanceId: string; host: string }) {
  const { data, error } = await central.rpc('central_register_instance', {
    p_product: PRODUCT_ID, p_instance: a.instanceId, p_host_sha256: createHash('sha256').update(a.host.toLowerCase()).digest('hex'),
  });
  if (error) throw new Error('control_plane_refused');
  return data as { instanceId: string; productStatus: string };
}

export type SampleLicenseConfig = {
  licenseToken: string;
  publicKeyPem: string;
  statusUrl: string;
  host: string;
  fetch: (url: string) => Promise<unknown>;
  cache?: { get(): Promise<RevocationList | null> | RevocationList | null; set(l: RevocationList): Promise<void> | void };
  now?: () => Date;
};

/** Everything the product needs: `status()` before serving, `run()` to wrap a feature. Never throws into the app. */
export function createSampleLicense(c: SampleLicenseConfig) {
  return createLicenseGuard({
    moduleId: SAMPLE_MODULE_ID, version: SAMPLE_VERSION, publicKeyPem: c.publicKeyPem, licenseToken: c.licenseToken,
    host: c.host, revocationUrl: c.statusUrl, fetch: c.fetch, cache: c.cache, now: c.now,
    pollMinutes: 2, graceHours: 6,
  });
}

/** From env (server-side only). Missing anything → locked, never "open by default". */
export function sampleLicenseFromEnv(env: Record<string, string | undefined> = process.env): { status(): Promise<GuardStatus> } {
  const token = env.SAMPLE_LICENSE_TOKEN, pub = env.SAMPLE_LICENSE_PUBLIC_KEY, url = env.SAMPLE_LICENSE_STATUS_URL, host = env.SAMPLE_HOST;
  if (!token || !pub || !url || !host) return { status: async () => ({ state: 'locked', reason: 'no_license', message: 'הרישיון של המוצר לא הוגדר.' }) };
  return createSampleLicense({ licenseToken: token, publicKeyPem: pub, statusUrl: url, host, fetch: async (u) => { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error('status_fetch_failed'); return r.json(); } });
}
