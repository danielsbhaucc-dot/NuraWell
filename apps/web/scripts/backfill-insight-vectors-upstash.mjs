/**
 * One-time backfill: upsert existing user_insights rows to Upstash Vector.
 *
 * Run after reverting pgvector (revert_000060) so semantic recall works for
 * insights that existed before Upstash sync was wired in persist/consolidation.
 *
 * Usage (from apps/web):
 *   node --env-file=.env.local scripts/backfill-insight-vectors-upstash.mjs
 *
 * Required:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY
 *   UPSTASH_VECTOR_REST_URL, UPSTASH_VECTOR_REST_TOKEN
 *
 * Optional:
 *   BACKFILL_PAGE_SIZE=100, BACKFILL_LIMIT=500, BACKFILL_DRY_RUN=1
 *   BACKFILL_EMBED_DELAY_MS=250, CONFIRM_PROD_BACKFILL=1
 */

const EMBEDDING_MODEL = 'openai/text-embedding-3-small';
const EMBEDDING_DIM = 1536;
const INSIGHT_PREFIX = 'insight:';
const SERVER_UA = 'NuraWell-Server/backfill-insight-vectors-upstash/1';

function envInt(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function envBool(name) {
  const v = process.env[name]?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function parseArgs(argv) {
  const out = { dryRun: envBool('BACKFILL_DRY_RUN'), limit: null };
  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('--limit=')) {
      const n = Number(arg.slice('--limit='.length));
      if (Number.isFinite(n) && n > 0) out.limit = Math.floor(n);
    }
  }
  const limitEnv = process.env.BACKFILL_LIMIT?.trim();
  if (out.limit == null && limitEnv) {
    const n = Number(limitEnv);
    if (Number.isFinite(n) && n > 0) out.limit = Math.floor(n);
  }
  return out;
}

function normalizeInsightText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 512);
}

function supabaseRestBase(url) {
  return url.trim().replace(/\/$/, '');
}

async function supabaseFetch(baseUrl, serviceKey, path, init = {}) {
  const res = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'User-Agent': SERVER_UA,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function fetchInsightPage(baseUrl, serviceKey, pageSize, offset) {
  const params = new URLSearchParams({
    select: 'id,user_id,insight_text,category,status,created_at,updated_at',
    status: 'neq.deprecated',
    insight_text: 'not.is.null',
    order: 'created_at.asc',
    limit: String(pageSize),
    offset: String(offset),
  });
  const rows = await supabaseFetch(baseUrl, serviceKey, `user_insights?${params}`);
  return Array.isArray(rows) ? rows : [];
}

async function embedTexts(texts, apiKey) {
  const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': SERVER_UA,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`OpenRouter embeddings ${res.status}: ${body.slice(0, 400)}`);
  const json = JSON.parse(body);
  const data = json?.data;
  if (!Array.isArray(data) || data.length !== texts.length) {
    throw new Error('OpenRouter embeddings: unexpected response shape');
  }
  return data.map((item) => {
    const vec = item.embedding;
    if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIM) {
      throw new Error(`embedding dimension ${vec?.length ?? 0}, expected ${EMBEDDING_DIM}`);
    }
    return vec;
  });
}

async function upsertUpstash(vectorUrl, vectorToken, row, vector) {
  const ns = encodeURIComponent('user-memory');
  const res = await fetch(`${vectorUrl.replace(/\/+$/, '')}/upsert/${ns}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${vectorToken}`,
      'Content-Type': 'application/json',
      'User-Agent': SERVER_UA,
    },
    body: JSON.stringify({
      id: `${INSIGHT_PREFIX}${row.id}`,
      vector,
      metadata: {
        userId: row.user_id,
        text: normalizeInsightText(row.insight_text),
        category: 'insight',
        isInsight: true,
        insightCategory: row.category,
        insightStatus: row.status,
        updatedAt: row.updated_at ?? row.created_at,
        firstSeenAt: row.created_at,
        lastSeenAt: row.updated_at ?? row.created_at,
        memoryLevel: 3,
        schema: 'nw-memory-v1',
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upstash upsert ${res.status}: ${err.slice(0, 300)}`);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const vectorUrl = process.env.UPSTASH_VECTOR_REST_URL?.trim();
  const vectorToken = process.env.UPSTASH_VECTOR_REST_TOKEN?.trim();

  if (!baseUrl || !serviceKey || !apiKey || !vectorUrl || !vectorToken) {
    console.error('Missing required env vars');
    process.exit(1);
  }

  const looksProd = /supabase\.co/i.test(baseUrl) && !/localhost|127\.0\.0\.1/i.test(baseUrl);
  if (looksProd && !envBool('CONFIRM_PROD_BACKFILL') && !dryRun) {
    console.error('Set CONFIRM_PROD_BACKFILL=1 to run against production Supabase');
    process.exit(1);
  }

  const pageSize = envInt('BACKFILL_PAGE_SIZE', 50);
  const delayMs = envInt('BACKFILL_EMBED_DELAY_MS', 250);
  const sb = supabaseRestBase(baseUrl);

  let offset = 0;
  let processed = 0;
  let upserted = 0;
  let skipped = 0;
  let errors = 0;

  console.log('[backfill-insight-vectors-upstash] start', { dryRun, limit: limit ?? 'all' });

  while (true) {
    if (limit != null && processed >= limit) break;

    const page = await fetchInsightPage(sb, serviceKey, pageSize, offset);
    if (!page.length) break;

    for (const row of page) {
      if (limit != null && processed >= limit) break;
      processed += 1;

      const text = normalizeInsightText(row.insight_text);
      if (!text) {
        skipped += 1;
        continue;
      }

      if (dryRun) {
        upserted += 1;
        continue;
      }

      try {
        const [vector] = await embedTexts([text], apiKey);
        await upsertUpstash(vectorUrl, vectorToken, row, vector);
        upserted += 1;
        if (delayMs > 0) await sleep(delayMs);
      } catch (err) {
        errors += 1;
        console.warn('[backfill] row failed', row.id, err instanceof Error ? err.message : err);
      }
    }

    offset += page.length;
    if (page.length < pageSize) break;
  }

  console.log('[backfill-insight-vectors-upstash] done', { processed, upserted, skipped, errors, dryRun });
}

main().catch((err) => {
  console.error('[backfill-insight-vectors-upstash] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
