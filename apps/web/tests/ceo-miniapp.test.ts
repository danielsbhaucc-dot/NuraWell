import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyInitData } from '@/lib/ceo/miniapp';

const bot = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi';
function sign(fields: Record<string, string>) {
  const dc = Object.entries(fields).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const hash = createHmac('sha256', createHmac('sha256', 'WebAppData').update(bot).digest()).update(dc).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}
describe('mini app initData', () => {
  const now = Date.now();
  const f = { auth_date: String(Math.floor(now / 1000)), user: JSON.stringify({ id: 42, first_name: 'D' }), query_id: 'q' };
  it('accepts a valid signature and returns the user id', () => {
    expect(verifyInitData(sign(f), bot, 600, now)).toEqual({ userId: '42' });
  });
  it('rejects tampering, wrong bot, stale', () => {
    expect(verifyInitData(sign(f).replace('42', '43'), bot, 600, now)).toBeNull();
    expect(verifyInitData(sign(f), '999:zzz', 600, now)).toBeNull();
    expect(verifyInitData(sign(f), bot, 600, now + 3600_000)).toBeNull();
  });
});

import { stripOpsLinks } from '@/lib/ceo/channel';
describe('stripOpsLinks', () => {
  it('hides Ops URLs but keeps demo links', () => {
    process.env.NEXT_PUBLIC_OPS_HOSTNAME = 'ops.example.com';
    const out = stripOpsLinks('ראה https://ops.example.com/ceo וגם https://app.example.com/ops/users וגם https://app.example.com/demo/abc');
    expect(out).not.toMatch(/ops\.example|\/ops\//);
    expect(out).toContain('https://app.example.com/demo/abc');
  });
});
