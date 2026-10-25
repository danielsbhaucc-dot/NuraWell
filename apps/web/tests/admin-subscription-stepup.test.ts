import { describe, it, expect, vi, beforeEach } from 'vitest';
const state = { stepUp: false, set: vi.fn() };
vi.mock('server-only', () => ({}));
vi.mock('@/lib/api/require-ops-api-admin', () => ({ requireOpsApiAdmin: async () => ({ ok: true, user: { id: 'admin-1' }, supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } } }) }));
vi.mock('@/lib/ops/sensitive-stepup', () => ({ hasSensitiveStepUp: async () => state.stepUp }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ insert: () => Promise.resolve({}) }) }) }));
vi.mock('@/lib/privacy/subscription-retention', () => ({ setSubscriptionEnded: (...a: unknown[]) => { state.set(...a); return Promise.resolve({ ok: true, subscription_id: 's1' }); } }));
import { POST } from '@/app/api/v1/admin/users/[userId]/subscription/route';
const uid = '11111111-1111-4111-8111-111111111111';
const req = () => new Request('https://x.test/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'end' }) });
describe('admin subscription override step-up', () => {
  beforeEach(() => { state.set.mockClear(); });
  it('403 without step-up and changes nothing', async () => {
    state.stepUp = false;
    const r = await POST(req(), { params: Promise.resolve({ userId: uid }) });
    expect(r.status).toBe(403); expect((await r.json()).stepUp).toBe(true); expect(state.set).not.toHaveBeenCalled();
  });
  it('200 with step-up', async () => {
    state.stepUp = true;
    const r = await POST(req(), { params: Promise.resolve({ userId: uid }) });
    expect(r.status).toBe(200); expect(state.set).toHaveBeenCalledOnce();
  });
  it('400 on bad id', async () => {
    state.stepUp = true;
    expect((await POST(req(), { params: Promise.resolve({ userId: 'x' }) })).status).toBe(400);
  });
});
