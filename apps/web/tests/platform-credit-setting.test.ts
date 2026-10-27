import { describe, expect, it } from 'vitest';
import { creditVisible, setOwnedCredit } from '@/lib/platform/credit-setting';

const owned = { nurawell: true, sample: true };

function fakeDb(initial: Record<string, boolean | null>) {
  const rows = { ...initial };
  const db = {
    rows,
    from: () => ({
      select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: id in rows ? { credit_enabled: rows[id] } : null }) }) }),
      update: (v: { credit_enabled: boolean | null }) => ({ eq: async (_c: string, id: string) => { rows[id] = v.credit_enabled; return { error: null }; } }),
    }),
  };
  return db;
}

describe('powered-by credit setting', () => {
  it('owned product: OFF by default', () => {
    expect(creditVisible({ productId: 'nurawell', setting: null, whiteLabel: false, owned })).toBe(false);
    expect(creditVisible({ productId: 'nurawell', setting: undefined, whiteLabel: false, owned })).toBe(false);
  });
  it('owned product: owner toggle ON then OFF, every change audited', async () => {
    const db = fakeDb({ nurawell: null });
    const log: unknown[] = [];
    const a = async (k: string, p: string, d: Record<string, unknown>) => { log.push([k, p, d]); return true; };
    expect(await setOwnedCredit(db as never, 'nurawell', true, a, owned)).toEqual({ ok: true });
    expect(creditVisible({ productId: 'nurawell', setting: db.rows.nurawell, whiteLabel: false, owned })).toBe(true);
    expect(await setOwnedCredit(db as never, 'nurawell', false, a, owned)).toEqual({ ok: true });
    expect(creditVisible({ productId: 'nurawell', setting: db.rows.nurawell, whiteLabel: false, owned })).toBe(false);
    expect(log).toEqual([['credit.toggle', 'nurawell', { from: null, to: true }], ['credit.toggle', 'nurawell', { from: true, to: false }]]);
  });
  it('audit failure rolls the change back (fail-closed)', async () => {
    const db = fakeDb({ nurawell: null });
    const r = await setOwnedCredit(db as never, 'nurawell', true, async () => false, owned);
    expect(r).toMatchObject({ ok: false, error: 'audit_failed' });
    expect(db.rows.nurawell).toBeNull();
  });
  it('customer product: ON by default, setting ignored, only white_label hides it', async () => {
    expect(creditVisible({ productId: 'acme', setting: null, whiteLabel: false, owned })).toBe(true);
    expect(creditVisible({ productId: 'acme', setting: false, whiteLabel: false, owned })).toBe(true);
    expect(creditVisible({ productId: 'acme', setting: null, whiteLabel: true, owned })).toBe(false);
    const db = fakeDb({ acme: null });
    expect(await setOwnedCredit(db as never, 'acme', false, async () => true, owned)).toMatchObject({ ok: false, error: 'not_owned' });
  });
});
