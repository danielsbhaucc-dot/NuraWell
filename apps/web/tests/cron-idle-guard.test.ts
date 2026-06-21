import { describe, expect, it, vi } from 'vitest';

import {
  buildCronIdleSkipResponse,
  evaluateCronIdleSkip,
  isCronIdleSkipEnabled,
  shouldBypassCronIdleSkip,
} from '../lib/api/cron-idle-guard';

/** Supabase client mock — count queries return via Promise on the query object. */
function mockAdminSimple(counts: Record<string, number>) {
  const makeQuery = (table: string, filters: string[] = []) => {
    const key = filters.length ? `${table}:${filters.join('&')}` : table;
    const result = Promise.resolve({
      count: counts[key] ?? counts[table] ?? 0,
      error: null as null,
    });
    const chain = {
      eq: (column: string, value: unknown) =>
        makeQuery(table, [...filters, `${column}=${String(value)}`]),
      select: (_cols: string, opts?: { head?: boolean }) => {
        if (!opts?.head) throw new Error('expected head count');
        return chain;
      },
      then: result.then.bind(result),
    };
    return chain;
  };

  return {
    from: (table: string) => makeQuery(table),
  } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('shouldBypassCronIdleSkip', () => {
  it('bypasses on force=1', () => {
    expect(
      shouldBypassCronIdleSkip(
        new Request('https://example.com/api/v1/ai/cron/master?force=1')
      )
    ).toBe(true);
  });

  it('bypasses on dryRun=1', () => {
    expect(
      shouldBypassCronIdleSkip(
        new Request('https://example.com/api/v1/ai/cron/onboarding-check-ins?dryRun=1')
      )
    ).toBe(true);
  });

  it('respects CRON_IDLE_SKIP=0', () => {
    vi.stubEnv('CRON_IDLE_SKIP', '0');
    expect(
      shouldBypassCronIdleSkip(new Request('https://example.com/api/v1/ai/cron/master'))
    ).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe('isCronIdleSkipEnabled', () => {
  it('enabled by default', () => {
    vi.stubEnv('CRON_IDLE_SKIP', '');
    expect(isCronIdleSkipEnabled()).toBe(true);
    vi.unstubAllEnvs();
  });

  it('disabled when CRON_IDLE_SKIP=0', () => {
    vi.stubEnv('CRON_IDLE_SKIP', '0');
    expect(isCronIdleSkipEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('evaluateCronIdleSkip', () => {
  it('onboarding-check-ins idle when no onboarded users and no reminders', async () => {
    const admin = mockAdminSimple({
      'profiles:onboarding_completed=true': 0,
      'scheduled_reminders:status=pending': 0,
    });
    const result = await evaluateCronIdleSkip(admin, 'onboarding-check-ins');
    expect(result.idle).toBe(true);
  });

  it('onboarding-check-ins active when onboarded users exist', async () => {
    const admin = mockAdminSimple({
      'profiles:onboarding_completed=true': 1,
      'scheduled_reminders:status=pending': 0,
    });
    const result = await evaluateCronIdleSkip(admin, 'onboarding-check-ins');
    expect(result.idle).toBe(false);
  });

  it('memory-consolidation idle when no pending logs', async () => {
    const admin = mockAdminSimple({
      'pending_chat_logs:processed=false': 0,
    });
    const result = await evaluateCronIdleSkip(admin, 'memory-consolidation');
    expect(result.idle).toBe(true);
  });

  it('habit-checkpoints active with journey progress only', async () => {
    const admin = mockAdminSimple({
      'profiles:onboarding_completed=true': 0,
      journey_progress: 2,
    });
    const result = await evaluateCronIdleSkip(admin, 'habit-checkpoints');
    expect(result.idle).toBe(false);
  });
});

describe('buildCronIdleSkipResponse', () => {
  it('returns skipped idle payload', async () => {
    const res = buildCronIdleSkipResponse('master', { profiles: 0 });
    const body = await res.json();
    expect(body.skipped).toBe('idle');
    expect(body.profile).toBe('master');
  });
});
