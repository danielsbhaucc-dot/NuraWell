import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/platform/authorize', () => ({ loadModuleStates: async () => [], centralModuleSource: () => null }));

import { hiddenPathsFor } from '@/lib/platform/nav-state';
import { MODULES } from '@/lib/platform/catalog';

describe('ops menu hides absent modules', () => {
  it('hides nothing when module state is unknown (fail open; server gate still 404s)', () => {
    expect(hiddenPathsFor([])).toEqual([]);
  });
  it('hides the pages of a non-core module that is off, never a core module', () => {
    const states = MODULES.map((m) => ({ moduleId: m.id, enabled: m.id !== 'gideon' }));
    const hidden = hiddenPathsFor(states as never);
    expect(hidden).toContain('/ops/ceo');
    expect(hidden).not.toContain('/ops/users');
    const all = hiddenPathsFor(MODULES.map((m) => ({ moduleId: m.id, enabled: false })) as never);
    for (const m of MODULES.filter((x) => x.core)) for (const p of m.pages ?? []) expect(all).not.toContain(p);
  });
  it('module toggles require a fresh single-use device approval', () => {
    const src = readFileSync(join(__dirname, '../app/api/v1/ops/iam/modules/route.ts'), 'utf8');
    expect(src).toContain('hasFreshDeviceApproval');
    expect(src).not.toContain('hasSensitiveStepUp');
  });
});
