/**
 * Media provenance — pure logic (no DB, no network): source types, license catalog,
 * embedded-metadata parsing (EXIF/XMP/C2PA/ID3), heuristic pre-fill, missing-field rules,
 * and media-evidence chain verification. Shares canonical hashing + Ed25519 with consent evidence.
 */
import { canonicalJson, GENESIS, recordHash, verifySignature } from '../evidence-crypto';

import { GENERATORS, LICENSES, REQUIRED, SOURCE_LABEL_HE, type AssetKind, type AssetOrigin, type GeneratorId, type Provenance, type SourceType } from './labels';
export * from './labels';

export function missingFields(p: Provenance, hasGitProof = false): Array<keyof Provenance> {
  const t = p.source_type ?? 'unknown';
  if (t === 'in_house' && !hasGitProof) return ['notes'];
  return REQUIRED[t].filter((k) => {
    const v = p[k];
    if (k === 'attachments') return !Array.isArray(v) || v.length === 0;
    return v === undefined || v === null || (typeof v === 'string' && !v.trim());
  });
}

export function statusFor(p: Provenance, hasGitProof = false): 'verified' | 'draft' | 'missing_source' {
  const t = p.source_type ?? 'unknown';
  if (t === 'unknown') return 'missing_source';
  if (missingFields(p, hasGitProof).length) return 'draft';
  return 'verified';
}

// ───────────────────────────── embedded metadata ─────────────────────────────
export type EmbeddedMeta = {
  c2pa: boolean;
  c2pa_claim_generator?: string | null;
  ai_hint?: GeneratorId | null; // generator detected from metadata
  digital_source_type?: string | null;
  software?: string | null;
  artist?: string | null;
  copyright?: string | null;
  description?: string | null;
  id3?: { title?: string; artist?: string; comment?: string; encoder?: string } | null;
  svg_title?: string | null;
};

const AI_PATTERNS: Array<[RegExp, GeneratorId]> = [
  [/openai|dall[-·\s]?e|gpt[-\s]?image|chatgpt/i, 'gpt_image'],
  [/\bx\.?ai\b|grok|aurora/i, 'grok'],
  [/gemini|imagen|nano[\s-]?banana|google\s*ai|synthid/i, 'nano_banana'],
  [/suno/i, 'suno'],
  [/lyria/i, 'gemini_music'],
  [/elevenlabs/i, 'elevenlabs'],
];

export function detectGenerator(text: string | null | undefined): GeneratorId | null {
  if (!text) return null;
  for (const [re, id] of AI_PATTERNS) if (re.test(text)) return id;
  return null;
}

function latin1(buf: Uint8Array, max = 512_000): string {
  return Buffer.from(buf.subarray(0, Math.min(buf.length, max))).toString('latin1');
}

function xmpField(xmp: string, name: string): string | null {
  const a = new RegExp(`${name}="([^"]{1,400})"`).exec(xmp);
  if (a) return a[1]!;
  const b = new RegExp(`<${name}>([\\s\\S]{1,600}?)</${name}>`).exec(xmp);
  if (!b) return null;
  return b[1]!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

/** Minimal ID3v2.3/2.4 text-frame reader (title, artist, comment, encoder). */
export function readId3(buf: Uint8Array): EmbeddedMeta['id3'] {
  if (buf.length < 10 || buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return null;
  const ver = buf[3]!;
  const size = ((buf[6]! & 0x7f) << 21) | ((buf[7]! & 0x7f) << 14) | ((buf[8]! & 0x7f) << 7) | (buf[9]! & 0x7f);
  const end = Math.min(buf.length, 10 + size);
  const out: NonNullable<EmbeddedMeta['id3']> = {};
  let i = 10;
  while (i + 10 <= end) {
    const id = String.fromCharCode(buf[i]!, buf[i + 1]!, buf[i + 2]!, buf[i + 3]!);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const fs = ver === 4
      ? ((buf[i + 4]! & 0x7f) << 21) | ((buf[i + 5]! & 0x7f) << 14) | ((buf[i + 6]! & 0x7f) << 7) | (buf[i + 7]! & 0x7f)
      : (buf[i + 4]! << 24) | (buf[i + 5]! << 16) | (buf[i + 6]! << 8) | buf[i + 7]!;
    if (fs <= 0 || i + 10 + fs > end) break;
    const body = buf.subarray(i + 10, i + 10 + fs);
    const decode = (b: Uint8Array) => {
      const enc = b[0];
      const rest = Buffer.from(b.subarray(1));
      const s = enc === 1 || enc === 2 ? rest.toString('utf16le') : enc === 3 ? rest.toString('utf8') : rest.toString('latin1');
      return s.replace(/^\uFEFF/, '').replace(/\0+/g, ' ').trim().slice(0, 300);
    };
    if (id === 'TIT2') out.title = decode(body);
    else if (id === 'TPE1') out.artist = decode(body);
    else if (id === 'TSSE' || id === 'TENC') out.encoder = decode(body);
    else if (id === 'COMM' && body.length > 4) out.comment = decode(Uint8Array.from([body[0]!, ...body.subarray(4)]));
    i += 10 + fs;
  }
  return Object.keys(out).length ? out : null;
}

/** Parses provenance-relevant metadata from raw bytes (any type). Never throws. */
export function extractEmbeddedMeta(buf: Uint8Array, mime: string | null): EmbeddedMeta {
  const s = latin1(buf);
  const meta: EmbeddedMeta = { c2pa: /c2pa|jumb/.test(s) && /c2pa/.test(s) };
  const cg = /claim_generator[^A-Za-z0-9]{1,8}([\x20-\x7e]{3,120})/.exec(s);
  if (meta.c2pa && cg) meta.c2pa_claim_generator = cg[1]!.replace(/[^\x20-\x7e]/g, '').trim();
  const xmpStart = s.indexOf('<x:xmpmeta');
  if (xmpStart >= 0) {
    const xmp = s.slice(xmpStart, s.indexOf('</x:xmpmeta>', xmpStart) + 12 || xmpStart + 20000);
    meta.digital_source_type = xmpField(xmp, 'Iptc4xmpExt:DigitalSourceType') ?? xmpField(xmp, 'DigitalSourceType');
    meta.software = xmpField(xmp, 'xmp:CreatorTool');
    meta.artist = xmpField(xmp, 'dc:creator');
    meta.copyright = xmpField(xmp, 'dc:rights');
    meta.description = xmpField(xmp, 'dc:description');
  }
  // EXIF ASCII tags (Software 0x0131, Artist 0x013B, Copyright 0x8298) — cheap scan for readable runs
  if (!meta.software) {
    const sw = /(?:Adobe|GIMP|Photoshop|Figma|Inkscape|Canva|OpenAI|Google|Midjourney|xAI|Grok)[\x20-\x7e]{0,60}/.exec(s);
    if (sw) meta.software = sw[0].trim();
  }
  if ((mime ?? '').startsWith('audio/')) meta.id3 = readId3(buf);
  if ((mime ?? '').includes('svg')) {
    const t = /<title[^>]*>([^<]{1,200})<\/title>/.exec(Buffer.from(buf).toString('utf8'));
    meta.svg_title = t ? t[1]!.trim() : null;
  }
  const hay = [meta.c2pa_claim_generator, meta.software, meta.artist, meta.description, meta.id3?.artist, meta.id3?.comment, meta.id3?.encoder].filter(Boolean).join(' ');
  meta.ai_hint = detectGenerator(hay) ?? (/trainedAlgorithmicMedia|compositeSynthetic/i.test(meta.digital_source_type ?? '') ? 'other' : null);
  return meta;
}

// ───────────────────────────── heuristic pre-fill ─────────────────────────────
export type LegacyCredit = { source?: string; author?: string; photographer?: string; page_url?: string | null; photographer_url?: string | null; license?: string | null; provider_url?: string | null };

/** Builds a draft from what we already know (legacy credit, origin, metadata). Never invents prompts/receipts. */
export function prefillProvenance(input: {
  origin: AssetOrigin;
  kind: AssetKind;
  path?: string | null;
  legacySource?: string | null;
  credit?: LegacyCredit | null;
  meta?: EmbeddedMeta | null;
  hasGitProof?: boolean;
  fontFamily?: string | null;
  library?: { name: string; license: string } | null;
}): Provenance {
  const c = input.credit ?? {};
  const src = (input.legacySource ?? '').toLowerCase();
  const csrc = (c.source ?? '').toLowerCase();
  const who = `${c.author ?? ''} ${c.photographer ?? ''}`;
  if (input.origin === 'font') return { source_type: 'font_license', license_name: LICENSES.ofl.name, license_url: LICENSES.ofl.url, source_url: input.fontFamily ? `https://fonts.google.com/specimen/${input.fontFamily.replace(/ /g, '+')}` : null, author: null };
  if (input.origin === 'library' && input.library) {
    const l = input.library.license.toUpperCase() === 'ISC' ? LICENSES.isc : LICENSES.mit;
    return { source_type: 'library_license', license_name: l.name, license_url: l.url, source_url: `https://www.npmjs.com/package/${input.library.name}` };
  }
  const raw = detectGenerator(who) ?? detectGenerator(csrc) ?? input.meta?.ai_hint ?? null;
  const gen: GeneratorId | null = raw === 'nano_banana' && input.kind === 'audio' ? 'gemini_music' : raw;
  if (/elevenlabs/.test(csrc) || gen === 'elevenlabs') {
    return { source_type: 'ai_voice', generator: 'elevenlabs', model: c.author ?? null, tos_url: GENERATORS.elevenlabs.tos, license_name: c.license ?? null, notes: 'הקראה אוטומטית (TTS) שנוצרה במערכת' };
  }
  if (gen === 'suno' || gen === 'gemini_music') {
    const p: Provenance = { source_type: 'ai_music', generator: gen, tos_url: GENERATORS[gen].tos };
    if (src === 'pixabay' || csrc === 'pixabay') p.notes = `רשום ב־Pixabay אבל היוצר מסומן ${GENERATORS[gen].label}. צריך לוודא מאיפה הקובץ הגיע`;
    return p;
  }
  if (gen && gen !== 'other' && input.kind !== 'audio') return { source_type: 'ai_image', generator: gen, tos_url: GENERATORS[gen].tos };
  if (src === 'pixabay' || csrc === 'pixabay') return { source_type: 'stock_license', source_url: c.page_url ?? null, author: c.photographer ?? c.author ?? null, author_url: c.photographer_url ?? null, license_name: LICENSES.pixabay.name, license_url: LICENSES.pixabay.url };
  if (src === 'pexels' || csrc === 'pexels') return { source_type: 'stock_license', source_url: c.page_url ?? null, author: c.photographer ?? c.author ?? null, author_url: c.photographer_url ?? null, license_name: LICENSES.pexels.name, license_url: LICENSES.pexels.url };
  if (input.origin === 'inline' || (input.origin === 'repo' && /\.svg$/i.test(input.path ?? '') && input.hasGitProof)) {
    return { source_type: 'in_house', notes: 'קוד SVG שנכתב במאגר; ההוכחה היא היסטוריית git' };
  }
  if (input.origin === 'repo' && input.hasGitProof) {
    return { source_type: 'in_house', notes: 'קובץ מותג שנוצר בפרויקט; ההוכחה היא היסטוריית git', confirmed_by_owner: false };
  }
  if (src === 'upload') return { source_type: 'owner_upload' };
  return { source_type: 'unknown' };
}

// ───────────────────────────── perceptual hash (dHash 64-bit) ─────────────────────────────
/** dHash from a 9x8 grayscale buffer (row-major). Returns 16 hex chars. */
export function dHashFromGray(px: Uint8Array): string {
  if (px.length < 72) throw new Error('need 9x8 gray');
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += px[y * 9 + x]! > px[y * 9 + x + 1]! ? '1' : '0';
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
}

export function hammingHex(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  const one = BigInt(1);
  const zero = BigInt(0);
  while (x > zero) { n += Number(x & one); x >>= one; }
  return n;
}

// ───────────────────────────── evidence chain ─────────────────────────────
export type MediaEvidencePayload = {
  v: 1;
  asset_key: string;
  event: 'scan' | 'provenance' | 'license_snapshot' | 'attachment' | 'ai_describe';
  data: Record<string, unknown>;
  created_at: string;
  prev_hash: string;
};

export function buildMediaPayload(p: Omit<MediaEvidencePayload, 'v'>): { json: string; hash: string } {
  const json = canonicalJson({ v: 1, ...p });
  return { json, hash: recordHash(json) };
}

export type MediaRecord = { id: string; asset_key: string; event: string; payload_json: string; prev_hash: string; record_hash: string; signature: string; created_at: string };

export function verifyMediaChain(records: MediaRecord[], pubPem?: string) {
  let prev = GENESIS;
  const results = records.map((r) => {
    const problems: string[] = [];
    let p: Partial<MediaEvidencePayload> = {};
    try { p = JSON.parse(r.payload_json); } catch { problems.push('payload_unparseable'); }
    if (recordHash(r.payload_json) !== r.record_hash) problems.push('record_hash_mismatch');
    if (p.prev_hash !== r.prev_hash || r.prev_hash !== prev) problems.push('chain_break');
    if (p.asset_key !== r.asset_key) problems.push('asset_mismatch');
    if (!verifySignature(r.record_hash, r.signature, pubPem)) problems.push('signature_invalid');
    prev = r.record_hash;
    return { id: r.id, ok: problems.length === 0, problems };
  });
  return { ok: results.every((x) => x.ok), results };
}

/** Lowercased haystack for instant client search. */
export function searchText(a: { title?: string | null; path?: string | null; ai_description?: string | null; ai_tags?: string[]; provenance?: Provenance; usages?: string[] }): string {
  const p = a.provenance ?? {};
  return [a.title, a.path, a.ai_description, ...(a.ai_tags ?? []), p.author, p.source_url, p.license_name, p.generator && GENERATORS[p.generator]?.label, p.prompt, p.notes, p.source_type && SOURCE_LABEL_HE[p.source_type], ...(a.usages ?? [])]
    .filter(Boolean).join(' ').toLowerCase();
}

/** Maps a storage object key to the page(s) where it is used. */
export function usageForObjectKey(key: string | null | undefined): string[] {
  const k = key ?? '';
  if (k.startsWith('site/login-background')) return ['/login — רקע התחברות'];
  if (k.startsWith('site/register-background')) return ['/register — רקע הרשמה'];
  if (k.startsWith('site/chat-background')) return ['/chat — רקע שיחה'];
  if (k.startsWith('journey/stations/')) return ['/journey — כריכת תחנה'];
  if (k.startsWith('playlists/')) return ['/audio — פלייליסט'];
  if (k.startsWith('tts/journey/')) return ['/journey — הקראת שאלון'];
  if (k.startsWith('tts/sos/')) return ['/sos — הקראה'];
  if (k.startsWith('media/')) return ['ספריית המדיה'];
  return [];
}
