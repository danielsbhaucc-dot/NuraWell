import { describe, it, expect, beforeAll, vi } from 'vitest';
import { generateKeyPairSync, createPublicKey, createHash } from 'node:crypto';

vi.mock('server-only', () => ({}));

import { canonicalJson, publicKeyFingerprint, publicKeyPem, __resetSigningKeyCache } from '@/lib/legal/evidence-crypto';
import { asciiJson, buildProvenance, chainNeighbors, corroboration, otsStatus, tsaName } from '@/lib/legal/evidence-provenance';
import { requestMeta } from '@/lib/legal/record-evidence';
import { buildEvidencePdf } from '@/lib/legal/evidence-pdf';

beforeAll(() => {
  const { privateKey } = generateKeyPairSync('ed25519');
  process.env.CONSENT_SIGNING_PRIVATE_KEY = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  __resetSigningKeyCache();
});

const rec = (over: Record<string, unknown> = {}) => {
  const payload = { action: 'grant', typed_word: 'מסכים', v: 2, request_id: 'fra1::abc', consent_text_sha256: 'f'.repeat(64) };
  return {
    id: 'r1', payload_json: canonicalJson(payload), record_hash: 'a'.repeat(64), prev_hash: 'GENESIS', created_at: '2026-10-20T15:17:10.406Z',
    rendered_sha256: 'b'.repeat(64), typed_word: 'מסכים', checkbox_checked: true, text_version: 'hc-1', user_agent: 'UA', session_id: 's', device_id: 'd',
    screenshot_sha256: 'c'.repeat(64), action: 'grant', source: 'settings_privacy', ...over,
  };
};

describe('evidence provenance', () => {
  it('ascii json parses back to the exact signed canonical bytes', () => {
    const s = canonicalJson({ typed_word: 'מבטלת', a: 1 });
    expect(asciiJson(s)).toMatch(/^[\x20-\x7e]+$/);
    expect(canonicalJson(JSON.parse(asciiJson(s)))).toBe(s);
  });
  it('labels every field with a source and flags screenshot hash match', () => {
    const rows = buildProvenance(rec(), '203.0.113.7', 'c'.repeat(64), { url: 'https://freetsa.org/tsr', genTime: 'x' });
    expect(rows.every((r) => r.source && r.how)).toBe(true);
    expect(rows.find((r) => r.field === 'מזהה בקשה')!.value).toBe('fra1::abc');
    expect(rows.find((r) => r.field === 'גיבוב הקובץ השמור היום')!.how).toContain('זהה');
    expect(tsaName('https://freetsa.org/tsr')).toContain('FreeTSA');
  });
  it('finds server-side audit rows for the same event and chain neighbors', () => {
    const c = corroboration(rec(), [{ created_at: '2026-10-20T15:17:11.892Z', path: 'health_consent_granted', method: 'PRIVACY', detail: { source: 'settings_privacy' } }, { created_at: '2026-10-20T14:00:00Z', path: 'health_consent_granted' }], []);
    expect(c).toHaveLength(1);
    const n = chainNeighbors([rec(), rec({ id: 'r2', record_hash: 'e'.repeat(64) })], 0);
    expect(n.nextHash).toBe('e'.repeat(64));
  });
  it('reports OTS bitcoin status from upgrade rows', () => {
    const att = [{ id: 7, record_id: 'r1', kind: 'ots', payload: { proofs: [{ calendar: 'https://a.pool.opentimestamps.org' }, { calendar: 'https://b.x' }] }, created_at: '' },
      { record_id: 'r1', kind: 'ots_upgrade', payload: { source_attestation_id: 7, calendar: 'https://a.pool.opentimestamps.org', bitcoin_height: 900000 }, created_at: '' }];
    expect(otsStatus('r1', att)).toEqual([{ calendar: 'a.pool.opentimestamps.org', status: 'bitcoin', height: 900000 }, { calendar: 'b.x', status: 'pending' }]);
  });
  it('captures the platform request id and a stable key fingerprint', () => {
    const m = requestMeta(new Request('https://x', { headers: { 'x-vercel-id': 'fra1::iad1::123' } }), null);
    expect(m.requestId).toBe('fra1::iad1::123');
    const der = createPublicKey(publicKeyPem()).export({ format: 'der', type: 'spki' });
    expect(publicKeyFingerprint()).toBe(createHash('sha256').update(der).digest('hex'));
  });
  it('renders the v2 report with provenance sections', async () => {
    const pdf = await buildEvidencePdf({
      caseRef: 'T', generatedAt: new Date().toISOString(), generatedBy: 't', user: { name: 'n', email: 'e', id: 'u', createdAt: null }, overallOk: true,
      publicKeyPem: publicKeyPem(), publicKeyFingerprint: publicKeyFingerprint(), publicKeyUrl: 'https://x/.well-known/nurawell-consent-signing.pem', tsaName: 'FreeTSA',
      accessLog: [], chainAnchors: [],
      events: [{ index: 1, reference: 'R', createdAt: new Date().toISOString(), action: 'grant', source: 'chat', textVersion: 'v', displayedText: ['שלום'], typedWord: 'מסכים', checkbox: true,
        ip: null, ipHash: null, userAgent: null, sessionId: null, deviceId: null, recordHash: 'a'.repeat(64), prevHash: 'GENESIS', renderedSha: 'b', screenshotSha: null, screenshotPng: null,
        signature: 's', keyId: 'k', tsa: { ok: true, genTime: null }, otsCalendars: [], emailReceipt: null, checks: [],
        provenance: buildProvenance(rec({ screenshot_sha256: null }), 'מוצפן', null, {}), corroboration: [], canonicalJson: rec().payload_json, neighbors: { position: 1, total: 1, prevHash: 'GENESIS', nextHash: null }, otsStatus: [] }],
    });
    expect(pdf.length).toBeGreaterThan(10_000);
  });
});
