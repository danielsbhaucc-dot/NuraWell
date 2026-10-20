import { publishedSigningKeys } from '@/lib/legal/evidence-crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Every consent-evidence verification key ever used (current + retired). Public by design. */
export function GET() {
  const keys = publishedSigningKeys();
  return new Response(JSON.stringify({ algorithm: 'Ed25519', keys }, null, 2), {
    status: keys.length ? 200 : 503,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
