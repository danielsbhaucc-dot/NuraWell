import { describe, expect, it } from 'vitest';
import { createHooks } from '@platform/hooks';

describe('@platform/hooks', () => {
  it('filters run by priority, ties in registration order', async () => {
    const h = createHooks();
    h.addFilter<string>('a.b', (v) => v + '2', 'm2', 20);
    h.addFilter<string>('a.b', (v) => v + '1', 'm1', 10);
    h.addFilter<string>('a.b', (v) => v + '1b', 'm1b', 10);
    expect(await h.applyFilters('a.b', '0')).toBe('011b2');
  });
  it('a throwing filter is skipped and reported', async () => {
    const seen: string[] = [];
    const h = createHooks({ onError: (e) => seen.push(e.owner) });
    h.addFilter<number>('a.b', () => { throw new Error('x'); }, 'bad');
    h.addFilter<number>('a.b', (v) => v + 1, 'ok', 20);
    expect(await h.applyFilters('a.b', 1)).toBe(2);
    expect(seen).toEqual(['bad']);
  });
  it('actions run all handlers and return errors instead of throwing', async () => {
    const h = createHooks(); const ran: string[] = [];
    h.addAction('auth.after-signup', () => { ran.push('a'); throw new Error('boom'); }, 'x');
    h.addAction('auth.after-signup', () => { ran.push('b'); }, 'y');
    const errs = await h.doAction('auth.after-signup', {});
    expect(ran).toEqual(['a', 'b']); expect(errs.map((e) => e.owner)).toEqual(['x']);
  });
  it('removeOwner and unsubscribe drop handlers; bad names rejected', async () => {
    const h = createHooks();
    const off = h.addFilter<number>('a.b', (v) => v * 2, 'm');
    h.addFilter<number>('a.b', (v) => v + 1, 'n');
    h.removeOwner('n'); expect(await h.applyFilters('a.b', 3)).toBe(6);
    off(); expect(await h.applyFilters('a.b', 3)).toBe(3);
    expect(() => h.addAction('NoDot', () => {}, 'm')).toThrow();
    expect(h.list()).toEqual([]);
  });
});
