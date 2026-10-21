import { describe, expect, it } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { qstashReceivers, verifyQstashAny } from '@/lib/api/qstash-receivers';

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');
function sign(key: string, url: string, body: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: 'Upstash', sub: url, exp: now + 300, nbf: now - 5, iat: now, jti: 'j' + now,
    body: createHash('sha256').update(body).digest('base64url'),
  }));
  const sig = createHmac('sha256', key).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

const env = {
  QSTASH_CURRENT_SIGNING_KEY: 'sig_new_current', QSTASH_NEXT_SIGNING_KEY: 'sig_new_next',
  QSTASH_OLD_CURRENT_SIGNING_KEY: 'sig_old_current', QSTASH_OLD_NEXT_SIGNING_KEY: 'sig_old_next',
} as unknown as NodeJS.ProcessEnv;
const url = 'https://nurawell.vercel.app/api/v1/ai/cron/memory-pipeline';

describe('dual-account QStash verification', () => {
  it('accepts new and old account keys (current and next)', async () => {
    const rs = qstashReceivers(env);
    expect(rs).toHaveLength(2);
    for (const k of ['sig_new_current', 'sig_new_next', 'sig_old_current', 'sig_old_next']) {
      expect(await verifyQstashAny({ signature: sign(k, url, ''), body: '', url }, rs)).toBe(true);
    }
  });
  it('rejects unknown keys and wrong url', async () => {
    const rs = qstashReceivers(env);
    expect(await verifyQstashAny({ signature: sign('stranger', url, ''), body: '', url }, rs)).toBe(false);
    expect(await verifyQstashAny({ signature: sign('sig_new_current', url, ''), body: '', url: url + 'x' }, rs)).toBe(false);
  });
  it('without OLD vars only the primary pair is used', async () => {
    const rs = qstashReceivers({ QSTASH_CURRENT_SIGNING_KEY: 'a', QSTASH_NEXT_SIGNING_KEY: 'b' } as unknown as NodeJS.ProcessEnv);
    expect(rs).toHaveLength(1);
    expect(await verifyQstashAny({ signature: sign('sig_old_current', url, ''), body: '', url }, rs)).toBe(false);
  });
});
