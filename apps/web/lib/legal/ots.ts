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
