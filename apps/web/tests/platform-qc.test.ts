import { describe, expect, it } from 'vitest';
import { grade, runChecks, validateChecks, type QcCheck } from '@platform/qc';
import { MODULES } from '@/lib/platform/catalog';
import { permissionFor } from '@/lib/platform/route-permissions';

const ctx = { productId: 'invest', sinceMs: 0, now: 1 };
const ok: QcCheck = { id: 'aa', label: 'א', description: '', run: async () => ({ status: 'ok', value: 0, detail: '' }) };

describe('@platform/qc', () => {
  it('grades thresholds', () => {
    expect(grade(0, 5, 10)).toBe('ok'); expect(grade(5, 5, 10)).toBe('warn'); expect(grade(10, 5, 10)).toBe('fail');
  });
  it('a throwing or hanging check becomes fail, never crashes the report', async () => {
    const boom: QcCheck = { id: 'bb', label: 'ב', description: '', run: async () => { throw new Error('x'); } };
    const hang: QcCheck = { id: 'cc', label: 'ג', description: '', run: () => new Promise(() => {}) };
    const r = await runChecks([ok, boom, hang], ctx, { timeoutMs: 20 });
    expect(r.overall).toBe('fail');
    expect(r.results.map((x) => x.status)).toEqual(['ok', 'fail', 'fail']);
  });
  it('a product with no checks is an honest empty ok report', async () => {
    expect(await runChecks([], ctx)).toMatchObject({ overall: 'ok', results: [] });
  });
  it('validates ids', () => expect(validateChecks([ok, ok]).length).toBe(1));
  it('qc is a per-product module, guarded by qc.read', () => {
    expect(MODULES.find((m) => m.id === 'qc')).toMatchObject({ core: false });
    expect(permissionFor('/api/v1/ops/qc', 'GET')).toBe('qc.read');
  });
});
