import { createPiiShield, type PiiShield } from '@/lib/ai/privacy/pii-shield';

/**
 * Central outbound PII guard. Every LLM/embeddings request leaves through meteredFetch, which calls
 * guardOutboundBody before the network and restoreAiResponse after it:
 *  - names/phone/email of the request's user (profile + auth) become pseudonyms/[[TOKENS]];
 *    any email / phone / Israeli-ID pattern is tokenized even when the user is unknown.
 *  - replies come back with the real values (JSON and SSE; SSE handles placeholders split across chunks).
 * Callers that already tokenize (chat writer) are unaffected: same deterministic pseudonyms.
 */
type Seed = { full_name?: string | null; phone?: string | null; email?: string | null };
const CACHE_TTL_MS = 10 * 60_000;
const seedCache = new Map<string, { at: number; seed: Seed }>();
let seedLoader: (userId: string) => Promise<Seed | null> = defaultSeedLoader;

/** tests only */
export function _setPiiSeedLoader(fn: (userId: string) => Promise<Seed | null>) {
  seedLoader = fn;
  seedCache.clear();
}

async function defaultSeedLoader(userId: string): Promise<Seed | null> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const [{ data: p }, { data: u }] = await Promise.all([
      admin.from('profiles').select('full_name, phone').eq('id', userId).maybeSingle(),
      admin.auth.admin.getUserById(userId),
    ]);
    return { full_name: p?.full_name ?? null, phone: p?.phone ?? null, email: u?.user?.email ?? null };
  } catch {
    return null;
  }
}

let directory: { at: number; names: string[] } | null = null;
let directoryLoader: () => Promise<string[]> = async () => {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { data } = await createAdminClient().from('profiles').select('full_name').not('full_name', 'is', null).limit(5000);
    const out = new Set<string>();
    for (const r of data ?? []) {
      const full = String(r.full_name ?? '').trim();
      if (full.length < 2) continue;
      out.add(full);
      const first = full.split(/\s+/)[0];
      if (first && first.length >= 2) out.add(first);
    }
    // longest first: full names are replaced before their first-name part
    return [...out].sort((a, b) => b.length - a.length);
  } catch {
    return [];
  }
};
/** tests only */
export function _setPiiDirectoryLoader(fn: () => Promise<string[]>) {
  directoryLoader = fn;
  directory = null;
}

/**
 * Background jobs (crons, batch summaries, merges) often run without a user in the usage context.
 * Then every known user name is shielded (small directory, cached), so nothing identifying leaks
 * even when attribution is missing. Emails/phones/IDs are covered by the shield's regexes anyway.
 */
async function directoryShield(): Promise<PiiShield> {
  if (!directory || Date.now() - directory.at > CACHE_TTL_MS) {
    const names = await Promise.race([directoryLoader(), new Promise<string[]>((r) => setTimeout(() => r([]), 1500))]);
    directory = { at: Date.now(), names };
  }
  return createPiiShield({ known_person_names: directory.names });
}

async function shieldFor(userId: string | null): Promise<PiiShield> {
  if (!userId) return directoryShield();
  const hit = seedCache.get(userId);
  let seed = hit && Date.now() - hit.at < CACHE_TTL_MS ? hit.seed : null;
  if (!seed) {
    seed = (await Promise.race([seedLoader(userId), new Promise<null>((r) => setTimeout(() => r(null), 1500))])) ?? {};
    if (Object.keys(seed).length) seedCache.set(userId, { at: Date.now(), seed });
  }
  // profile lookup timed out / failed / has no name → never send unmasked: fall back to the
  // directory shield (every known user name), merged with whatever phone/email we did get.
  if (!seed.full_name?.trim()) {
    const dir = await directoryShield();
    if (!seed.phone && !seed.email) return dir;
    return createPiiShield({ ...seed, known_person_names: directory?.names ?? [] });
  }
  return createPiiShield(seed);
}

function tokenizeContent(shield: PiiShield, c: unknown): unknown {
  if (typeof c === 'string') return shield.tokenizeText(c);
  if (Array.isArray(c))
    return c.map((part) =>
      part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
        ? { ...part, text: shield.tokenizeText((part as { text: string }).text) }
        : part
    );
  return c;
}

/** Tokenizes messages / prompt / embeddings input in a parsed request body (mutates + returns it). */
export async function guardOutboundBody(
  body: Record<string, unknown>,
  userId: string | null
): Promise<PiiShield> {
  const shield = await shieldFor(userId);
  if (Array.isArray(body.messages)) {
    body.messages = body.messages.map((m) => {
      if (!m || typeof m !== 'object') return m;
      const msg = { ...(m as Record<string, unknown>) };
      msg.content = tokenizeContent(shield, msg.content);
      if (Array.isArray(msg.tool_calls))
        msg.tool_calls = msg.tool_calls.map((tc: { function?: { arguments?: string } }) =>
          tc?.function?.arguments
            ? { ...tc, function: { ...tc.function, arguments: shield.tokenizeText(tc.function.arguments) } }
            : tc
        );
      return msg;
    });
  }
  if (typeof body.prompt === 'string') body.prompt = shield.tokenizeText(body.prompt);
  if (typeof body.input === 'string') body.input = shield.tokenizeText(body.input);
  else if (Array.isArray(body.input)) body.input = body.input.map((s) => (typeof s === 'string' ? shield.tokenizeText(s) : s));
  return shield;
}

type Choice = {
  index?: number;
  message?: { content?: unknown; tool_calls?: { function?: { arguments?: string } }[] };
  delta?: { content?: unknown };
  finish_reason?: string | null;
};

/** Restores real values in a JSON or SSE chat-completions response. */
export function restoreAiResponse(res: Response, shield: PiiShield): Response {
  if (!res.ok || !res.body || shield.registeredCount === 0) return res;
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  const isStream = (res.headers.get('content-type') ?? '').includes('event-stream');
  if (!isStream) {
    const p = res.text().then((t) => {
      try {
        const j = JSON.parse(t) as { choices?: Choice[] };
        for (const ch of j.choices ?? []) {
          if (typeof ch.message?.content === 'string') ch.message.content = shield.detokenizeText(ch.message.content);
          for (const tc of ch.message?.tool_calls ?? [])
            if (tc.function?.arguments) tc.function.arguments = shield.detokenizeText(tc.function.arguments);
        }
        return JSON.stringify(j);
      } catch {
        return shield.detokenizeText(t);
      }
    });
    const stream = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode(await p));
        ctrl.close();
      },
    });
    return new Response(stream, { status: res.status, statusText: res.statusText, headers });
  }
  return new Response(res.body.pipeThrough(sseDetokenizer(shield)), {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export function sseDetokenizer(shield: PiiShield): TransformStream<Uint8Array, Uint8Array> {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const per = new Map<number, ReturnType<PiiShield['createStreamDetokenizer']>>();
  let carry = '';
  const det = (i: number) => {
    let d = per.get(i);
    if (!d) per.set(i, (d = shield.createStreamDetokenizer()));
    return d;
  };
  const flushAll = (): string => {
    let out = '';
    for (const [i, d] of per) {
      const rest = d.flush();
      if (rest) out += `data: ${JSON.stringify({ choices: [{ index: i, delta: { content: rest } }] })}\n\n`;
    }
    per.clear();
    return out;
  };
  const line = (l: string): string => {
    if (!l.startsWith('data:')) return l;
    const payload = l.slice(5).trim();
    if (payload === '[DONE]') return `${flushAll()}${l}`;
    try {
      const j = JSON.parse(payload) as { choices?: Choice[] };
      for (const ch of j.choices ?? []) {
        const i = ch.index ?? 0;
        if (ch.delta && typeof ch.delta.content === 'string') ch.delta.content = det(i).push(ch.delta.content);
        if (ch.finish_reason) {
          const rest = per.get(i)?.flush() ?? '';
          per.delete(i);
          if (rest) ch.delta = { ...(ch.delta ?? {}), content: `${typeof ch.delta?.content === 'string' ? ch.delta.content : ''}${rest}` };
        }
      }
      return `data: ${JSON.stringify(j)}`;
    } catch {
      return l;
    }
  };
  return new TransformStream({
    transform(chunk, ctrl) {
      carry += dec.decode(chunk, { stream: true });
      const parts = carry.split('\n');
      carry = parts.pop() ?? '';
      if (parts.length) ctrl.enqueue(enc.encode(parts.map(line).join('\n') + '\n'));
    },
    flush(ctrl) {
      carry += dec.decode();
      let out = carry ? line(carry) : '';
      const rest = flushAll();
      if (rest) out = `${rest}${out}`;
      if (out) ctrl.enqueue(enc.encode(out));
    },
  });
}
