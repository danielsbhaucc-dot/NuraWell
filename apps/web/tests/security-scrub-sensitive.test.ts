import { describe, expect, it } from 'vitest';
import { scrubTelemetry } from '@/lib/security/scrub-sensitive';

describe('scrubTelemetry', () => {
  it('removes identifiers, credentials and ciphertext', () => {
    const s = scrubTelemetry(
      'user dan@example.co.il phone 054-123-4567 +1 415 555 1234 Bearer abcdefghijkl123 ' +
        'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U ' +
        'sk-proj_abcdefghijklmnop enc:v1:aaa.bbb.ccc https://x.y/cb?code=SECRET123&ok=1',
    );
    for (const leak of ['dan@example', '054-123-4567', '415 555', 'abcdefghijkl123', 'eyJhbGci', 'sk-proj', 'enc:v1', 'SECRET123']) {
      expect(s).not.toContain(leak);
    }
    expect(s).toContain('ok=1');
  });

  it('redacts Postgres row echoes', () => {
    const s = scrubTelemetry('new row violates check constraint "x". Failing row contains (1, I feel awful today, 72.5).');
    expect(s).not.toContain('awful');
    const k = scrubTelemetry('duplicate key value violates unique constraint "u" Key (email)=(a@b.co) already exists');
    expect(k).not.toContain('a@b.co');
  });

  it('keeps dates, ids and stack positions readable', () => {
    const s = scrubTelemetry('at handler (route.ts:123:45) 2026-10-25T07:00:00Z id 3f1c2b9e-1111-4222-8333-444455556666');
    expect(s).toContain('route.ts:123:45');
    expect(s).toContain('2026-10-25T07:00:00Z');
    expect(s).toContain('3f1c2b9e-1111-4222-8333-444455556666');
  });
});
