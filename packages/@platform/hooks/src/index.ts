/**
 * @platform/hooks: WordPress-style actions and filters for products and modules.
 * Pure, product-agnostic, no I/O. A product creates ONE registry; modules add handlers by name.
 * - filter: value passes through handlers by priority (lower first); a throwing handler is skipped (fail-safe, value kept).
 * - action: all handlers run by priority; errors are collected and returned, never thrown to the caller.
 */
export type Priority = number;
type Entry<F> = { fn: F; priority: Priority; owner: string; seq: number };
export type HookError = { hook: string; owner: string; error: unknown };

const NAME = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/; // "<module>.<event>", e.g. "auth.after-signup"

export function createHooks(opts: { onError?: (e: HookError) => void } = {}) {
  const filters = new Map<string, Entry<(v: unknown, ctx: unknown) => unknown>[]>();
  const actions = new Map<string, Entry<(ctx: unknown) => unknown>[]>();
  let seq = 0;
  const check = (name: string) => { if (!NAME.test(name)) throw new Error(`hook name must be "<module>.<event>": ${name}`); };
  const add = <F>(map: Map<string, Entry<F>[]>, name: string, fn: F, owner: string, priority: Priority) => {
    check(name);
    const list = map.get(name) ?? [];
    const e = { fn, priority, owner, seq: seq++ };
    list.push(e); list.sort((a, b) => a.priority - b.priority || a.seq - b.seq); map.set(name, list);
    return () => { const l = map.get(name); if (l) map.set(name, l.filter((x) => x !== e)); };
  };
  const report = (hook: string, owner: string, error: unknown) => { opts.onError?.({ hook, owner, error }); return { hook, owner, error }; };
  return {
    addFilter<T, C = unknown>(name: string, fn: (value: T, ctx: C) => T | Promise<T>, owner: string, priority: Priority = 10) {
      return add(filters, name, fn as (v: unknown, c: unknown) => unknown, owner, priority);
    },
    addAction<C = unknown>(name: string, fn: (ctx: C) => void | Promise<void>, owner: string, priority: Priority = 10) {
      return add(actions, name, fn as (c: unknown) => unknown, owner, priority);
    },
    async applyFilters<T, C = unknown>(name: string, value: T, ctx?: C): Promise<T> {
      let v: unknown = value;
      for (const e of filters.get(name) ?? []) {
        try { v = await e.fn(v, ctx); } catch (err) { report(name, e.owner, err); }
      }
      return v as T;
    },
    async doAction<C = unknown>(name: string, ctx?: C): Promise<HookError[]> {
      const errs: HookError[] = [];
      for (const e of actions.get(name) ?? []) {
        try { await e.fn(ctx); } catch (err) { errs.push(report(name, e.owner, err)); }
      }
      return errs;
    },
    /** Remove every handler of one module (used when a module is disabled for a product). */
    removeOwner(owner: string) {
      for (const m of [filters, actions] as Map<string, Entry<unknown>[]>[]) for (const [k, l] of m) m.set(k, l.filter((e) => e.owner !== owner));
    },
    list() {
      const out: { kind: 'filter' | 'action'; name: string; owner: string; priority: Priority }[] = [];
      for (const [name, l] of filters) for (const e of l) out.push({ kind: 'filter', name, owner: e.owner, priority: e.priority });
      for (const [name, l] of actions) for (const e of l) out.push({ kind: 'action', name, owner: e.owner, priority: e.priority });
      return out;
    },
  };
}
export type Hooks = ReturnType<typeof createHooks>;
