import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const gateState = vi.hoisted(() => ({ block: false, calls: 0 }));
const fakeSession = () => Promise.resolve({ supabase: {}, user: { id: 'u1', app_metadata: { pl_lic: 'lic_test1' } }, authError: null });
vi.mock('@/lib/supabase/api-route-client', () => ({ createSupabaseForApiRoute: () => fakeSession() }));
vi.mock('../lib/supabase/api-route-client', () => ({ createSupabaseForApiRoute: () => fakeSession() }));
vi.mock('@/lib/central/license-gate', () => ({
  licenseGate: () => {
    gateState.calls += 1;
    return Promise.resolve(gateState.block ? { block: true, why: 'unlicensed', reason: 'expired' } : { block: false, why: 'licensed' });
  },
  profileRole: () => Promise.resolve('user'),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('no db in tests'); } }));

import { requireApiSession, licenseExemptPath } from '@/lib/api/route-guards';

const requestFor = (path: string) => new Request(`https://nurawell.vercel.app${path}`);

describe('API-layer parent-license gate (requireApiSession)', () => {
  const previousMode = process.env.PLATFORM_LICENSE_MODE;
  beforeEach(() => { gateState.block = false; gateState.calls = 0; process.env.PLATFORM_LICENSE_MODE = 'enforce'; });
  afterEach(() => { if (previousMode === undefined) delete process.env.PLATFORM_LICENSE_MODE; else process.env.PLATFORM_LICENSE_MODE = previousMode; });

  it('blocks an unlicensed user on product APIs with 403 license_required', async () => {
    gateState.block = true;
    for (const path of ['/api/v1/ai/chat', '/api/v1/almog-kickoff/start', '/api/v1/tasks/plan', '/api/v1/challenge/state', '/api/v1/profile']) {
      const result = await requireApiSession(requestFor(path));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(403);
        expect(await result.response.json()).toEqual({ error: 'license_required' });
      }
    }
  });

  it('lets a licensed user through', async () => {
    const result = await requireApiSession(requestFor('/api/v1/ai/chat'));
    expect(result.ok).toBe(true);
    expect(gateState.calls).toBe(1);
  });

  it('never blocks privacy-rights, billing, demo, step-up, churn and push routes', async () => {
    gateState.block = true;
    for (const path of ['/api/v1/account/export', '/api/v1/account/delete', '/api/v1/account/health-consent', '/api/v1/billing/platform/checkout', '/api/v1/demo-access/end', '/api/v1/stepup/approve', '/api/v1/churn-feedback', '/api/v1/push/subscribe']) {
      expect(licenseExemptPath(path)).toBe(true);
      expect((await requireApiSession(requestFor(path))).ok).toBe(true);
    }
    expect(gateState.calls).toBe(0);
  });

  it('is fully off unless env arms it (kill switch layer 1)', async () => {
    gateState.block = true;
    delete process.env.PLATFORM_LICENSE_MODE;
    expect((await requireApiSession(requestFor('/api/v1/ai/chat'))).ok).toBe(true);
    process.env.PLATFORM_LICENSE_MODE = 'shadow';
    expect((await requireApiSession(requestFor('/api/v1/ai/chat'))).ok).toBe(true);
    expect(gateState.calls).toBe(0);
  });

  it('exempt list does not match look-alike prefixes', () => {
    expect(licenseExemptPath('/api/v1/accountx/data')).toBe(false);
    expect(licenseExemptPath('/api/v1/billingx')).toBe(false);
    expect(licenseExemptPath('/api/v1/churn-feedback')).toBe(true);
  });

  it('admin routes skip the license gate; challenge area is page-gated like the dashboard', () => {
    const src = readFileSync('lib/api/route-guards.ts', 'utf8');
    expect(src).toMatch(/requireApiAdminInner[\s\S]*?resolveApiSession\(request\)/);
    expect(readFileSync('app/challenge/layout.tsx', 'utf8')).toMatch(/redirect\('\/license-required'\)/);
    expect(readFileSync('app/(dashboard)/layout.tsx', 'utf8')).toMatch(/redirect\('\/license-required'\)/);
  });

  it('records the paths PR 457 does not close: onboarding action and Almog nudges stay off this gate', () => {
    expect(readFileSync('lib/actions/complete-onboarding.ts', 'utf8')).not.toMatch(/licenseGate\(/);
    expect(readFileSync('lib/workflows/send-journey-companion-nudge.ts', 'utf8')).not.toMatch(/licenseGate\(/);
    expect(readFileSync('lib/api/authorize-cron.ts', 'utf8')).not.toMatch(/licenseGate\(/);
  });
});
