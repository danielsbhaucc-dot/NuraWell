import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { macFor, verifyToken } from '@/lib/security-core/signed-actions';

describe('security-core is product-agnostic', () => {
  it('has no app (@/) imports', () => {
    const dir = join(__dirname, '../lib/security-core');
    for (const f of readdirSync(dir)) expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/from ['"]@\//);
  });
});

describe('signed actions', () => {
  it('verifies only with the right key and kind', () => {
    const t = `abcdefghijklmnop.${macFor('sx', 'abcdefghijklmnop', 'k1')}`;
    expect(verifyToken('sx', t, 'k1')).toBe('abcdefghijklmnop');
    expect(verifyToken('sx', t, 'k2')).toBeNull();
    expect(verifyToken('sk', t, 'k1')).toBeNull();
  });
});

describe('logs CSV export', () => {
  it('never includes investigation handles (inv)', async () => {
    const { toCsv } = await import('@/lib/logs/query');
    const csv = toCsv([{ id: '1', at: 't', type: 'admin', actor: 'a', action: 'GET', target: '/x', result: null, ip: null, country: null, detail: '', inv: { user: 'U-SECRET', session: 'S-SECRET', ipHash: 'H-SECRET' } }] as never);
    expect(csv).not.toMatch(/SECRET|inv/);
  });
});
