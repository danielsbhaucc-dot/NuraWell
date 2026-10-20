import { createHash } from 'node:crypto';
/**
 * OpenTimestamps (free, anchored in Bitcoin). We submit a SHA-256 digest to public calendars
 * and store each calendar's pending commitment. A full .ots file = header + digest + these ops;
 * `ots upgrade` / `ots verify` (reference client) completes and checks the Bitcoin attestation.
 */
export const OTS_CALENDARS = ['https://a.pool.opentimestamps.org', 'https://b.pool.opentimestamps.org', 'https://a.pool.eternitywall.com'];

// .ots file magic header + version 1 + sha256 op tag
const OTS_HEADER = Buffer.from('004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294', 'hex');

export type OtsProof = { calendar: string; responseB64: string };

export async function otsStamp(digestHex: string, fetchImpl: typeof fetch = fetch): Promise<OtsProof[]> {
  const body = new Uint8Array(Buffer.from(digestHex, 'hex'));
  const out = await Promise.all(
    OTS_CALENDARS.map(async (cal) => {
      try {
        const r = await fetchImpl(`${cal}/digest`, {
          method: 'POST',
          headers: { Accept: 'application/vnd.opentimestamps.v1', 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: AbortSignal.timeout(6000),
        });
        if (!r.ok) return null;
        return { calendar: cal, responseB64: Buffer.from(await r.arrayBuffer()).toString('base64') };
      } catch {
        return null;
      }
    })
  );
  return out.filter((x): x is OtsProof => !!x);
}

/** Builds a standard detached .ots file for one calendar proof (verifiable with the reference client). */
export function buildOtsFile(digestHex: string, proof: OtsProof): Buffer {
  return Buffer.concat([OTS_HEADER, Buffer.from([0x01, 0x08]), Buffer.from(digestHex, 'hex'), Buffer.from(proof.responseB64, 'base64')]);
}

// ---------------- upgrade (pending -> Bitcoin) ----------------
const TAG_PENDING = '83dfe30d2ef90c8e';
const TAG_BITCOIN = '0588960d73d71901';

function readVarint(b: Buffer, p: { i: number }): number {
  let v = 0;
  let shift = 0;
  for (;;) {
    const x = b[p.i++];
    if (x === undefined) throw new Error('ots_eof');
    v += (x & 0x7f) * 2 ** shift;
    if (!(x & 0x80)) return v;
    shift += 7;
  }
}
function readBytes(b: Buffer, p: { i: number }): Buffer {
  const n = readVarint(b, p);
  if (p.i + n > b.length) throw new Error('ots_eof');
  const out = b.subarray(p.i, p.i + n);
  p.i += n;
  return out;
}

export type OtsAttestation = { kind: 'pending'; uri: string; commitmentHex: string } | { kind: 'bitcoin'; height: number; commitmentHex: string } | { kind: 'unknown'; tag: string };

/** Walks serialized timestamp ops from `msg` and returns every attestation with the commitment it applies to. */
export function parseOtsAttestations(msgHex: string, ops: Buffer): OtsAttestation[] {
  const out: OtsAttestation[] = [];
  const p = { i: 0 };
  const walk = (msg: Buffer, depth: number) => {
    if (depth > 256) throw new Error('ots_depth');
    for (;;) {
      const tag = ops[p.i++];
      if (tag === undefined) return;
      if (tag === 0xff) {
        walk(msg, depth + 1); // fork: one branch, then continue with the rest on the same msg
        continue;
      }
      if (tag === 0x00) {
        const t = ops.subarray(p.i, p.i + 8).toString('hex');
        p.i += 8;
        const payload = readBytes(ops, p);
        if (t === TAG_PENDING) {
          const q = { i: 0 };
          out.push({ kind: 'pending', uri: readBytes(payload, q).toString('utf8'), commitmentHex: msg.toString('hex') });
        } else if (t === TAG_BITCOIN) {
          out.push({ kind: 'bitcoin', height: readVarint(payload, { i: 0 }), commitmentHex: msg.toString('hex') });
        } else out.push({ kind: 'unknown', tag: t });
        return;
      }
      if (tag === 0xf0) msg = Buffer.concat([msg, readBytes(ops, p)]);
      else if (tag === 0xf1) msg = Buffer.concat([readBytes(ops, p), msg]);
      else if (tag === 0x08) msg = createHash('sha256').update(msg).digest();
      else if (tag === 0x02) msg = createHash('sha1').update(msg).digest();
      else if (tag === 0x03) msg = createHash('ripemd160').update(msg).digest();
      else if (tag === 0xf2) msg = Buffer.from(msg).reverse();
      else if (tag === 0xf3) msg = Buffer.from(msg.toString('hex'), 'utf8');
      else throw new Error(`ots_op_${tag.toString(16)}`);
    }
  };
  walk(Buffer.from(msgHex, 'hex'), 0);
  return out;
}

export type OtsUpgradeResult =
  | { status: 'complete'; calendar: string; commitmentHex: string; responseB64: string; bitcoinHeight: number | null }
  | { status: 'pending' | 'error'; calendar: string; commitmentHex?: string; error?: string };

/** Asks the calendar for the upgraded (Bitcoin-attested) timestamp of a pending proof. */
export async function otsUpgradeProof(digestHex: string, proof: OtsProof, fetchImpl: typeof fetch = fetch): Promise<OtsUpgradeResult> {
  let pend: Extract<OtsAttestation, { kind: 'pending' }> | undefined;
  try {
    pend = parseOtsAttestations(digestHex, Buffer.from(proof.responseB64, 'base64')).find((a): a is Extract<OtsAttestation, { kind: 'pending' }> => a.kind === 'pending');
  } catch (e) {
    return { status: 'error', calendar: proof.calendar, error: (e as Error).message };
  }
  if (!pend) return { status: 'error', calendar: proof.calendar, error: 'no_pending' };
  // Only talk to the calendar that issued the proof, and only to known calendars.
  const base = OTS_CALENDARS.find((c) => c === proof.calendar) ?? null;
  if (!base) return { status: 'error', calendar: proof.calendar, commitmentHex: pend.commitmentHex, error: 'unknown_calendar' };
  try {
    const r = await fetchImpl(`${base}/timestamp/${pend.commitmentHex}`, { headers: { Accept: 'application/vnd.opentimestamps.v1' }, signal: AbortSignal.timeout(8000) });
    if (r.status === 404) return { status: 'pending', calendar: base, commitmentHex: pend.commitmentHex };
    if (!r.ok) return { status: 'error', calendar: base, commitmentHex: pend.commitmentHex, error: `http_${r.status}` };
    const buf = Buffer.from(await r.arrayBuffer());
    const atts = parseOtsAttestations(pend.commitmentHex, buf);
    const btc = atts.find((a) => a.kind === 'bitcoin') as Extract<OtsAttestation, { kind: 'bitcoin' }> | undefined;
    if (!btc) return { status: 'pending', calendar: base, commitmentHex: pend.commitmentHex };
    return { status: 'complete', calendar: base, commitmentHex: pend.commitmentHex, responseB64: buf.toString('base64'), bitcoinHeight: btc.height };
  } catch (e) {
    return { status: 'error', calendar: base, commitmentHex: pend.commitmentHex, error: (e as Error).message.slice(0, 80) };
  }
}
