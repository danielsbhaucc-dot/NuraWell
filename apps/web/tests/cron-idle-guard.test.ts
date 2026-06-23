import { describe, expect, it, vi } from 'vitest';

import {
  buildCronIdleSkipResponse,
  countDueCheckInsFromProfiles,
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
      lte: (column: string, value: unknown) =>
        makeQuery(table, [...filters, `${column}<=${String(value)}`]),
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

function mockAdminOnboardingIdle(opts: {
  profiles?: Array<{ ai_check_in_times: unknown }>;
  dueReminders?: number;
}) {
  const dueReminders = opts.dueReminders ?? 0;
  return {
    from: (table: string) => {
      if (table === 'profiles') {
        const chain = {
          eq: () => chain,
          not: () => chain,
          limit: () => chain,
          select: (cols: string, selectOpts?: { head?: boolean }) => {
            if (selectOpts?.head) {
              const countResult = Promise.resolve({
                count: opts.profiles?.length ?? 0,
                error: null as null,
              });
              const countChain = {
                eq: () => countChain,
                select: () => countChain,
                then: countResult.then.bind(countResult),
              };
              return countChain;
            }
            if (cols === 'ai_check_in_times') {
              return Promise.resolve({ data: opts.profiles ?? [], error: null });
            }
            throw new Error(`unexpected profiles select: ${cols}`);
          },
        };
        return chain;
      }
      if (table === 'scheduled_reminders') {
        return mockAdminSimple({
          'scheduled_reminders:status=pending': dueReminders,
        }).from('scheduled_reminders');
      }
      return mockAdminSimple({ [table]: 0 }).from(table);
    },
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

describe('countDueCheckInsFromProfiles', () => {
  const at0830 = new Date('2026-06-23T05:30:00.000Z'); // 08:30 Israel (IDT)

  it('counts user with check-in due in ±30 min window', () => {
    expect(
      countDueCheckInsFromProfiles([{ ai_check_in_times: ['08:45'] }], at0830, 30)
    ).toBe(1);
  });

  it('ignores user whose check-in is outside the window', () => {
    expect(
      countDueCheckInsFromProfiles([{ ai_check_in_times: ['14:00'] }], at0830, 30)
    ).toBe(0);
  });
});

describe('evaluateCronIdleSkip', () => {
  const at0830 = new Date('2026-06-23T05:30:00.000Z');

  it('onboarding-check-ins idle when no due check-ins and no due reminders', async () => {
    const admin = mockAdminOnboardingIdle({
      profiles: [{ ai_check_in_times: ['14:00'] }],
      dueReminders: 0,
    });
    const result = await evaluateCronIdleSkip(admin, 'onboarding-check-ins', {
      now: at0830,
    });
    expect(result.idle).toBe(true);
    expect(result.counts.due_check_ins_now).toBe(0);
  });

  it('onboarding-check-ins active when onboarded user has check-in due now', async () => {
    const admin = mockAdminOnboardingIdle({
      profiles: [{ ai_check_in_times: ['08:45'] }],
      dueReminders: 0,
    });
    const result = await evaluateCronIdleSkip(admin, 'onboarding-check-ins', {
      now: at0830,
    });
    expect(result.idle).toBe(false);
    expect(result.counts.due_check_ins_now).toBe(1);
  });

  it('onboarding-check-ins active when due reminders exist even without check-ins', async () => {
    const admin = mockAdminOnboardingIdle({
      profiles: [{ ai_check_in_times: ['22:00'] }],
      dueReminders: 2,
    });
    const result = await evaluateCronIdleSkip(admin, 'onboarding-check-ins', {
      now: at0830,
    });
    expect(result.idle).toBe(false);
    expect(result.counts.due_reminders).toBe(2);
  });

  it('almog-reminders idle when no due reminders', async () => {
    const admin = mockAdminSimple({
      'scheduled_reminders:status=pending': 0,
    });
    const result = await evaluateCronIdleSkip(admin, 'almog-reminders');
    expect(result.idle).toBe(true);
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
