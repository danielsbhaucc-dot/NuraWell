/* Minimal in-memory Supabase query-builder fake for security unit tests. */
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

export function fakeDb(seed: Record<string, Row[]> = {}, rpcs: Record<string, (a: Row) => unknown> = {}) {
  const tables: Record<string, Row[]> = { ...seed };
  let n = 0;
  const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  function from(t: string) {
    tables[t] ??= [];
    const filters: Filter[] = [];
    let op: 'select' | 'update' | 'insert' | 'delete' = 'select';
    let patch: Row = {};
    let inserted: Row[] = [];
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
      gt: (c: string, v: string) => (filters.push((r) => String(r[c]) > v), q),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
      order: () => q, limit: () => q,
      update: (p: Row) => ((op = 'update'), (patch = p), q),
      delete: () => ((op = 'delete'), q),
      insert: (rows: Row | Row[]) => {
        op = 'insert';
        inserted = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ id: id(), created_at: new Date().toISOString(), ...r }));
        tables[t].push(...inserted);
        return q;
      },
      upsert: (r: Row) => { const k = 'user_id' in r ? 'user_id' : 'id'; const ex = tables[t].find((x) => x[k] === r[k]); if (ex) Object.assign(ex, r); else tables[t].push({ ...r }); return q; },
      run(): { data: Row[] } {
        if (op === 'insert') return { data: inserted };
        const hit = tables[t].filter((r) => filters.every((f) => f(r)));
        if (op === 'update') hit.forEach((r) => Object.assign(r, patch));
        if (op === 'delete') tables[t] = tables[t].filter((r) => !hit.includes(r));
        return { data: hit.map((r) => ({ ...r })) };
      },
      maybeSingle: async () => ({ data: q.run().data[0] ?? null, error: null }),
      single: async () => ({ data: q.run().data[0] ?? null, error: null }),
      then: (res: (v: { data: Row[]; error: null; count: number }) => unknown, rej?: (e: unknown) => unknown) => {
        try { const d = q.run().data; return Promise.resolve(res({ data: d, error: null, count: d.length })); } catch (e) { return rej ? rej(e) : Promise.reject(e); }
      },
    };
    return q;
  }
  return {
    tables,
    from,
    rpc: async (name: string, args: Row) => ({ data: rpcs[name] ? rpcs[name](args) : null, error: null }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'owner@example.test' } } }) } },
  };
}
