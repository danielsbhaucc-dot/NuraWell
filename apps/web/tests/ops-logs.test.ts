import { describe, expect, it } from 'vitest';
import { detectAnomalies, explain, groupStories, summarize, type LogEvent } from '@/lib/logging/insights';
import { explainError, fingerprint, groupIssues, normalizeMessage } from '@/lib/logging/errors';
import { maskRecipient, redactError } from '@/lib/logging/delivery';
import { redactDetail } from '@/lib/logging/load';
import { isSensitive } from '@/lib/ceo/security';

const now = Date.parse('2026-10-19T20:30:00Z');
const ev = (id: string, event: string, minsAgo: number, extra: Partial<LogEvent> = {}): LogEvent =>
  ({ id, at: new Date(now - minsAgo * 60_000).toISOString(), source: 'audit', event, actor: 'u-abc', flowId: null, detail: {}, ...extra });

describe('redaction', () => {
  it('strips tokens, codes, emails', () => {
    const r = redactError('telegram failed bot123456:AA-bcdEF Bearer abc.def code 482913 to danielx@gmail.com re_abcdefghij');
    expect(r).not.toMatch(/123456:AA|abc\.def|482913|danielx|re_abcdefghij/);
    expect(maskRecipient('danielx@gmail.com')).toBe('d***@gmail.com');
  });
  it('detail allow-list drops unknown keys', () => {
    expect(redactDetail({ label: 'Chrome', token: 'x', code: '123456', email: 'a@b.co' })).toEqual({ label: 'Chrome' });
  });
});

describe('insights', () => {
  it('explains known events in Hebrew with severity', () => {
    const e = explain(ev('1', 'ops_login_tg_failed', 1));
    expect(e.status).toBe('failed');
    expect(e.severity).toBeGreaterThanOrEqual(6);
    expect(e.why).toMatch(/טלגרם/);
  });
  it('groups a login flow into one story with outcome', () => {
    const f = { flowId: 'flow-1' };
    const st = groupStories([ev('1', 'ops_login_pending', 5, f), ev('2', 'ops_login_email_sent', 4, f), ev('3', 'ops_login_approved', 2, f)].map(explain));
    expect(st).toHaveLength(1);
    expect(st[0].outcome).toBe('success');
    expect(st[0].events[0].event).toBe('ops_login_pending');
  });
  it('flags repeated wrong codes, new geo and odd hours', () => {
    const evs = [1, 2, 3].map((i) => ev(`w${i}`, 'ops_email_code_failed', i))
      .concat([ev('g', 'ops_login_pending', 10, { detail: { location: 'Lagos, NG', label: 'Firefox' } })]).map(explain);
    const a = detectAnomalies(evs, new Set(['Netanya, IL']), now);
    expect(a.map((x) => x.key)).toContain('guessing');
    expect(a.some((x) => x.key.startsWith('geo:'))).toBe(true);
    const night = detectAnomalies([explain(ev('n', 'ops_login_pending', 0, { at: '2026-10-19T00:30:00Z' }))], new Set(), Date.parse('2026-10-19T00:31:00Z'));
    expect(night.some((x) => x.key.startsWith('hour:'))).toBe(true);
  });
  it('detects delivery failure bursts and trend', () => {
    const fails = Array.from({ length: 6 }, (_, i) => explain({ ...ev(`d${i}`, 'email:x', i), source: 'delivery', ok: false }));
    expect(detectAnomalies(fails, new Set(), now).some((a) => a.key === 'burst:email')).toBe(true);
    expect(summarize(fails, [explain({ ...ev('ok', 'email:x', 100), source: 'delivery', ok: true })]).trend).toBe('up');
  });
});

describe('errors', () => {
  it('fingerprints ignore volatile parts', () => {
    expect(normalizeMessage('user 3fa85f64-5717-4562-b3fc-2c963f66afa6 failed 42 times for a@b.com')).toBe('user <id> failed <n> times for <email>');
    expect(fingerprint({ source: 's', route: null, message: 'timeout after 30s' })).toBe(fingerprint({ source: 's', route: null, message: 'timeout after 99s' }));
  });
  it('groups, counts users, explains cause', () => {
    const rows = [1, 2, 3].map((i) => ({ id: String(i), created_at: new Date(now - i * 3600_000).toISOString(), severity: 'error', source: 'ai', route: null, message: `fetch timed out ${i}`, user_id: i === 3 ? null : `u${i}` }));
    const [g] = groupIssues(rows, new Map(), now);
    expect(g.count).toBe(3);
    expect(g.users).toBe(2);
    expect(g.cause).toMatch(/לא ענה/);
    expect(g.spark.reduce((a, b) => a + b, 0)).toBe(3);
    expect(explainError('401 invalid api key').cause).toMatch(/מפתח/);
  });
});

describe('owner security tools', () => {
  it('require step-up (sensitive)', () => {
    for (const t of ['ops_sign_out_everywhere', 'ops_forget_device', 'ops_forget_all_devices']) expect(isSensitive(t, {})).toBe(true);
    expect(isSensitive('ops_devices_list', {})).toBe(false);
  });
});
