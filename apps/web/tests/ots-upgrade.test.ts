import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { otsUpgradeProof, parseOtsAttestations } from '@/lib/legal/ots';

const vb = (b: Buffer) => Buffer.concat([Buffer.from([b.length]), b]);
const att = (tagHex: string, payload: Buffer) => Buffer.concat([Buffer.from([0x00]), Buffer.from(tagHex, 'hex'), vb(payload)]);
const digest = createHash('sha256').update('x').digest('hex');
const nonce = Buffer.from('a1b2c3d4', 'hex');
const cal = 'https://a.pool.opentimestamps.org';
const pending = Buffer.concat([Buffer.from([0xf0]), vb(nonce), Buffer.from([0x08]), att('83dfe30d2ef90c8e', vb(Buffer.from(cal)))]);
const commitment = createHash('sha256').update(Buffer.concat([Buffer.from(digest, 'hex'), nonce])).digest('hex');

describe('ots upgrade', () => {
  it('parses pending commitment', () => {
    const a = parseOtsAttestations(digest, pending);
    expect(a).toEqual([{ kind: 'pending', uri: cal, commitmentHex: commitment }]);
  });
  it('completes when calendar returns bitcoin attestation', async () => {
    const upgraded = Buffer.concat([Buffer.from([0x08]), att('0588960d73d71901', Buffer.from([0x90, 0x4e]))]);
    let url = '';
    const f = (async (u: string) => {
      url = u;
      return new Response(new Uint8Array(upgraded));
    }) as unknown as typeof fetch;
    const r = await otsUpgradeProof(digest, { calendar: cal, responseB64: pending.toString('base64') }, f);
    expect(url).toBe(`${cal}/timestamp/${commitment}`);
    expect(r).toMatchObject({ status: 'complete', bitcoinHeight: 10000 });
  });
  it('stays pending on 404 and refuses unknown calendars', async () => {
    const f = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    expect((await otsUpgradeProof(digest, { calendar: cal, responseB64: pending.toString('base64') }, f)).status).toBe('pending');
    expect((await otsUpgradeProof(digest, { calendar: 'https://evil.example', responseB64: pending.toString('base64') }, f)).status).toBe('error');
  });
});
