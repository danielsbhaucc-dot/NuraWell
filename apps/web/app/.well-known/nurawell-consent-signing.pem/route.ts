import { publicKeyFingerprint, publicKeyPem } from '@/lib/legal/evidence-crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public Ed25519 key that verifies consent-evidence signatures. Public by design (no secret). */
export function GET() {
  try {
    const pem = publicKeyPem();
    return new Response(pem, {
      headers: {
        'Content-Type': 'application/x-pem-file; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        'X-Key-Fingerprint-SHA256': publicKeyFingerprint(pem),
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new Response('unavailable\n', { status: 503 });
  }
}
