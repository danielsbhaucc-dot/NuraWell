import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { signUsage } from '@/lib/central/usage-feed';

describe('central usage feed', () => {
  it('signs HMAC-SHA256 over `${ts}.${body}` (platform-core connector spec)', async () => {
    const { ts, sig } = signUsage('k', '{"users":3}', 1700000000000);
    expect(ts).toBe('1700000000000');
    expect(sig).toBe(createHmac('sha256', 'k').update('1700000000000.{"users":3}').digest('hex'));
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });
  it('sends aggregates only and never throws into the cron', () => {
    const src = readFileSync(join(__dirname, '../lib/central/usage-feed.ts'), 'utf8');
    expect(src).not.toMatch(/select\('(?!id'|cost_usd'|ip_hash'|active'|started_at, flagged')/);
    expect(src).toMatch(/catch \{/);
    const cron = readFileSync(join(__dirname, '../app/api/v1/ai/cron/session-trail-seal/route.ts'), 'utf8');
    expect(cron).toMatch(/await sendUsageFeed\(\)/);
    expect(cron).not.toMatch(/sendUsageFeed\(\)[^\n]*failed/);
  });
  it('skips when not configured', async () => {
    const { sendUsageFeed } = await import('@/lib/central/usage-feed');
    const old = process.env.CENTRAL_METRICS_FEED_SECRET; delete process.env.CENTRAL_METRICS_FEED_SECRET;
    expect(await sendUsageFeed()).toBe('skipped');
    if (old) process.env.CENTRAL_METRICS_FEED_SECRET = old;
  });
  it('security feed: aggregate keys only, wired into the admin guard, alerts and dispatcher', () => {
    const r = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
    expect(r('lib/logs/signals.ts')).toMatch(/sendSecurityEvent\('admin_denied', 'low'\)/);
    expect(r('lib/logs/signals.ts')).toMatch(/sendSecurityEvent\(kind, 'high', 0\)/);
    expect(r('lib/ops/security-events.ts')).toMatch(/sendSecurityEvent\(e\.kind/);
    expect(r('app/api/v1/ai/cron/session-trail-seal/route.ts')).toMatch(/await sendSecurityStatusFeed\(!failed\)/);
    expect(r('../../packages/@core/security-privacy/src/feed.ts')).not.toMatch(/email|user_id|actor/i);
  });
  it('feed client signs sec.ts.nonce.body and skips when unconfigured', async () => {
    const { signSecurityBody, sendSecurityEvent } = await import('@core/security-privacy/feed');
    const { ts, nonce, sig } = signSecurityBody('k', 'b', 1700000000000, 'ab'.repeat(16));
    expect(sig).toBe(createHmac('sha256', 'k').update(`sec.${ts}.${nonce}.b`).digest('hex'));
    const old = process.env.CENTRAL_PRODUCT_ID; delete process.env.CENTRAL_PRODUCT_ID;
    expect(await sendSecurityEvent('admin_denied', 'low')).toBe('skipped');
    if (old) process.env.CENTRAL_PRODUCT_ID = old;
  });
});
