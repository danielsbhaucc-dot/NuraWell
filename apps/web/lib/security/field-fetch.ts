/**
 * Central read path for encrypted columns: a fetch wrapper installed in every SERVER Supabase client
 * (lib/supabase/admin.ts, server.ts, api-route-client.ts, service-admin-client.ts).
 *
 * For PostgREST calls on a table in the field registry it:
 *   1. makes sure the select also returns the owner + row-key columns (needed to rebuild the AAD),
 *      unless the query aggregates (adding columns would change grouping);
 *   2. decrypts enc:v2 values in the top-level rows of the JSON response;
 *   3. removes the columns it added, so callers see exactly what they asked for.
 * Plaintext and enc:v1 values pass through untouched (dual-read). Embedded resources are not decrypted
 * (none of the registered tables are read through embeds today; stage 5 guard enforces it).
 * The browser client is never wrapped: the browser never gets ciphertext keys.
 */
import { encryptedTable } from '@/lib/security/field-registry';
// field-crypto (node:crypto, KMS key) is loaded lazily, only when a response really holds enc:v2 values.
const FIELD_PREFIX_MARK = 'enc:v2:';

type FetchFn = typeof fetch;

const AGG = /(^|[,(.:])\s*(count|sum|avg|min|max)\s*\(/i;

function splitTop(select: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of select) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** plain column name a top-level select item returns, or null for embeds / casts we don't track */
function returnedKey(item: string): string | null {
  if (item.includes('(')) return null;
  const alias = item.includes(':') ? item.split(':')[0] : item;
  return alias.replace(/::.*$/, '').trim();
}

export function planSelect(table: string, select: string | null): { select: string | null; added: string[] } {
  const spec = encryptedTable(table);
  if (!spec || select === null) return { select, added: [] };
  const items = splitTop(select);
  if (items.some((i) => i === '*')) return { select, added: [] };
  if (AGG.test(select)) return { select, added: [] };
  const have = new Set(items.map(returnedKey).filter(Boolean) as string[]);
  const added = [...new Set([spec.userCol, spec.rowCol])].filter((c) => !have.has(c));
  if (!added.length) return { select, added };
  return { select: [...items, ...added].join(','), added };
}

export function tableFromUrl(url: URL): string | null {
  const m = url.pathname.match(/\/rest\/v1\/([^/?]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function withFieldDecryption(base: FetchFn = fetch): FetchFn {
  return async (input, init) => {
    let url: URL;
    try {
      url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    } catch {
      return base(input, init);
    }
    const table = tableFromUrl(url);
    if (!table || !encryptedTable(table)) return base(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method === 'HEAD' || method === 'DELETE' && !url.searchParams.has('select')) return base(input, init);

    const plan = planSelect(table, url.searchParams.get('select'));
    if (plan.added.length) url.searchParams.set('select', plan.select!);
    const res = await base(plan.added.length ? url.toString() : input, init);

    const ct = res.headers.get('content-type') ?? '';
    if (!res.ok || !ct.includes('json')) return res;
    const text = await res.text();
    if (!text.includes(FIELD_PREFIX_MARK) && !plan.added.length) return rebuild(res, text);

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return rebuild(res, text);
    }
    const fix = async (row: unknown) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
      const dec = text.includes(FIELD_PREFIX_MARK) ? await (await import('@/lib/security/field-crypto')).decryptRow(table, row as Record<string, unknown>) : (row as Record<string, unknown>);
      if (!plan.added.length) return dec;
      const copy = { ...dec };
      for (const k of plan.added) delete copy[k];
      return copy;
    };
    body = Array.isArray(body) ? await Promise.all(body.map(fix)) : await fix(body);
    return rebuild(res, JSON.stringify(body));
  };
}

function rebuild(res: Response, text: string): Response {
  const h = new Headers(res.headers);
  h.delete('content-length');
  h.delete('content-encoding');
  return new Response(text, { status: res.status, statusText: res.statusText, headers: h });
}
