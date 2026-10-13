import { NURAWELL_CHAT_SYSTEM_PROMPT } from '@/lib/ai/prompts';

/** Preview-only latency probe for the EU migration test. 404 everywhere except Vercel preview. */
async function timed(fn: () => Promise<unknown>): Promise<number> {
  const t = Date.now();
  await fn().catch(() => null);
  return Date.now() - t;
}

async function llmTtft(model: string, system: string, viaRelay: boolean): Promise<{ headers: number; ttft: number }> {
  const t0 = Date.now();
  const body = JSON.stringify({
    model, stream: true, max_tokens: 120, reasoning: { effort: 'none' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: `אין לי כוח השבוע ${Math.random()}` }],
  });
  const url = viaRelay && process.env.AI_OPENROUTER_RELAY_HOST
    ? `https://${process.env.AI_OPENROUTER_RELAY_HOST}/api/v1/ai/llm-relay`
    : 'https://openrouter.ai/api/v1/chat/completions';
  const headers: Record<string, string> = viaRelay
    ? { 'Content-Type': 'application/json', 'x-nw-relay': process.env.CRON_SECRET ?? '' }
    : { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ''}` };
  const r = await fetch(url, { method: 'POST', headers, body });
  const h = Date.now() - t0;
  const rd = r.body!.getReader(); const dec = new TextDecoder(); let ttft = 0;
  while (!ttft) { const { value, done } = await rd.read(); if (done) break; const s = dec.decode(value); if (/"content":"[^"]/.test(s)) ttft = Date.now() - t0; }
  await rd.cancel().catch(() => {});
  return { headers: h, ttft };
}

export async function runRegionProbe(region: string): Promise<Response> {
  if (process.env.VERCEL_ENV !== 'preview') return new Response('not found', { status: 404 });
  const stagingUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const out: Record<string, unknown> = { region, vercel_region: process.env.VERCEL_REGION, supabase: stagingUrl };
  const rt = async (u: string, h: Record<string, string> = {}) => {
    const xs: number[] = [];
    for (let i = 0; i < 5; i++) xs.push(await timed(() => fetch(u, { headers: h, cache: 'no-store' }).then((r) => r.text())));
    return xs;
  };
  out.db_eu_rest_ms = await rt(`${stagingUrl}/rest/v1/journey_stations?select=id&limit=1`, { apikey: anon, Authorization: `Bearer ${anon}` });
  out.db_eu_health_ms = await rt('https://csxsxvzowlswahmfcsjk.supabase.co/auth/v1/health');
  out.db_syd_health_ms = await rt('https://iczzefgfsxfgcoqxanwl.supabase.co/auth/v1/health');
  const full = `${NURAWELL_CHAT_SYSTEM_PROMPT}\n\n${NURAWELL_CHAT_SYSTEM_PROMPT.slice(2000, 17000)}`;
  const runs = [];
  for (let i = 0; i < 3; i++) {
    runs.push({
      router_direct: await llmTtft('meta-llama/llama-4-maverick', 'Classify the message. Reply JSON {"heavy":true}.', false),
      writer_direct_46k: await llmTtft('openai/gpt-5.6-luna', full, false),
      writer_relay_46k: await llmTtft('openai/gpt-5.6-luna', full, true),
    });
  }
  out.llm = runs;
  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
