import { describe, it, expect } from 'vitest';
import { runLogRetentionIfStale } from '@/lib/logs/retention-job';

function fake(last: string | null, queryError = false) {
  let purges = 0;
  const chain = {
    select: () => chain, eq: () => chain, order: () => chain,
    limit: async () => ({ data: last ? [{ created_at: last }] : [], error: queryError ? { message: 'query failed' } : null }),
  };
  const db = {
    from: () => chain,
    rpc: async (name: string) => {
      if (name === 'run_log_retention') { purges++; return { data: { dry_run: false, tables: { errors: { deleted: 3 } } }, error: null }; }
      if (name === 'log_storage_stats') return { data: { db_bytes: 1024, tables: {}, top_tables: [] }, error: null };
      throw new Error(name);
    },
  };
  return { db, purges: () => purges };
}

describe('daily log-retention backstop', () => {
  const now = new Date('2026-11-21T03:05:00Z');
  it('never run before → purges (not a dry run)', async () => {
    const f = fake(null);
    const r = await runLogRetentionIfStale(f.db as never, now);
    expect(r).toMatchObject({ ran: true, deleted: 3 });
    expect(f.purges()).toBe(1);
  });
  it('recent successful run → skipped (dedicated cron wins)', async () => {
    const f = fake('2026-11-21T01:23:00Z');
    expect(await runLogRetentionIfStale(f.db as never, now)).toMatchObject({ ran: false });
    expect(f.purges()).toBe(0);
  });
  it('yesterday → purges (20h stale threshold)', async () => {
    const f = fake('2026-11-20T03:05:00Z');
    expect(await runLogRetentionIfStale(f.db as never, now)).toMatchObject({ ran: true });
    expect(f.purges()).toBe(1);
  });
  it('query failed → fails closed; no deletion', async () => {
    const f = fake(null, true);
    await expect(runLogRetentionIfStale(f.db as never, now)).rejects.toThrow('query failed');
    expect(f.purges()).toBe(0);
  });
});
