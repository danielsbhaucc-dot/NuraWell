import { describe, it, expect, beforeAll, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('server-only', () => ({}));

import { canonicalJson, GENESIS, recordHash, sha256Hex, signHash, verifyChain, __resetSigningKeyCache, type StoredRecord } from '@/lib/legal/evidence-crypto';
import { consentText, isAcceptedConsentWord, renderConsentHtml, CONSENT_TEXT_VERSION } from '@/lib/legal/consent-text';
import { detectConsentChangeIntent, resolveConsentOffer } from '@/lib/legal/consent-chat-intent';
import { verifyTsaResponse, buildTsaRequest } from '@/lib/legal/tsa';
import { respondWithConsentOffer } from '@/lib/legal/consent-chat-offer';
import { validateSubmission } from '@/lib/legal/record-evidence';

beforeAll(() => {
  const { privateKey } = generateKeyPairSync('ed25519');
  process.env.CONSENT_SIGNING_PRIVATE_KEY = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  __resetSigningKeyCache();
});

function makeChain(n: number): StoredRecord[] {
  let prev = GENESIS;
  const out: StoredRecord[] = [];
  for (let i = 0; i < n; i++) {
    const html = renderConsentHtml(consentText(i % 2 ? 'withdraw' : 'grant', 'female'), { checkbox: true, typed: 'מסכימה' });
    const payload = canonicalJson({ v: 1, i, action: i % 2 ? 'withdraw' : 'grant', rendered_sha256: sha256Hex(html), prev_hash: prev, created_at: `2026-10-20T10:0${i}:00Z` });
    const h = recordHash(payload);
    out.push({ id: `r${i}`, payload_json: payload, record_hash: h, prev_hash: prev, signature: signHash(h).signature, rendered_html: html, rendered_sha256: sha256Hex(html), created_at: '' });
    prev = h;
  }
  return out;
}

describe('consent evidence chain', () => {
  it('verifies an intact chain', () => {
    expect(verifyChain(makeChain(3)).ok).toBe(true);
  });
  it('detects a modified payload', () => {
    const c = makeChain(3);
    c[1] = { ...c[1]!, payload_json: c[1]!.payload_json.replace('"withdraw"', '"grant"') };
    const r = verifyChain(c);
    expect(r.ok).toBe(false);
    expect(r.results[1]!.problems).toContain('record_hash_mismatch');
  });
  it('detects a re-hashed but unsigned forgery', () => {
    const c = makeChain(2);
    const forged = c[1]!.payload_json.replace('"withdraw"', '"grant"');
    c[1] = { ...c[1]!, payload_json: forged, record_hash: recordHash(forged) };
    expect(verifyChain(c).results[1]!.problems).toContain('signature_invalid');
  });
  it('detects a deleted record (chain break)', () => {
    const c = makeChain(3);
    expect(verifyChain([c[0]!, c[2]!]).results[1]!.problems).toContain('chain_break');
  });
  it('detects an edited displayed text', () => {
    const c = makeChain(1);
    c[0] = { ...c[0]!, rendered_html: c[0]!.rendered_html.replace('מסכימה', 'מסכים') };
    expect(verifyChain(c).results[0]!.problems).toContain('snapshot_hash_mismatch');
  });
  it('rejects signatures from another key', () => {
    const c = makeChain(1);
    const other = generateKeyPairSync('ed25519').publicKey.export({ format: 'pem', type: 'spki' }).toString();
    expect(verifyChain(c, other).ok).toBe(false);
  });
});

describe('typed word + submission', () => {
  it('accepts gender variants and light formatting', () => {
    for (const w of ['מסכים', 'מסכימה', ' אני מסכימה ', 'מסכים.', 'מְסַכִּים', 'מסכים/ה']) expect(isAcceptedConsentWord('grant', w)).toBe(true);
    for (const w of ['מבטל', 'מבטלת', 'אני מבטלת']) expect(isAcceptedConsentWord('withdraw', w)).toBe(true);
  });
  it('rejects unrelated words', () => {
    for (const w of ['', 'לא', 'אולי', 'מסכים אבל לא', 'x'.repeat(30)]) expect(isAcceptedConsentWord('grant', w)).toBe(false);
    expect(isAcceptedConsentWord('withdraw', 'לא')).toBe(false);
  });
  it('server refuses a submission without checkbox, word or current text version', () => {
    const base = { action: 'grant' as const, textVersion: CONSENT_TEXT_VERSION, typedWord: 'מסכים', checkbox: true };
    expect(validateSubmission(base)).toBeNull();
    expect(validateSubmission({ ...base, checkbox: false })).toBe('checkbox_required');
    expect(validateSubmission({ ...base, typedWord: 'כן' })).toBe('typed_word_invalid');
    expect(validateSubmission({ ...base, textVersion: 'old' })).toBe('stale_text_version');
  });
  it('gender-matched expected word and transparency line in the snapshot', () => {
    expect(consentText('grant', 'female').expectedWord).toBe('מסכימה');
    expect(consentText('grant', 'male').expectedWord).toBe('מסכים');
    expect(consentText('withdraw', 'female').expectedWord).toBe('מבטלת');
    const html = renderConsentHtml(consentText('withdraw', null), { checkbox: true, typed: 'מבטל' });
    expect(html).toContain('צילום של החלון');
    expect(html).toContain('נמחק');
  });
});

describe('chat consent intent (deterministic, no model)', () => {
  it('detects explicit requests', () => {
    expect(detectConsentChangeIntent('אני רוצה לבטל את ההסכמה למידע בריאותי')).toBe('withdraw');
    expect(detectConsentChangeIntent('תבטל לי את ההסכמה')).toBe('withdraw');
    expect(detectConsentChangeIntent('אני רוצה לתת הסכמה')).toBe('grant');
    expect(detectConsentChangeIntent('אפשר להפעיל את ההסכמה לשמירת מידע?')).toBe('grant');
    expect(detectConsentChangeIntent('אני רוצה לשנות את העדפות הפרטיות')).toBe('change');
  });
  it('ignores unrelated mentions', () => {
    expect(detectConsentChangeIntent('היה לי יום טוב')).toBeNull();
    expect(detectConsentChangeIntent('מה זה הסכמה?')).toBeNull();
    expect(detectConsentChangeIntent('אני רוצה לבטל את המשימה של מחר')).toBeNull();
  });
  it('resolves "change" by current state', () => {
    expect(resolveConsentOffer('change', true)).toBe('withdraw');
    expect(resolveConsentOffer('change', false)).toBe('grant');
  });
  it('offer response is a structured action only and never changes consent', async () => {
    const inserts: unknown[] = [];
    const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { gender: 'female' } }) }) }), insert: () => { throw new Error('must not write consent'); } }) };
    const res = await respondWithConsentOffer({
      supabase: {}, admin, userId: 'u', sessionId: 's', debugId: 'd', intent: 'withdraw', userText: 'תבטל את ההסכמה',
      ensureSession: async () => undefined, insert: async (_sb, row) => void inserts.push(row), statusLookup: async () => 'granted',
    });
    expect(res.headers.get('x-almog-consent-action')).toBe('withdraw');
    const text = await res.text();
    expect(text).toContain('הכפתור');
    expect(text).toContain('תרצי');
    expect(inserts).toHaveLength(2);
  });
});

describe('RFC 3161', () => {
  const tsr = readFileSync(path.join(__dirname, 'fixtures/freetsa-sample.tsr'));
  const digest = readFileSync(path.join(__dirname, 'fixtures/freetsa-sample.digest'), 'utf8').trim();
  it('accepts a real token for its digest', () => {
    const v = verifyTsaResponse(tsr, digest);
    expect(v.ok).toBe(true);
    expect(v.genTime).toMatch(/^2026-/);
  });
  it('rejects the token for another digest', () => {
    expect(verifyTsaResponse(tsr, sha256Hex('other')).ok).toBe(false);
  });
  it('builds a DER request containing the digest', () => {
    expect(buildTsaRequest(digest, Buffer.from('0102', 'hex')).includes(Buffer.from(digest, 'hex'))).toBe(true);
  });
});

describe('append-only migration', () => {
  const sql = readFileSync(path.join(__dirname, '../../../supabase/migrations/000148_consent_evidence.sql'), 'utf8');
  it('blocks update/delete/truncate and revokes client roles', () => {
    expect(sql).toMatch(/before update or delete/);
    expect(sql).toMatch(/before truncate/);
    expect(sql).toMatch(/revoke all on public\.%I from public, anon, authenticated/);
    expect(sql).not.toMatch(/grant (update|delete)/i);
  });
});
