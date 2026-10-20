/**
 * RFC 3161 trusted timestamp (free public TSAs). Builds a TimeStampReq for a SHA-256 digest,
 * returns the DER TimeStampResp token (base64). Verification here checks status=granted,
 * that the token's messageImprint equals our digest and the nonce echoes ours, and extracts genTime.
 * Full CMS signature/chain verification: `openssl ts -verify` (documented in the export guide).
 */
import { randomBytes } from 'node:crypto';

export const TSA_URLS = ['https://freetsa.org/tsr', 'http://timestamp.digicert.com'];
const SHA256_OID = Buffer.from('0609608648016503040201', 'hex'); // 2.16.840.1.101.3.4.2.1

function len(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const b: number[] = [];
  while (n > 0) { b.unshift(n & 0xff); n >>= 8; }
  return Buffer.from([0x80 | b.length, ...b]);
}
function tlv(tag: number, body: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), len(body.length), body]);
}
function intBuf(b: Buffer): Buffer {
  return b[0]! & 0x80 ? Buffer.concat([Buffer.from([0]), b]) : b;
}

export function buildTsaRequest(digestHex: string, nonce: Buffer): Buffer {
  const algId = tlv(0x30, Buffer.concat([SHA256_OID, Buffer.from([0x05, 0x00])]));
  const imprint = tlv(0x30, Buffer.concat([algId, tlv(0x04, Buffer.from(digestHex, 'hex'))]));
  return tlv(0x30, Buffer.concat([tlv(0x02, Buffer.from([1])), imprint, tlv(0x02, intBuf(nonce)), Buffer.from([0x01, 0x01, 0xff])]));
}

type Node = { tag: number; start: number; hdr: number; len: number };
function readNode(buf: Buffer, pos: number): Node {
  const tag = buf[pos]!;
  let l = buf[pos + 1]!;
  let hdr = 2;
  if (l & 0x80) {
    const n = l & 0x7f;
    l = 0;
    for (let i = 0; i < n; i++) l = l * 256 + buf[pos + 2 + i]!;
    hdr += n;
  }
  return { tag, start: pos, hdr, len: l };
}

export type TsaVerify = { ok: boolean; genTime: string | null; reason?: string };

/** Structural verification of a TimeStampResp (or bare token) against our digest + nonce. */
export function verifyTsaResponse(respDer: Buffer, digestHex: string, nonceHex?: string): TsaVerify {
  try {
    const outer = readNode(respDer, 0);
    const first = readNode(respDer, outer.hdr);
    // TimeStampResp starts with PKIStatusInfo SEQUENCE { INTEGER status }
    if (first.tag === 0x30) {
      const st = readNode(respDer, first.start + first.hdr);
      if (st.tag === 0x02) {
        const status = respDer[st.start + st.hdr]!;
        if (status > 1) return { ok: false, genTime: null, reason: `tsa status ${status}` };
      }
    }
    const digest = Buffer.from(digestHex, 'hex');
    const imprintIdx = respDer.indexOf(Buffer.concat([Buffer.from([0x04, 0x20]), digest]));
    if (imprintIdx < 0) return { ok: false, genTime: null, reason: 'digest mismatch' };
    if (nonceHex) {
      const n = intBuf(Buffer.from(nonceHex, 'hex'));
      if (respDer.indexOf(Buffer.concat([Buffer.from([0x02, n.length]), n]), imprintIdx) < 0)
        return { ok: false, genTime: null, reason: 'nonce mismatch' };
    }
    // GeneralizedTime (tag 0x18) right after serialNumber in TSTInfo
    const gtIdx = respDer.indexOf(0x18, imprintIdx);
    let genTime: string | null = null;
    if (gtIdx > 0) {
      const l = respDer[gtIdx + 1]!;
      const s = respDer.subarray(gtIdx + 2, gtIdx + 2 + l).toString('ascii');
      const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/.exec(s);
      if (m) genTime = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ?? ''}Z`;
    }
    if (!genTime) return { ok: false, genTime: null, reason: 'no genTime' };
    return { ok: true, genTime };
  } catch (e) {
    return { ok: false, genTime: null, reason: e instanceof Error ? e.message : 'parse error' };
  }
}

export type TsaResult = { ok: true; url: string; tokenB64: string; nonceHex: string; genTime: string } | { ok: false; error: string };

export async function requestTimestamp(digestHex: string, fetchImpl: typeof fetch = fetch): Promise<TsaResult> {
  const errors: string[] = [];
  for (const url of TSA_URLS) {
    const nonce = randomBytes(8);
    nonce[0] = nonce[0]! & 0x7f;
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/timestamp-query' },
        body: new Uint8Array(buildTsaRequest(digestHex, nonce)),
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) { errors.push(`${url}:${res.status}`); continue; }
      const der = Buffer.from(await res.arrayBuffer());
      const v = verifyTsaResponse(der, digestHex, nonce.toString('hex'));
      if (!v.ok) { errors.push(`${url}:${v.reason}`); continue; }
      return { ok: true, url, tokenB64: der.toString('base64'), nonceHex: nonce.toString('hex'), genTime: v.genTime! };
    } catch (e) {
      errors.push(`${url}:${e instanceof Error ? e.name : 'error'}`);
    }
  }
  return { ok: false, error: errors.join('; ') };
}
