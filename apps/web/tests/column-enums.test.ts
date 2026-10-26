import { describe, expect, it, vi } from 'vitest';
import { enumViolation } from '@/lib/security/column-enums';
import { withFieldDecryption } from '@/lib/security/field-fetch';

describe('almog_assignments.schedule enum (app-side)', () => {
  it('validates rows and arrays', () => {
    expect(enumViolation('almog_assignments', { schedule: 'daily' })).toBeNull();
    expect(enumViolation('almog_assignments', { title: 'x' })).toBeNull();
    expect(enumViolation('almog_assignments', { schedule: null })).toBeNull();
    expect(enumViolation('almog_assignments', [{ schedule: 'weekly' }, { schedule: 'hourly' }])).toEqual({ column: 'schedule' });
    expect(enumViolation('almog_assignments', { schedule: 'enc:v2:x' })).toEqual({ column: 'schedule' });
    expect(enumViolation('profiles', { schedule: 'bad' })).toBeNull();
  });

  it('fetch wrapper rejects a bad write with a PostgREST-like 23514 and never sends it', async () => {
    const base = vi.fn(async () => new Response('[]', { status: 201, headers: { 'content-type': 'application/json' } }));
    const f = withFieldDecryption(base as unknown as typeof fetch);
    const url = 'https://x.supabase.co/rest/v1/almog_assignments';
    const bad = await f(url, { method: 'POST', body: JSON.stringify({ schedule: 'monthly' }) });
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe('23514');
    expect(base).not.toHaveBeenCalled();
    const ok = await f(url, { method: 'PATCH', body: JSON.stringify({ schedule: 'daily' }) });
    expect(ok.status).toBe(201);
    expect(base).toHaveBeenCalledTimes(1);
  });
});
