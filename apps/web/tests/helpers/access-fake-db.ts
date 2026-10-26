/** Minimal chainable Supabase fake: per-table result queue + rpc handlers; records every call. */
export type Call = { table: string; op: string; args: unknown[] };
export function fakeDb(opts: { results?: Record<string, unknown[]>; rpc?: Record<string, (args: Record<string, unknown>) => unknown>; failInsert?: string[] } = {}) {
  const calls: Call[] = [];
  const queues: Record<string, unknown[]> = Object.fromEntries(Object.entries(opts.results ?? {}).map(([k, v]) => [k, [...v]]));
  const from = (table: string) => {
    let op = 'select';
    const res = () => {
      if (op === 'insert' && opts.failInsert?.includes(table)) return { data: null, error: { message: 'fail' } };
      const q = queues[`${table}:${op}`] ?? queues[table];
      const v = q && q.length ? (q.length > 1 ? q.shift() : q[0]) : null;
      return { data: v, error: null, count: Array.isArray(v) ? v.length : 0 };
    };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'gt', 'gte', 'lt', 'not', 'order', 'limit', 'in']) chain[m] = (...a: unknown[]) => { calls.push({ table, op: m, args: a }); return chain; };
    for (const m of ['insert', 'update', 'upsert', 'delete']) chain[m] = (...a: unknown[]) => { op = m; calls.push({ table, op: m, args: a }); return chain; };
    chain.single = async () => res();
    chain.maybeSingle = async () => res();
    chain.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(res()).then(ok, bad);
    return chain;
  };
  const db = {
    from, calls,
    rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ table: `rpc:${name}`, op: 'rpc', args: [args] }); const h = opts.rpc?.[name]; return { data: h ? h(args) : null, error: null }; },
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'owner@example.test' } } }) } },
  };
  return db;
}
