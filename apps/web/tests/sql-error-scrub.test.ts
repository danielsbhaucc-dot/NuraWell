import { describe, expect, it, vi } from 'vitest';
import { apiErrorResponse, scrubSqlError } from '@/lib/api/error-response';

const SECRET = '1991-06-15';

describe('sql errors do not keep the row Postgres attaches', () => {
  it('drops the failing-row detail from the log and the response', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = apiErrorResponse({
      status: 400,
      publicMessage: 'השמירה נדחתה',
      logTag: 'profile',
      internal: {
        code: '23514',
        message: 'new row violates check constraint "profiles_check"',
        details: `Failing row contains (id, ${SECRET}, more)`,
        hint: SECRET,
      },
    });
    const body = await response.json() as { error: string; debug?: { message?: string; details?: string } };
    expect(body.error).toBe('השמירה נדחתה');
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET);
    expect(scrubSqlError({ message: `Failing row contains (${SECRET})`, details: SECRET }).message).toBeUndefined();
    spy.mockRestore();
  });
});
