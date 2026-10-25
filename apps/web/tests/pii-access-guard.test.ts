import { describe, expect, it, vi } from 'vitest';
import { fakeDb } from './helpers/access-fake-db';
vi.mock('server-only', () => ({}));
import { createPiiGrant, requirePiiGrant } from '@/lib/platform/access/pii-access';
import { runAccessAudit } from '@/lib/platform/access/audit-job';

const A = '00000000-0000-0000-0000-00000000000a'; const S = '00000000-0000-0000-0000-00000000000b';
const req = () => new Request('https://x/api', { headers: { 'x-real-ip': '1.2.3.4' } });
const q = { productId: 'nurawell', actorId: A, subjectId: S, resource: 'admin.user.detail' };
const live = { id: 'g', product_id: 'nurawell', actor_id: A, subject_id: S, reason: 'r', ticket_ref: null, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString(), revoked_at: null };

describe('requirePiiGrant (server-side)', () => {
  it('no grant → 403 + denied logged', async () => {
    const db = fakeDb({ results: { pii_access_grants: [[]] } });
    const r = await requirePiiGrant(db as never, req(), q);
    expect(r?.status).toBe(403);
    expect((db.calls.find((c) => c.table === 'pii_access_log' && c.op === 'insert')!.args[0] as { event: string }).event).toBe('denied');
  });
  it('grant for another subject does not cover', async () => {
    const db = fakeDb({ results: { pii_access_grants: [[{ ...live, subject_id: A }]] } });
    expect((await requirePiiGrant(db as never, req(), q))?.status).toBe(403);
  });
  it('live grant → allowed and view logged with product id', async () => {
    const db = fakeDb({ results: { pii_access_grants: [[live]] } });
    expect(await requirePiiGrant(db as never, req(), q)).toBeNull();
    const log = db.calls.find((c) => c.table === 'pii_access_log' && c.op === 'insert')!.args[0] as { event: string; product_id: string; ip_hash: string };
    expect(log).toMatchObject({ event: 'view', product_id: 'nurawell' });
    expect(log.ip_hash).not.toContain('1.2.3.4');
  });
  it('log write fails → fail closed (503)', async () => {
    const db = fakeDb({ results: { pii_access_grants: [[live]] }, failInsert: ['pii_access_log'] });
    expect((await requirePiiGrant(db as never, req(), q))?.status).toBe(503);
  });
  it('grant with a vague reason is refused; grant whose log fails is revoked', async () => {
    expect(await createPiiGrant(fakeDb() as never, req(), { ...q, reason: 'כי כי כי כי כי' })).toMatchObject({ ok: false });
    const db = fakeDb({ results: { pii_access_grants: [{ id: 'g', expires_at: live.expires_at }] }, failInsert: ['pii_access_log'] });
    expect(await createPiiGrant(db as never, req(), { ...q, reason: 'בדיקת תלונה על חיוב כפול בחשבון' })).toMatchObject({ ok: false, error: 'log_failed' });
    expect(db.calls.some((c) => c.table === 'pii_access_grants' && c.op === 'update')).toBe(true);
  });
});

describe('nightly access audit', () => {
  it('no events → no model call', async () => {
    const model = vi.fn();
    const db = fakeDb({ results: { access_audit_runs: [{ id: 'run' }] } });
    const r = await runAccessAudit(db as never, { model });
    expect(r.modelCalled).toBe(false); expect(model).not.toHaveBeenCalled();
  });
  it('flagged events → model gets pseudonymous payload only; findings stored; alert sent', async () => {
    const night = Date.parse('2026-10-25T00:30:00Z');
    const model = vi.fn(async (p: string) => { expect(p).not.toMatch(/@|0000-0000|1\.2\.3\.4|חיוב/); return [{ ref: 'e1', severity: 'high' as const, summary: 'גישה לילית' }]; });
    const alert = vi.fn(async () => undefined);
    const db = fakeDb({ results: {
      pii_access_log: [[], []], pii_access_grants: [[{ created_at: new Date(night).toISOString(), actor_id: A, subject_id: S, reason: 'חיוב', ticket_ref: null, country: 'IL', device_id: null }]],
      ops_probe_daily: [[]], ops_device_enrollments: [[]], access_audit_runs: [{ id: 'run' }], access_audit_findings: [null] } });
    const r = await runAccessAudit(db as never, { model, alert, now: night + 3600_000 });
    expect(r).toMatchObject({ modelCalled: true, findings: 1 });
    expect(alert).toHaveBeenCalled();
  });
  it('model failure falls back to rule severity (no silent drop)', async () => {
    const night = Date.parse('2026-10-25T00:30:00Z');
    const db = fakeDb({ results: { pii_access_log: [[], []], pii_access_grants: [[{ created_at: new Date(night).toISOString(), actor_id: A, subject_id: S, reason: 'x', ticket_ref: null, country: 'IL', device_id: null }]],
      ops_probe_daily: [[]], ops_device_enrollments: [[]], access_audit_runs: [{ id: 'run' }] } });
    const r = await runAccessAudit(db as never, { model: async () => { throw new Error('down'); }, now: night + 3600_000 });
    expect(r.findings).toBe(1);
  });
});
