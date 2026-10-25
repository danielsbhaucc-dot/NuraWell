import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const gate = vi.hoisted(() => ({ admin: false, stepUp: false, sends: 0 }));
vi.mock('@/lib/api/route-guards', () => ({
  requireApiAdmin: vi.fn(async () => gate.admin
    ? { ok: true, user: { id: 'u1' }, supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'x' } } }) } } }
    : { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }),
}));
vi.mock('@/lib/ops/sensitive-stepup', () => ({ hasSensitiveStepUp: vi.fn(async () => gate.stepUp) }));
vi.mock('@/lib/auth/stepup', () => ({ sessionIdOf: () => null }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('db must not be touched'); } }));
vi.mock('@/lib/ops/device-notify', () => ({ alertOwnerSecurity: vi.fn(async () => { gate.sends++; return { telegram: 1, email: 1, emailIds: [] }; }) }));
vi.mock('@/lib/api/rate-limit', () => ({ consumeRateLimit: vi.fn(async () => ({ ok: true })), rateLimitResponse: vi.fn() }));

import { POST } from '@/app/api/v1/ops/security/test-alert/route';
const req = () => new Request('https://ops.example/api/v1/ops/security/test-alert', { method: 'POST' });

describe('test-alert route', () => {
  beforeEach(() => { gate.sends = 0; });
  it('403 for a non-admin, nothing sent', async () => {
    gate.admin = false;
    expect((await POST(req())).status).toBe(403);
    expect(gate.sends).toBe(0);
  });
  it('admin without step-up is refused', async () => {
    gate.admin = true; gate.stepUp = false;
    const r = await POST(req());
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe('stepup_required');
    expect(gate.sends).toBe(0);
  });
});
