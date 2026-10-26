import { afterEach, describe, expect, it } from 'vitest';
import { hasFieldBackfillSecret } from '@/lib/api/field-backfill-auth';

const S = 'x'.repeat(40);
const req = (h?: Record<string, string>, url = 'https://a.test/api/v1/ai/cron/field-backfill') => new Request(url, { headers: h });

describe('hasFieldBackfillSecret', () => {
  afterEach(() => { delete process.env.FIELD_BACKFILL_SECRET; });
  it('accepts exact Bearer header', () => {
    process.env.FIELD_BACKFILL_SECRET = S;
    expect(hasFieldBackfillSecret(req({ authorization: `Bearer ${S}` }))).toBe(true);
  });
  it('rejects wrong, missing, non-Bearer, and query-string secrets', () => {
    process.env.FIELD_BACKFILL_SECRET = S;
    expect(hasFieldBackfillSecret(req({ authorization: `Bearer ${S}y` }))).toBe(false);
    expect(hasFieldBackfillSecret(req())).toBe(false);
    expect(hasFieldBackfillSecret(req({ authorization: S }))).toBe(false);
    expect(hasFieldBackfillSecret(req({}, `https://a.test/x?secret=${S}`))).toBe(false);
  });
  it('is disabled when unset or too short', () => {
    expect(hasFieldBackfillSecret(req({ authorization: 'Bearer ' }))).toBe(false);
    process.env.FIELD_BACKFILL_SECRET = 'short';
    expect(hasFieldBackfillSecret(req({ authorization: 'Bearer short' }))).toBe(false);
  });
});
