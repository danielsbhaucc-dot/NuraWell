/**
 * Conformance helpers (module catalog §9.5). Pure: the product supplies rows and its column registry.
 * isSealedValue mirrors public.enc_value_ok (supabase/migrations/000203) exactly, so the app-side check and the
 * DB reject trigger agree on what counts as "not plaintext".
 */
export type SealedColumns = Record<string, Record<string, unknown>>; // table -> column -> kind

const SEALED = /^enc:v[12]:/;

export function isSealedValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v === '' || SEALED.test(v);
  if (Array.isArray(v)) return v.every((e) => typeof e === 'string' && (e === '' || SEALED.test(e)));
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

export type PlaintextFinding = { table: string; column: string; count: number };

/** Returns one finding per (table, column) holding any unsealed value. Never returns the values themselves. */
export function findPlaintext(table: string, columns: readonly string[], rows: readonly Record<string, unknown>[]): PlaintextFinding[] {
  const out: PlaintextFinding[] = [];
  for (const column of columns) {
    const count = rows.reduce((n, r) => n + (isSealedValue(r[column]) ? 0 : 1), 0);
    if (count > 0) out.push({ table, column, count });
  }
  return out;
}

/** Read-only SQL (counts only, no values) for the live/nightly check against any Supabase project. */
export function plaintextCountSql(table: string, column: string): string {
  const id = (s: string) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`unsafe identifier: ${s}`);
    return `"${s}"`;
  };
  return `select count(*)::int as n from public.${id(table)} where not public.enc_value_ok(to_jsonb(${id(column)}))`;
}
