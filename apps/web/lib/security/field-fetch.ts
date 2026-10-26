/**
 * Central read path for encrypted columns: a fetch wrapper installed in every SERVER Supabase client
 * (lib/supabase/admin.ts, server.ts, api-route-client.ts, service-admin-client.ts).
 *
 * For PostgREST calls on a table in the field registry it:
 *   1. makes sure the select also returns the owner + row-key columns (needed to rebuild the AAD),
 *      unless the query aggregates (adding columns would change grouping);
 *   2. decrypts enc:v2 values in the top-level rows of the JSON response;
 *   3. removes the columns it added, so callers see exactly what they asked for.
 * Plaintext and enc:v1 values pass through untouched (dual-read). Embedded resources on registered tables are decrypted:
 * One level of embeds on registered tables is decrypted too (key columns added inside the embed, then removed).
 * The browser client is never wrapped: the browser never gets ciphertext keys.
 */
import { aadColumns, encryptedTable, FIELD_V2_TABLES, keyColumns, ownerOf, rowKeyOf, SYSTEM_ROW } from '@/lib/security/field-registry';
import { prepareWriteRow, sealedWriteCols } from '@/lib/security/field-write';
import { rewriteBlindFilters } from '@/lib/security/blind-index';
import { COLUMN_ENUMS, enumViolation } from '@/lib/security/column-enums';
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

export type EmbedPlan = { key: string; table: string; added: string[] };
const EMBED = /^(?:([A-Za-z_][\w]*):)?([A-Za-z_][\w]*)(?:!([\w]+))?\(([\s\S]*)\)$/;

/**
 * One level of embedded resources (`alias:table(cols)`, `table!inner(cols)`) on a registered table: its key columns are
 * added inside the embed so the nested rows can be decrypted, then removed again.
 */
function planEmbed(item: string): { item: string; embed: EmbedPlan | null } {
  const m = item.match(EMBED);
  if (!m) return { item, embed: null };
  const [, alias, name, hint, inner] = m;
  const spec = encryptedTable(name);
  if (!spec) return { item, embed: null };
  const key = alias ?? name;
  const inItems = splitTop(inner);
  if (inItems.includes('*') || AGG.test(inner)) return { item, embed: { key, table: name, added: [] } };
  const have = new Set(inItems.map(returnedKey).filter(Boolean) as string[]);
  const added = aadColumns(spec).filter((c) => !have.has(c));
  const rebuilt = `${alias ? `${alias}:` : ''}${name}${hint ? `!${hint}` : ''}(${[...inItems, ...added].join(',')})`;
  return { item: rebuilt, embed: { key, table: name, added } };
}

export function planSelect(table: string, select: string | null): { select: string | null; added: string[]; embeds: EmbedPlan[] } {
  const spec = encryptedTable(table);
  if (!spec || select === null) return { select, added: [], embeds: [] };
  const items0 = splitTop(select);
  const embeds: EmbedPlan[] = [];
  const items = items0.map((i) => {
    const r = planEmbed(i);
    if (r.embed) embeds.push(r.embed);
    return r.item;
  });
  const embedSelect = items.join(',');
  const changedEmbeds = embedSelect !== items0.join(',');
  if (items.some((i) => i === '*')) return { select: changedEmbeds ? embedSelect : select, added: [], embeds };
  if (AGG.test(select)) return { select, added: [], embeds: [] };
  const have = new Set(items.map(returnedKey).filter(Boolean) as string[]);
  const added = aadColumns(spec).filter((c) => !have.has(c));
  if (!added.length) return { select: changedEmbeds ? embedSelect : select, added, embeds };
  return { select: [...items, ...added].join(','), added, embeds };
}

async function fixEmbeds(row: Record<string, unknown>, embeds: EmbedPlan[], hasCipher: boolean): Promise<Record<string, unknown>> {
  if (!embeds.length) return row;
  const out = { ...row };
  for (const e of embeds) {
    const one = async (v: unknown) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
      const dec = hasCipher ? await (await import('@/lib/security/field-crypto')).decryptRow(e.table, v as Record<string, unknown>) : (v as Record<string, unknown>);
      if (!e.added.length) return dec;
      const c = { ...dec };
      for (const k of e.added) delete c[k];
      return c;
    };
    const v = out[e.key];
    out[e.key] = Array.isArray(v) ? await Promise.all(v.map(one)) : await one(v);
  }
  return out;
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
    if ((method === 'POST' || method === 'PATCH' || method === 'PUT') && COLUMN_ENUMS[table] && typeof init?.body === 'string') {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(init.body);
      } catch {
        parsed = null;
      }
      const bad = enumViolation(table, parsed);
      if (bad) {
        // same shape/code PostgREST returns for a CHECK violation, so callers' error handling is unchanged
        return new Response(
          JSON.stringify({ code: '23514', details: null, hint: null, message: `new row for relation "${table}" violates check constraint "${table}_${bad.column}_check"` }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        );
      }
    }
    const rewrote = await rewriteBlindFilters(table, url);
    if (rewrote) input = url.toString();
    if (method === 'HEAD' || method === 'DELETE' && !url.searchParams.has('select')) return base(input, init);

    // write path: seal registered columns of live tables before PostgREST sees them
    if ((method === 'POST' || method === 'PATCH') && FIELD_V2_TABLES.includes(table) && typeof init?.body === 'string') {
      const sealed = await sealWrite(base, table, method, url, init);
      if (sealed) return sealed;
    }

    const plan = planSelect(table, url.searchParams.get('select'));
    const rewritten = plan.select !== url.searchParams.get('select');
    if (rewritten) url.searchParams.set('select', plan.select!);
    const res = await base(rewritten ? url.toString() : input, init);

    const ct = res.headers.get('content-type') ?? '';
    if (!res.ok || !ct.includes('json')) return res;
    const text = await res.text();
    const embedAdded = plan.embeds.some((e) => e.added.length);
    if (!text.includes(FIELD_PREFIX_MARK) && !plan.added.length && !embedAdded) return rebuild(res, text);

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return rebuild(res, text);
    }
    const fix = async (row: unknown) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
      const top = text.includes(FIELD_PREFIX_MARK) ? await (await import('@/lib/security/field-crypto')).decryptRow(table, row as Record<string, unknown>) : (row as Record<string, unknown>);
      const dec = await fixEmbeds(top, plan.embeds, text.includes(FIELD_PREFIX_MARK));
      if (!plan.added.length) return dec;
      const copy = { ...dec };
      for (const k of plan.added) delete copy[k];
      return copy;
    };
    body = Array.isArray(body) ? await Promise.all(body.map(fix)) : await fix(body);
    return rebuild(res, JSON.stringify(body));
  };
}

type Init = NonNullable<Parameters<FetchFn>[1]>;
type Row = Record<string, unknown>;

/** seal one row's registered columns for (table, owner, row key) */
async function sealOne(table: string, row: Row, rowId: string, userId: string): Promise<Row> {
  const { sealRow } = await import('@/lib/security/field-crypto');
  return sealRow(table, userId, rowId, row);
}

function needsSeal(table: string, row: Row): boolean {
  return sealedWriteCols(table, row).length > 0;
}

/**
 * POST (insert / upsert) and PATCH (update) on a live table: every registered, non-BLOCKED column present in the
 * body is sealed as enc:v2 for (table, owner, row) before it is sent. The row key bound into the AAD is
 *   - insert: taken from the body, or a fresh uuid is assigned to `id` (all live tables default id to a uuid);
 *     upsert on a non-key conflict target first looks up the existing row's id so the AAD matches the stored row;
 *   - update: the matching rows' keys are read first and the update is sent per row (key filter added), so each
 *     row gets its own AAD. A row that changes between the read and the write is simply not matched.
 * Returns null to fall through unchanged (nothing to seal).
 */
async function sealWrite(base: FetchFn, table: string, method: string, url: URL, init: Init): Promise<Response | null> {
  const spec = encryptedTable(table)!;
  let body: unknown;
  try {
    body = JSON.parse(init.body as string);
  } catch {
    return null;
  }
  const rows = (Array.isArray(body) ? body : [body]) as Row[];
  if (!rows.some((r) => r && typeof r === 'object' && needsSeal(table, r))) return null;
  const keyCols = keyColumns(spec);
  const headers = new Headers(init.headers);

  if (method === 'POST') {
    const conflict = (url.searchParams.get('on_conflict') ?? '').split(',').map((c) => c.trim()).filter(Boolean);
    const out: Row[] = [];
    for (const r0 of rows) {
      let r = await prepareWriteRow(table, r0);
      if (!spec.system && !spec.rowCols && spec.rowCol === 'id' && r.id == null) {
        let id: unknown = null;
        if (conflict.length && !conflict.includes('id') && conflict.every((c) => r[c] !== undefined)) {
          const q = new URL(url.toString());
          q.search = '';
          q.searchParams.set('select', 'id');
          for (const c of conflict) q.searchParams.set(c, r[c] === null ? 'is.null' : `eq.${String(r[c])}`);
          const res = await base(q.toString(), { method: 'GET', headers: readHeaders(headers) });
          if (res.ok) id = ((await res.json()) as Row[])[0]?.id ?? null;
        }
        r = { ...r, id: id ?? crypto.randomUUID() };
      }
      const userId = ownerOf(spec, r);
      const rowId = rowKeyOf(spec, r);
      if (!userId && spec.ownerOptional) {
        // shared row (no owner): curriculum text, never per-user — stays plaintext (the DB trigger skips it too)
        out.push(r);
        continue;
      }
      if (!userId || !rowId) throw new Error(`${table}: insert must carry ${spec.userCol} and ${keyCols.join(', ')} to seal encrypted columns`);
      out.push(await sealOne(table, r, rowId, userId));
    }
    // PostgREST bulk insert needs the same keys in every object
    const keys = [...new Set(out.flatMap((r) => Object.keys(r)))];
    const norm = Array.isArray(body) ? out.map((r) => Object.fromEntries(keys.map((k) => [k, k in r ? r[k] : null]))) : out[0];
    return withFieldDecryption(base)(url.toString(), { ...init, body: JSON.stringify(norm) });
  }

  // PATCH
  const patch0 = rows[0];
  if (spec.system) {
    // one system key + constant AAD row id: seal once, forward the update unchanged (filters, bigint keys, bulk)
    const owner = ownerOf(spec, patch0)!;
    const patch = await sealOne(table, await prepareWriteRow(table, patch0), SYSTEM_ROW, owner);
    return withFieldDecryption(base)(url.toString(), { ...init, body: JSON.stringify(patch) });
  }
  const q = new URL(url.toString());
  q.searchParams.set('select', [...new Set([...keyCols, spec.userCol])].join(','));
  const pre = await base(q.toString(), { method: 'GET', headers: readHeaders(headers) });
  if (!pre.ok) return pre;
  const targets = (await pre.json()) as Row[];
  const results: unknown[] = [];
  let last: Response | null = null;
  for (const t of targets) {
    const userId = t[spec.userCol];
    const rowId = rowKeyOf(spec, t);
    if (!rowId) continue;
    let patch: Row;
    if (typeof userId !== 'string') {
      if (!spec.ownerOptional) continue;
      patch = await prepareWriteRow(table, { ...patch0 }); // shared row: plaintext by design
    } else patch = await sealOne(table, await prepareWriteRow(table, { ...patch0, [spec.userCol]: userId }), rowId, userId);
    if (!(spec.userCol in patch0)) delete patch[spec.userCol];
    const one = new URL(url.toString());
    for (const c of keyCols) one.searchParams.set(c, `eq.${String(t[c])}`);
    last = await withFieldDecryption(base)(one.toString(), { ...init, body: JSON.stringify(patch) });
    if (!last.ok) return last;
    const txt = await last.text();
    if (txt) {
      try {
        const j = JSON.parse(txt);
        if (Array.isArray(j)) results.push(...j);
        else results.push(j);
      } catch {
        /* no representation */
      }
    }
  }
  if (!last) return base(url.toString(), init); // nothing matched: let PostgREST answer as usual
  const wantsRep = (headers.get('prefer') ?? '').includes('return=representation');
  const h = new Headers(last.headers);
  h.delete('content-length');
  h.delete('content-encoding');
  h.set('content-range', `0-${Math.max(targets.length - 1, 0)}/*`);
  if (!wantsRep) return new Response(null, { status: 204, headers: h });
  const single = (headers.get('accept') ?? '').includes('vnd.pgrst.object');
  return new Response(JSON.stringify(single ? (results[0] ?? null) : results), { status: 200, headers: h });
}

function readHeaders(h: Headers): Headers {
  const r = new Headers();
  for (const k of ['apikey', 'authorization', 'accept-profile', 'content-profile', 'x-client-info']) {
    const v = h.get(k);
    if (v) r.set(k, v);
  }
  return r;
}

function rebuild(res: Response, text: string): Response {
  const h = new Headers(res.headers);
  h.delete('content-length');
  h.delete('content-encoding');
  return new Response(text, { status: res.status, statusText: res.statusText, headers: h });
}
