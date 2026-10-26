// A product's link to the central control plane:
//  1. register this instance (opaque id + sha256 of the host; no secrets, no PII),
//  2. hold a signed license token (valid until the next billing date + 3 grace days, renewed on payment),
//  3. poll the signed status file every ~2 minutes for block/unblock,
//  4. fail closed: if the status file can't be verified for more than 6 hours, the product locks itself.
import { createHash, randomBytes } from 'node:crypto';
import { createLicenseGuard, type GuardStatus, type RevocationList } from '../index';

export type ProductIdentity = { productId: string; moduleId: string; version: string };

type Rpc = { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };

export const newInstanceId = () => `ins_${randomBytes(12).toString('base64url')}`;

/** Registers this running copy with the central control plane. Throws (fails closed) when central refuses. */
export async function registerWithControlPlane(central: Rpc, id: Pick<ProductIdentity, 'productId'>, a: { instanceId: string; host: string }) {
  const { data, error } = await central.rpc('central_register_instance', {
    p_product: id.productId, p_instance: a.instanceId, p_host_sha256: createHash('sha256').update(a.host.toLowerCase()).digest('hex'),
  });
  if (error) throw new Error('control_plane_refused');
  return data as { instanceId: string; productStatus: string };
}

export type ProductLicenseConfig = {
  licenseToken: string;
  publicKeyPem: string;
  statusUrl: string;
  host: string;
  fetch: (url: string) => Promise<unknown>;
  cache?: { get(): Promise<RevocationList | null> | RevocationList | null; set(l: RevocationList): Promise<void> | void };
  now?: () => Date;
};

/** Everything the product needs: `status()` before serving, `run()` to wrap a feature. Never throws into the app. */
export function createProductLicense(id: ProductIdentity, c: ProductLicenseConfig) {
  return createLicenseGuard({
    moduleId: id.moduleId, version: id.version, publicKeyPem: c.publicKeyPem, licenseToken: c.licenseToken,
    host: c.host, revocationUrl: c.statusUrl, fetch: c.fetch, cache: c.cache, now: c.now,
    pollMinutes: 2, graceHours: 6,
  });
}

/** From env (server-side only). Missing anything → locked, never "open by default". */
export function productLicenseFromEnv(id: ProductIdentity, env: Record<string, string | undefined>): { status(): Promise<GuardStatus> } {
  const token = env.PRODUCT_LICENSE_TOKEN, pub = env.PRODUCT_LICENSE_PUBLIC_KEY, url = env.PRODUCT_LICENSE_STATUS_URL, host = env.PRODUCT_HOST;
  if (!token || !pub || !url || !host) return { status: async () => ({ state: 'locked', reason: 'no_license', message: 'הרישיון של המוצר לא הוגדר.' }) };
  return createProductLicense(id, { licenseToken: token, publicKeyPem: pub, statusUrl: url, host, fetch: async (u) => { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error('status_fetch_failed'); return r.json(); } });
}
