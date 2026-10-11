/** Minimal in-memory PostgREST-like client for integration tests (supports the chains lib/tasks uses). */
type Row = Record<string, unknown>;
let seq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

export function createFakeSupabase(seed: Record<string, Row[]> = {}) {
  const db: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  const table = (n: string) => (db[n] ??= []);

  function query(name: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
    let payload: Row | Row[] | null = null;
    let onConflict: string[] = [];
    let selectCols = '*';
    let limitN = Infinity;
    const orders: Array<[string, boolean]> = [];

    const embed = (r: Row): Row => {
      const m = selectCols.match(/(\w+):(\w+)\(/);
      if (!m) return { ...r };
      const [, alias, t] = m;
      const fk = t === 'task_definitions' ? 'definition_id' : `${t}_id`;
      return { ...r, [alias]: table(t).find((x) => x.id === r[fk]) ?? null };
    };

    const run = (): { data: unknown; error: null | { message: string } } => {
      const rows = table(name);
      if (op === 'insert') {
        const list = (Array.isArray(payload) ? payload : [payload as Row]).map((p) => ({ id: uid(), occurred_at: new Date().toISOString(), ...p }));
        rows.push(...list);
        return { data: list.map(embed), error: null };
      }
      if (op === 'upsert') {
        const p = payload as Row;
        const ex = rows.find((r) => onConflict.every((k) => r[k] === p[k]));
        if (ex) Object.assign(ex, p);
        const defaults: Row = name === 'user_task_assignments' ? { current_level: 0, original_level: 0, last_level_change_at: null } : name === 'task_definitions' ? { ladder: [], floor_level: -2, max_level: 0 } : {};
        const row = ex ?? { id: uid(), ...defaults, ...p };
        if (!ex) rows.push(row);
        return { data: [embed(row)], error: null };
      }
      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (op === 'update') {
        matched.forEach((r) => Object.assign(r, payload));
        return { data: matched, error: null };
      }
      let out = matched.map(embed);
      for (const [k, asc] of [...orders].reverse()) {
        out = [...out].sort((a, b) => {
          const x = String(a[k] ?? '');
          const y = String(b[k] ?? '');
          return x === y ? 0 : (x < y ? -1 : 1) * (asc ? 1 : -1);
        });
      }
      return { data: out.slice(0, limitN), error: null };
    };

    const api: Record<string, unknown> = {
      select(cols = '*') { selectCols = cols; return api; },
      insert(p: Row | Row[]) { op = 'insert'; payload = p; return api; },
      update(p: Row) { op = 'update'; payload = p; return api; },
      upsert(p: Row, o?: { onConflict?: string }) { op = 'upsert'; payload = p; onConflict = (o?.onConflict ?? 'id').split(','); return api; },
      eq(k: string, v: unknown) { filters.push((r) => r[k] === v); return api; },
      in(k: string, v: unknown[]) { filters.push((r) => v.includes(r[k])); return api; },
      gte(k: string, v: string) { filters.push((r) => r[k] != null && String(r[k]) >= v); return api; },
      gt(k: string, v: string) { filters.push((r) => r[k] != null && String(r[k]) > v); return api; },
      lt(k: string, v: number) { filters.push((r) => (r[k] as number) < v); return api; },
      order(k: string, o?: { ascending?: boolean }) { orders.push([k, o?.ascending !== false]); return api; },
      limit(n: number) { limitN = n; return api; },
      maybeSingle: async () => ({ data: (run().data as Row[])[0] ?? null, error: null }),
      single: async () => {
        const d = run().data as Row[];
        return d[0] ? { data: d[0], error: null } : { data: null, error: { message: 'no rows' } };
      },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
        return Promise.resolve().then(run).then(res, rej);
      },
    };
    return api;
  }

  return { client: { from: (n: string) => query(n) } as never, db };
}
