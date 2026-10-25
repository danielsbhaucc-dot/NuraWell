import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Standing rule: only non-identifying data reaches AI providers. Every provider call must pass the
 * central outbound PII guard (meteredFetch → guardOutboundBody). This test fails the build when a new
 * call path bypasses it.
 */
const ROOT = join(__dirname, '..');
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)) out.push(p);
  }
  return out;
}
const files = [...walk(join(ROOT, 'lib')), ...walk(join(ROOT, 'app'))].map((p) => ({
  rel: relative(ROOT, p).replace(/\\/g, '/'),
  src: readFileSync(p, 'utf8'),
}));
const AI_HOST = /openrouter\.ai|api\.groq\.com|api\.deepseek\.com|api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis|api\.x\.ai|api\.mistral\.ai|api\.together|deepinfra\.com|OPENROUTER_BASE_URL|DEEPSEEK_BASE_URL|groqLaneBaseUrl/;
const RAW_FETCH = /(^|[^a-zA-Z.])fetch\(/;

/** reviewed: raw fetch here receives a body that was already guarded, or is not a generation call */
const RAW_FETCH_ALLOWED: Record<string, string> = {
  'lib/ai/usage-meter.ts': 'the guard itself',
  'lib/ai/openrouter-relay.ts': 'transport used as meteredFetch base; key-check GET has no payload',
  'app/api/v1/ai/llm-relay/route.ts': 'internal relay behind CRON_SECRET; body already guarded by caller',
  'lib/ai/chat-memory/chat-summary-llm.ts': 'calls guardOutboundBody explicitly',
};
const FETCH_OPTION_ALLOWED = /fetch:\s*(withTimeoutFetch\(opts\.fetch \?\? meteredFetch\(\)|meteredFetch\(|groqCompatFetch|routePrimaryToDeepInfra)/;

describe('outbound AI PII guard coverage', () => {
  it('no raw fetch() to an AI provider outside reviewed files', () => {
    const bad = files
      .filter((f) => AI_HOST.test(f.src) && RAW_FETCH.test(f.src) && !RAW_FETCH_ALLOWED[f.rel])
      .map((f) => f.rel);
    expect(bad).toEqual([]);
  });

  it('every AI SDK client uses a guarded fetch', () => {
    const bad: string[] = [];
    for (const f of files) {
      const re = /(new OpenAI\(|createAiProvider\(|createOpenAI\()\{[\s\S]*?\n?\}\)/g;
      for (const m of f.src.match(re) ?? []) {
        const fetchOpt = m.match(/fetch:[^,\n}]*/);
        if (fetchOpt && !FETCH_OPTION_ALLOWED.test(fetchOpt[0])) bad.push(`${f.rel}: ${fetchOpt[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('custom fetch wrappers end in the guard', () => {
    const groq = files.find((f) => f.rel === 'lib/ai/groq-compat.ts')!.src;
    expect(groq).toMatch(/meteredFetch\(\)/);
    const notify = files.find((f) => f.rel === 'lib/ai/empathy-notify-completion.ts')!.src;
    expect(notify).not.toMatch(RAW_FETCH);
    expect(notify).toMatch(/meteredFetch\(\)/);
  });

  it('chat writer shields every model', () => {
    const chat = files.find((f) => f.rel === 'app/api/v1/ai/chat/route.ts')!.src;
    expect(chat).toMatch(/requiresPiiShield: true,/);
    expect(chat).not.toMatch(/requiresPiiShield: (false|is[A-Z]\w*|!)/);
  });
});
