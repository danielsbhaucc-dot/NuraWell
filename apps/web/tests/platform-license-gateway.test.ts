import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCoreGateway, gatewayAdmin, memoryGatewayStore, createCoreClient, canonicalRequest, hmacHex, sha256Hex, signingKeyFromSecret } from '../../../packages/@platform/licensing/src/gateway';
import { toHost } from '../../../packages/@platform/licensing/src/online';
import { priceQuoteCores } from '../../../packages/@platform/licensing/examples/price-quote/server-core';
import { priceQuoteClient } from '../../../packages/@platform/licensing/examples/price-quote/thin-client';

const T0 = new Date('2026-10-26T10:00:00Z').getTime();
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T0); });
afterEach(() => { vi.useRealTimers(); });
const tick = (ms: number) => vi.setSystemTime(Date.now() + ms);

async function setup(statusCacheMs = 5000) {
  const store = memoryGatewayStore(); const admin = gatewayAdmin(store);
  const worker = toHost('cloudflare', createCoreGateway({ store, cores: { 'price-quote': priceQuoteCores }, statusCacheMs }));
  const sent: Request[] = [];
  const f = (async (u: string, init: RequestInit) => { const r = new Request(u, init); sent.push(r.clone()); return worker.fetch(r); }) as typeof fetch;
  const inst = await admin.issue({ lid: 'L1', moduleId: 'price-quote', domains: ['shop.example.com'] });
  const client = (o: Partial<{ origin: string; secret: string; keyVersion: number }> = {}) => priceQuoteClient({ url: 'https://core.example', installId: inst.iid, secret: inst.secret, keyVersion: inst.keyVersion, origin: 'https://shop.example.com', fetch: f, ...o });
  return { store, admin, inst, client, worker, sent };
}
const items = [{ qty: 4, unitPrice: 100 }];

describe('server-held core gateway', () => {
  it('thin client gets the result; the secret is not stored, only its hash', async () => {
    const { client, store, inst } = await setup();
    expect(await client().quote(items)).toEqual({ ok: true, subtotal: 400, total: 388 });
    const rec = await store.get(inst.iid);
    expect(JSON.stringify(rec)).not.toContain(inst.secret);
    expect(rec!.keyHash).toBe(await sha256Hex(inst.secret));
  });
  it('block takes effect within the status cache window (5s); Hebrew lock message; unblock restores', async () => {
    const { client, admin, inst } = await setup();
    await client().quote(items);
    await admin.setStatus(inst.iid, { state: 'suspended_until_payment', reason: 'unpaid' });
    tick(5001);
    const r = await client().quote(items);
    expect(r).toMatchObject({ ok: false, code: 'blocked_payment' }); expect(!r.ok && r.locked).toMatch(/תשלום/);
    await admin.setStatus(inst.iid, { state: 'active' }); tick(5001);
    expect((await client().quote(items)).ok).toBe(true);
  });
  it('temporary block auto-expires; permanent stays', async () => {
    const { client, admin, inst } = await setup(0);
    await admin.setStatus(inst.iid, { state: 'suspended_until', until: new Date(T0 + 3_600_000).toISOString(), reason: 'terms' });
    expect(await client().quote(items)).toMatchObject({ ok: false, code: 'blocked_temporary' });
    tick(3_600_001); expect((await client().quote(items)).ok).toBe(true);
    await admin.kill(inst.iid); expect(await client().quote(items)).toMatchObject({ ok: false, code: 'blocked_permanent' });
  });
  it('replayed request rejected; stale timestamp rejected', async () => {
    const { client, worker, sent } = await setup();
    await client().quote(items);
    const again = await worker.fetch(sent[0].clone()); expect(await again.json()).toMatchObject({ code: 'replay' });
    tick(61_000); const late = await worker.fetch(sent[0].clone()); expect(await late.json()).toMatchObject({ code: 'stale' });
  });
  it('wrong domain rejected (even with a valid key)', async () => {
    const { client } = await setup();
    expect(await client({ origin: 'https://copycat.example.net' }).quote(items)).toMatchObject({ ok: false, code: 'wrong_domain' });
  });
  it('leaked secret: rotation: new key works at once, old key dies within the 5s cache window', async () => {
    const { client, admin, inst } = await setup();
    expect((await client().quote(items)).ok).toBe(true);
    const n = await admin.rotate(inst.iid);
    expect((await client({ secret: n!.secret, keyVersion: n!.keyVersion }).quote(items)).ok).toBe(true); // fresh read on key miss
    tick(5001);
    expect(await client().quote(items)).toMatchObject({ ok: false, code: 'bad_key' });
    expect(await client({ secret: inst.secret, keyVersion: 2 }).quote(items)).toMatchObject({ ok: false, code: 'bad_key' }); // old secret + new version
    expect((await client({ secret: n!.secret, keyVersion: n!.keyVersion }).quote(items)).ok).toBe(true);
  });
  it('tampered body rejected; rate limited', async () => {
    const { worker, inst } = await setup();
    const key = await signingKeyFromSecret(inst.secret); const ts = String(Date.now());
    const mk = async (nonce: string, body: string, signed = body) => new Request('https://core.example/core/price-quote/quote', { method: 'POST', body, headers: { 'x-nw-install': inst.iid, 'x-nw-ts': ts, 'x-nw-nonce': nonce, 'x-nw-key-version': '1', 'x-nw-origin': 'https://shop.example.com',
      'x-nw-sig': await hmacHex(key, canonicalRequest({ ts, nonce, origin: 'https://shop.example.com', core: 'quote', bodyHash: await sha256Hex(signed), keyVersion: '1' })) } });
    expect(await (await worker.fetch(await mk('a'.repeat(32), '{"items":[]}', '{"items":[{"qty":1,"unitPrice":1}]}'))).json()).toMatchObject({ code: 'bad_key' });
    let last = 0; for (let i = 0; i < 125; i++) last = (await worker.fetch(await mk(`n${String(i).padStart(20, '0')}`, '{"items":[]}'))).status;
    expect(last).toBe(429);
  });
  it('unreachable worker → Hebrew message, never a throw', async () => {
    const c = createCoreClient({ url: 'https://x', moduleId: 'price-quote', installId: 'i', secret: 's', keyVersion: 1, origin: 'https://shop.example.com', fetch: (async () => { throw new Error('down'); }) as typeof fetch });
    expect(await c.call('quote', {})).toMatchObject({ ok: false, code: 'unreachable' });
  });
});
