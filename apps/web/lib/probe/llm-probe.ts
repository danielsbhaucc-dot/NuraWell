import { gzipSync } from 'node:zlib';
import { NURAWELL_CHAT_SYSTEM_PROMPT } from '@/lib/ai/prompts';

/** Preview-only: why is a 46k-prompt OpenRouter call slow from Vercel? Variants isolate the cause. */
type V = { name: string; system: string; enc?: 'gzip' | 'bytes'; model?: string; url?: string };

async function one(v: V) {
  const key = process.env.OPENROUTER_API_KEY ?? '';
  const json = JSON.stringify({
    model: v.model ?? 'openai/gpt-5.6-luna', stream: true, max_tokens: 60, reasoning: { effort: 'none' },
    messages: [{ role: 'system', content: v.system }, { role: 'user', content: `היי ${Math.random()}` }],
  });
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  let body: BodyInit = json;
  if (v.enc === 'gzip') { body = gzipSync(json); headers['Content-Encoding'] = 'gzip'; }
  if (v.enc === 'bytes') body = new TextEncoder().encode(json);
  const t0 = Date.now();
  const r = await fetch(v.url ?? 'https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers, body });
  const h = Date.now() - t0;
  if (v.url || v.model) { await r.text().catch(() => ''); return { v: v.name, status: r.status, headers_ms: h, total_ms: Date.now() - t0 }; }
  const rd = r.body!.getReader(); const dec = new TextDecoder(); let ttft = 0; let id = ''; let provider = ''; let buf = '';
  while (!ttft) {
    const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value);
    const m = buf.match(/"id":"(gen-[^"]+)"/); if (m) id = m[1];
    const p = buf.match(/"provider":"([^"]+)"/); if (p) provider = p[1];
    if (/"content":"[^"]/.test(buf)) ttft = Date.now() - t0;
  }
  await rd.cancel().catch(() => {});
  let or: unknown = null;
  if (id) {
    await new Promise((res) => setTimeout(res, 5000));
    const g = await fetch(`https://openrouter.ai/api/v1/generation?id=${id}`, { headers: { Authorization: `Bearer ${key}` } }).then((x) => x.json()).catch(() => null);
    const d = (g as { data?: Record<string, unknown> } | null)?.data;
    if (d) or = { latency: d.latency, provider: d.provider_name, cached: d.native_tokens_cached, prompt_tokens: d.native_tokens_prompt };
  }
  return { v: v.name, status: r.status, bytes: json.length, headers_ms: h, ttft, provider, or };
}

export async function runLlmProbe(): Promise<Response> {
  if (process.env.VERCEL_ENV !== 'preview') return new Response('not found', { status: 404 });
  const S = NURAWELL_CHAT_SYSTEM_PROMPT;
  const full = `${S}\n\n${S.slice(2000, 17000)}`;
  const vs: V[] = [
    { name: 'echo_46k_postman', system: full, url: 'https://postman-echo.com/post' },
    { name: 'bad_model_46k', system: full, model: 'nonexistent/model-x' },
    { name: 'bad_model_2k', system: S.slice(0, 2000), model: 'nonexistent/model-x' },
    { name: 'small_2k', system: S.slice(0, 2000) },
    { name: 'full_46k_string', system: full },
    { name: 'full_46k_bytes', system: full, enc: 'bytes' },
    { name: 'full_46k_string_again', system: full },
  ];
  const out = [];
  for (const v of vs) out.push(await one(v).catch((e) => ({ v: v.name, error: String(e) })));
  return Response.json({ region: process.env.VERCEL_REGION, out }, { headers: { 'Cache-Control': 'no-store' } });
}
