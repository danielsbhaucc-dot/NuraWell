import { RELAY_HEADER } from '@/lib/ai/openrouter-relay';

/** Internal relay: see lib/ai/openrouter-relay.ts. Pinned to iad1, next to OpenRouter / OpenAI. */
export const runtime = 'nodejs';
export const preferredRegion = 'iad1';
export const dynamic = 'force-dynamic';

const ALLOWED_FORWARD = new Set(['x-grok-conv-id', 'http-referer', 'x-title', 'x-openrouter-cache']);

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get(RELAY_HEADER) !== secret) {
    return new Response('not found', { status: 404 });
  }
  // warm-up: open TLS to OpenRouter from this iad1 isolate (tiny authenticated GET, no generation)
  if (req.headers.get('x-nw-warm') === '1') {
    await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY?.trim() ?? ''}` } }).then((r) => r.body?.cancel()).catch(() => {});
    return new Response(null, { status: 204, headers: { 'x-nw-relayed': '1', 'Cache-Control': 'no-store' } });
  }
  const forward: Record<string, string> = {};
  try {
    const parsed = JSON.parse(req.headers.get('x-nw-forward') ?? '{}') as Record<string, unknown>;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && ALLOWED_FORWARD.has(k.toLowerCase())) forward[k] = v;
    }
  } catch {
    /* no extra headers */
  }
  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY?.trim() ?? ''}`,
      ...forward,
    },
    body: await req.text(),
    signal: req.signal,
  });
  const headers = new Headers({ 'x-nw-relayed': '1', 'Cache-Control': 'no-store' });
  const ct = upstream.headers.get('content-type');
  if (ct) headers.set('content-type', ct);
  return new Response(upstream.body, { status: upstream.status, headers });
}
