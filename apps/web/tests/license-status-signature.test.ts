import { describe, expect, it } from 'vitest';
import { ProductLink } from '@core/product-link';
import { signStatus, type StatusFile } from '../../packages/@core/licensing/src/index.ts';

const lic = 'lic_labuser';

async function pair() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = await crypto.subtle.exportKey('jwk', key.publicKey);
  const imported = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return { priv: key.privateKey, pub: imported };
}

function file(productId: string, state?: 'revoked_permanent' | 'suspended_until_payment'): StatusFile {
  return {
    issuedAt: new Date().toISOString(),
    licenses: [{ id: lic, moduleId: 'core', productId, expiresAt: null }],
    status: state ? { [lic]: { state } } : {},
  };
}

async function linkFor(pub: CryptoKey, body: () => Promise<Response> | Response, now: () => number = Date.now) {
  return new ProductLink({
    productId: 'nurawell', keyId: 'pk_localtestkey0001', secret: 'local-test-secret-not-production', version: '0.0.0',
    endpoint: 'https://status.local/functions/v1/product-link',
    statusUrl: 'https://status.local/functions/v1/admin-api/license-status',
    publicKey: pub, enforceApproved: true, mode: 'enforce', now, fetch: async () => body(),
  });
}

describe('signed license status through the real verifier', () => {
  it('accepts an active file and a revoked file, and rejects a bad signature or another product', async () => {
    const { priv, pub } = await pair();
    const active = await linkFor(pub, async () => Response.json(await signStatus(file('nurawell'), priv)));
    expect((await active.check('*', { lic })).reason).toBe('active');
    const revoked = await linkFor(pub, async () => Response.json(await signStatus(file('nurawell', 'revoked_permanent'), priv)));
    expect((await revoked.check('*', { lic })).reason).toBe('revoked');
    const other = await pair();
    const forged = await linkFor(pub, async () => Response.json(await signStatus(file('nurawell'), other.priv)));
    expect((await forged.check('*', { lic })).reason).toBe('no_status');
    const wrong = await linkFor(pub, async () => Response.json(await signStatus(file('other-product'), priv)));
    expect((await wrong.check('*', { lic })).reason).toBe('wrong_product');
  });

  it('keeps a known license through the grace, then stale after the status server stays down', async () => {
    const { priv, pub } = await pair();
    let t = 1_000_000;
    let alive = true;
    const link = await linkFor(pub, async () => {
      if (!alive) return new Response('down', { status: 503 });
      return Response.json(await signStatus(file('nurawell'), priv));
    }, () => t);
    expect((await link.check('*', { lic })).reason).toBe('active');
    alive = false;
    t += 7 * 60 * 60 * 1000;
    expect((await link.check('*', { lic })).reason).toBe('active');
    t += 4 * 24 * 60 * 60 * 1000;
    expect((await link.check('*', { lic })).reason).toBe('stale_status');
  });
});
