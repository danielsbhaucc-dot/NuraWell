/**
 * One-time backfill: populate user_insights.embedding where embedding IS NULL.
 *
 * Run after migration 000060_user_insights_pgvector.sql so semantic recall is
 * immediately ready for all existing insights (consolidation only processes new logs).
 *
 * Usage (from apps/web):
 *   node --env-file=.env.local scripts/backfill-insight-embeddings.mjs
 *
 * Required in .env.local (or env):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENROUTER_API_KEY
 *
 * Optional:
 *   BACKFILL_EMBED_BATCH=16        — rows per OpenRouter embeddings request (max 32)
 *   BACKFILL_PAGE_SIZE=100         — Supabase fetch page size
 *   BACKFILL_EMBED_DELAY_MS=250    — pause between embed batches
 *   BACKFILL_LIMIT=500             — stop after N rows (omit = all)
 *   BACKFILL_DRY_RUN=1             — count only, no API writes
 *   CONFIRM_PROD_BACKFILL=1        — required when URL looks like production
 *
 * Flags (override env):
 *   --dry-run
 *   --limit=N
 */

const EMBEDDING_MODEL = 'openai/text-embedding-3-small';
const EMBEDDING_DIM = 1536;
const SERVER_UA = 'NuraWell-Server/backfill-insight-embeddings/1';

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

async function fetchNullEmbeddingPage(baseUrl, serviceKey, pageSize, offset) {
  const params = new URLSearchParams({
    select: 'id,insight_text',
    embedding: 'is.null',
    insight_text: 'not.is.null',
    order: 'created_at.asc',
    limit: String(pageSize),
    offset: String(offset),
  });
  const rows = await supabaseFetch(baseUrl, serviceKey, `user_insights?${params}`);
  return Array.isArray(rows) ? rows : [];
}

async function countNullEmbeddings(baseUrl, serviceKey) {
  const params = new URLSearchParams({
    select: 'id',
    embedding: 'is.null',
    insight_text: 'not.is.null',
  });
  const res = await fetch(`${baseUrl}/rest/v1/user_insights?${params}`, {
    method: 'HEAD',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: 'count=exact',
      'User-Agent': SERVER_UA,
    },
  });
  const range = res.headers.get('content-range');
  if (!range) return null;
  const total = range.split('/')[1];
  const n = Number(total);
  return Number.isFinite(n) ? n : null;
}

async function embedTexts(apiKey, referer, texts) {
  const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': referer,
      'X-Title': 'NuraWell',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`OpenRouter embeddings ${res.status}: ${body.slice(0, 400)}`);
  }
  const json = JSON.parse(body);
  const data = json.data;
  if (!Array.isArray(data) || data.length !== texts.length) {
    throw new Error('OpenRouter embeddings: unexpected response shape');
  }
  const sorted = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return sorted.map((item) => {
    const vec = item.embedding;
    if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIM) {
      throw new Error(`embedding dimension ${vec?.length ?? 0}, expected ${EMBEDDING_DIM}`);
    }
    return vec;
  });
}

async function updateEmbedding(baseUrl, serviceKey, id, embedding) {
  const params = new URLSearchParams({ id: `eq.${id}` });
  await supabaseFetch(baseUrl, serviceKey, `user_insights?${params}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ embedding }),
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLikelyProductionUrl(url) {
  const u = url.toLowerCase();
  return (
    u.includes('nurawell') ||
    (!u.includes('localhost') && !u.includes('127.0.0.1') && !u.includes('.local'))
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const referer =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_URL?.trim()?.replace(/^/, 'https://') ||
    'https://nurawell.vercel.app';

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!apiKey && !args.dryRun) {
    throw new Error('Missing OPENROUTER_API_KEY (or use --dry-run to count only)');
  }

  if (isLikelyProductionUrl(supabaseUrl) && !envBool('CONFIRM_PROD_BACKFILL') && !args.dryRun) {
    throw new Error(
      'Production-like Supabase URL detected. Set CONFIRM_PROD_BACKFILL=1 to proceed.'
    );
  }

  const baseUrl = supabaseRestBase(supabaseUrl);
  const pageSize = Math.min(200, envInt('BACKFILL_PAGE_SIZE', 100));
  const embedBatch = Math.min(32, envInt('BACKFILL_EMBED_BATCH', 16));
  const delayMs = envInt('BACKFILL_EMBED_DELAY_MS', 250);

  const pending = await countNullEmbeddings(baseUrl, serviceKey);
  console.log('[backfill-insight-embeddings] pending (null embedding):', pending ?? 'unknown');
  if (args.dryRun) {
    console.log('[backfill-insight-embeddings] dry-run — no embeddings or DB updates');
    return;
  }

  let offset = 0;
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  while (true) {
    if (args.limit != null && processed >= args.limit) break;

    const page = await fetchNullEmbeddingPage(baseUrl, serviceKey, pageSize, offset);
    if (!page.length) break;

    const work = [];
    for (const row of page) {
      if (args.limit != null && processed >= args.limit) break;
      const text = normalizeInsightText(row.insight_text);
      processed += 1;
      if (!text) {
        skipped += 1;
        continue;
      }
      work.push({ id: row.id, text });
    }

    for (let i = 0; i < work.length; i += embedBatch) {
      const chunk = work.slice(i, i + embedBatch);
      try {
        const vectors = await embedTexts(
          apiKey,
          referer,
          chunk.map((r) => r.text)
        );
        for (let j = 0; j < chunk.length; j += 1) {
          try {
            await updateEmbedding(baseUrl, serviceKey, chunk[j].id, vectors[j]);
            updated += 1;
          } catch (err) {
            failed += 1;
            console.warn('[backfill] update failed', chunk[j].id, err instanceof Error ? err.message : err);
          }
        }
      } catch (err) {
        failed += chunk.length;
        console.warn(
          '[backfill] embed batch failed',
          err instanceof Error ? err.message : err
        );
      }
      if (delayMs > 0) await sleep(delayMs);
    }

    console.log(
      `[backfill] progress processed=${processed} updated=${updated} skipped=${skipped} failed=${failed}`
    );

    if (page.length < pageSize) break;
    offset += pageSize;
  }

  const remaining = await countNullEmbeddings(baseUrl, serviceKey);
  console.log('[backfill-insight-embeddings] done', {
    processed,
    updated,
    skipped,
    failed,
    remaining_null_embedding: remaining,
  });

  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[backfill-insight-embeddings] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
