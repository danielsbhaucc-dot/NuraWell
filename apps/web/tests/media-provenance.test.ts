import { describe, expect, it, beforeAll } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { __resetSigningKeyCache, GENESIS, signHash } from '@/lib/legal/evidence-crypto';
import {
  buildMediaPayload, dHashFromGray, detectGenerator, extractEmbeddedMeta, hammingHex, missingFields, prefillProvenance, readId3,
  searchText, statusFor, usageForObjectKey, verifyMediaChain, type MediaRecord,
} from '@/lib/legal/media/core';
import { buildDescribeMessages, parseDescribe } from '@/lib/legal/media/ai';

beforeAll(() => {
  const { privateKey } = generateKeyPairSync('ed25519');
  process.env.CONSENT_SIGNING_PRIVATE_KEY = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  __resetSigningKeyCache();
});

function chain(n: number, key = 'repo:a.svg'): MediaRecord[] {
  const out: MediaRecord[] = [];
  let prev = GENESIS;
  for (let i = 0; i < n; i++) {
    const { json, hash } = buildMediaPayload({ asset_key: key, event: 'scan', data: { i }, created_at: `2026-10-20T10:0${i}:00.000Z`, prev_hash: prev });
    out.push({ id: String(i), asset_key: key, event: 'scan', payload_json: json, prev_hash: prev, record_hash: hash, signature: signHash(hash).signature, created_at: '' });
    prev = hash;
  }
  return out;
}

describe('media evidence chain', () => {
  it('verifies a clean chain', () => expect(verifyMediaChain(chain(3)).ok).toBe(true));
  it('detects tampered payload, broken link, foreign asset and bad signature', () => {
    const c = chain(3);
    c[1] = { ...c[1]!, payload_json: c[1]!.payload_json.replace('"i":1', '"i":9') };
    expect(verifyMediaChain(c).results[1]!.problems).toContain('record_hash_mismatch');
    const d = chain(3); d.splice(1, 1);
    expect(verifyMediaChain(d).results[1]!.problems).toContain('chain_break');
    const e = chain(2); e[1] = { ...e[1]!, asset_key: 'repo:other' };
    expect(verifyMediaChain(e).results[1]!.problems).toContain('asset_mismatch');
    const f = chain(1); f[0] = { ...f[0]!, signature: chain(1, 'x')[0]!.signature };
    expect(verifyMediaChain(f).results[0]!.problems).toContain('signature_invalid');
  });
});

describe('prefill + missing fields', () => {
  it('in-house SVG with git proof is verified without owner input', () => {
    const p = prefillProvenance({ origin: 'repo', kind: 'illustration', path: 'apps/web/public/cookie-jar.svg', hasGitProof: true });
    expect(p.source_type).toBe('in_house');
    expect(statusFor(p, true)).toBe('verified');
  });
  it('pixabay credit → stock license with license URL, verified when page+author exist', () => {
    const p = prefillProvenance({ origin: 'storage', kind: 'image', legacySource: 'pixabay', credit: { source: 'pixabay', page_url: 'https://pixabay.com/photos/x-1/', photographer: 'someone' } });
    expect(p).toMatchObject({ source_type: 'stock_license', license_name: 'Pixabay Content License' });
    expect(statusFor(p)).toBe('verified');
  });
  it('Suno author under pixabay → ai_music draft needing track link, plan and receipt', () => {
    const p = prefillProvenance({ origin: 'storage', kind: 'audio', legacySource: 'pixabay', credit: { source: 'Pixabay', author: 'Suno ai' } });
    expect(p.source_type).toBe('ai_music');
    expect(missingFields(p)).toEqual(expect.arrayContaining(['track_url', 'plan', 'attachments', 'created_on']));
  });
  it('ElevenLabs TTS → ai_voice; Gemini upload → ai_music; unknown upload → owner_upload draft', () => {
    expect(prefillProvenance({ origin: 'storage', kind: 'audio', legacySource: 'other', credit: { source: 'ElevenLabs', author: 'Liam (Voice)' } }).source_type).toBe('ai_voice');
    expect(prefillProvenance({ origin: 'storage', kind: 'audio', legacySource: 'upload', credit: { source: 'upload', author: 'Gemini ai' } }).source_type).toBe('ai_music');
    const o = prefillProvenance({ origin: 'storage', kind: 'image', legacySource: 'upload' });
    expect(o.source_type).toBe('owner_upload');
    expect(statusFor(o)).toBe('draft');
  });
  it('fonts and libraries are pre-licensed', () => {
    expect(statusFor(prefillProvenance({ origin: 'font', kind: 'font', fontFamily: 'Heebo' }))).toBe('verified');
    expect(prefillProvenance({ origin: 'library', kind: 'icon', library: { name: 'lucide-react', license: 'ISC' } }).license_name).toBe('ISC License');
  });
  it('unknown stays missing_source', () => expect(statusFor(prefillProvenance({ origin: 'storage', kind: 'image' }))).toBe('missing_source'));
});

describe('embedded metadata', () => {
  it('detects generators', () => {
    expect(detectGenerator('Made with OpenAI gpt-image-1')).toBe('gpt_image');
    expect(detectGenerator('Google AI SynthID')).toBe('nano_banana');
    expect(detectGenerator('Grok Imagine')).toBe('grok');
    expect(detectGenerator('Suno v5')).toBe('suno');
    expect(detectGenerator('Photoshop')).toBeNull();
  });
  it('reads XMP DigitalSourceType + C2PA marker', () => {
    const xmp = '<x:xmpmeta><rdf:Description Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia" xmp:CreatorTool="ChatGPT"/></x:xmpmeta>';
    const buf = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from('jumb c2pa claim_generator\x00\x10OpenAI-API c2pa-rs/0.1 '), Buffer.from(xmp)]);
    const m = extractEmbeddedMeta(buf, 'image/jpeg');
    expect(m.c2pa).toBe(true);
    expect(m.digital_source_type).toContain('trainedAlgorithmicMedia');
    expect(m.ai_hint).toBe('gpt_image');
  });
  it('reads ID3 v2.3 title/artist', () => {
    const frame = (id: string, text: string) => { const body = Buffer.concat([Buffer.from([3]), Buffer.from(text, 'utf8')]); const h = Buffer.alloc(10); h.write(id, 0, 'latin1'); h.writeUInt32BE(body.length, 4); return Buffer.concat([h, body]); };
    const frames = Buffer.concat([frame('TIT2', 'שיר בוקר'), frame('TPE1', 'Suno')]);
    const head = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, (frames.length >> 7) & 0x7f, frames.length & 0x7f]);
    const id3 = readId3(Buffer.concat([head, frames]));
    expect(id3).toMatchObject({ title: 'שיר בוקר', artist: 'Suno' });
    expect(extractEmbeddedMeta(Buffer.concat([head, frames]), 'audio/mpeg').ai_hint).toBe('suno');
  });
  it('svg title', () => expect(extractEmbeddedMeta(Buffer.from('<svg><title>צנצנת</title></svg>'), 'image/svg+xml').svg_title).toBe('צנצנת'));
});

describe('perceptual hash', () => {
  it('dHash is stable and near for near images', () => {
    const a = Uint8Array.from({ length: 72 }, (_, i) => (i * 37) % 255);
    const b = Uint8Array.from(a, (v, i) => (i === 5 ? (v + 3) % 255 : v));
    expect(dHashFromGray(a)).toHaveLength(16);
    expect(hammingHex(dHashFromGray(a), dHashFromGray(b))).toBeLessThanOrEqual(2);
  });
});

describe('search + usage', () => {
  it('search covers description, author, license, usage', () => {
    const s = searchText({ title: 'רקע', ai_description: 'אגם טורקיז', provenance: { author: 'fietzfotos', license_name: 'Pixabay Content License' }, usages: ['/login'] });
    for (const w of ['אגם', 'fietzfotos', 'pixabay', '/login']) expect(s).toContain(w);
  });
  it('maps storage keys to pages', () => {
    expect(usageForObjectKey('site/login-background.webp')[0]).toContain('/login');
    expect(usageForObjectKey('tts/sos/x.mp3')[0]).toContain('/sos');
  });
});

describe('cheap AI step', () => {
  it('sends only file facts (no user data) and parses strict JSON', () => {
    const msgs = buildDescribeMessages({ name: 'cookie-jar.svg', path: 'apps/web/public/cookie-jar.svg', kind: 'illustration', mime: 'image/svg+xml', hints: [], usages: ['/cookies'], svgText: '<svg/>' });
    expect(JSON.stringify(msgs)).not.toMatch(/@|user_id|email/);
    expect(parseDescribe('{"description_he":"צנצנת עוגיות","tags":["עוגיות"],"likely_source":"in_house","confidence":0.9}')).toMatchObject({ likely_source: 'in_house' });
    expect(parseDescribe('{"description_he":"x","likely_source":"hack"}')!.likely_source).toBe('unknown');
    expect(parseDescribe('nope')).toBeNull();
  });
});
