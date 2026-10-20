import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  COMPLIANCE_ITEMS, DPA_VENDORS, allItemKeys, isKnownDocFile, itemNextDue, itemState, openItems, reopenedItems, rowDone, REOPEN_LEAD_DAYS,
  type AutoFacts, type ComplianceRow,
} from '@/lib/privacy/compliance-checklist';

const facts: AutoFacts = { userCount: 4, auditEvents30d: 10, drill: { ok: true, at: '2026-10-20T08:00:00Z' } };
const now = new Date('2026-10-21T10:00:00Z');
const item = (k: string) => COMPLIANCE_ITEMS.find((i) => i.key === k)!;
const row = (k: string, done_at: string | null, done = true): ComplianceRow => ({ item_key: k, done, done_at, updated_at: done_at ?? '2026-01-01' });

describe('privacy compliance checklist', () => {
  it('has the owner items and the high-tier section', () => {
    expect(COMPLIANCE_ITEMS.filter((i) => i.group === 'owner').map((i) => i.key)).toEqual(['business_details', 'db_definitions_policy', 'dpa', 'mfa', 'lawyer_review', 'dpo_decision', 'thresholds']);
    expect(COMPLIANCE_ITEMS.filter((i) => i.group === 'high')).toHaveLength(6);
    expect(DPA_VENDORS.map((v) => v.key)).toContain('openrouter');
  });
  it('yearly items expire at the new IL year', () => {
    const it2 = item('db_definitions_policy');
    expect(rowDone(it2, row('db_definitions_policy', '2026-03-01T00:00:00Z'), now)).toBe(true);
    expect(rowDone(it2, row('db_definitions_policy', '2025-12-30T00:00:00Z'), now)).toBe(false);
    expect(itemState(it2, new Map([['db_definitions_policy', row('db_definitions_policy', '2025-12-30T00:00:00Z')]]), facts, now)).toBe('open');
  });
  it('pentest expires after 18 months', () => {
    expect(rowDone(item('pentest'), row('pentest', '2025-04-01T00:00:00Z'), now)).toBe(false);
    expect(rowDone(item('pentest'), row('pentest', '2025-06-01T00:00:00Z'), now)).toBe(true);
  });
  it('vendor sub-items roll up to partial/done', () => {
    const m = new Map([[`dpa:${DPA_VENDORS[0].key}`, row(`dpa:${DPA_VENDORS[0].key}`, '2026-10-01T00:00:00Z')]]);
    expect(itemState(item('dpa'), m, facts, now)).toBe('partial');
    const all = new Map(DPA_VENDORS.map((v) => [`dpa:${v.key}`, row(`dpa:${v.key}`, '2026-10-01T00:00:00Z')]));
    expect(itemState(item('dpa'), all, facts, now)).toBe('done');
  });
  it('auto items: thresholds, access log, stale/failed drill', () => {
    expect(itemState(item('thresholds'), new Map(), facts, now)).toBe('done');
    expect(itemState(item('thresholds'), new Map(), { ...facts, userCount: 1000 }, now)).toBe('overdue');
    expect(itemState(item('access_log'), new Map(), facts, now)).toBe('done');
    expect(itemState(item('backup_drill'), new Map(), { ...facts, drill: { ok: true, at: '2026-08-01T00:00:00Z' } }, now)).toBe('overdue');
    expect(itemState(item('backup_drill'), new Map(), { ...facts, drill: { ok: false, at: '2026-10-20T00:00:00Z' } }, now)).toBe('overdue');
    expect(itemState(item('backup_drill'), new Map(), { ...facts, drill: null }, now)).toBe('open');
  });
  it('only known keys are writable; auto items are not', () => {
    const keys = allItemKeys();
    expect(keys).toContain('mfa:github');
    expect(keys).not.toContain('backup_drill');
    expect(keys).not.toContain('dpa');
  });
  it('doc filenames are allow-listed (no traversal)', () => {
    expect(isKnownDocFile('06-subprocessors.pdf')).toBe(true);
    expect(isKnownDocFile('09-security-training.docx')).toBe(true);
    for (const bad of ['../.env', '06-subprocessors.pdf/..', '10-x.pdf', '06-subprocessors.html']) expect(isKnownDocFile(bad)).toBe(false);
  });
  it('open items lists everything when empty', () => {
    expect(openItems(new Map(), facts, now).length).toBeGreaterThan(5);
  });
  it('routes 404 non-admins and never ship docs as static files', () => {
    const base = path.resolve(__dirname, '..');
    const doc = readFileSync(path.join(base, 'app/api/v1/admin/privacy-compliance/docs/[file]/route.ts'), 'utf8');
    expect(doc).toMatch(/if \(!auth\.ok\) return notFound\(\)/);
    const api = readFileSync(path.join(base, 'app/api/v1/admin/privacy-compliance/route.ts'), 'utf8');
    expect(api).toMatch(/admin_audit_log/);
    expect(() => readFileSync(path.join(base, 'public/06-subprocessors.pdf'))).toThrow();
  });

  describe('auto-reopen', () => {
    const one = (k: string, at: string | null, done = true) => new Map([[k, { item_key: k, done, done_at: at, updated_at: at ?? '' }]]);
    it('yearly: done → open on 1 Jan IL → overdue after 31 Dec of next year', () => {
      const m = one('security_policy_yearly', '2026-05-01T00:00:00Z');
      const it2 = item('security_policy_yearly');
      expect(itemState(it2, m, facts, new Date('2026-12-31T12:00:00Z'))).toBe('done');
      expect(itemState(it2, m, facts, new Date('2026-12-31T22:30:00Z'))).toBe('open'); // 00:30 IL, 1 Jan
      expect(itemState(it2, m, facts, new Date('2027-12-31T23:00:00Z'))).toBe('overdue');
      expect(itemNextDue(it2, m, facts)?.toISOString()).toBe('2027-12-31T21:59:59.000Z');
    });
    it('month intervals reopen 30 days before due and go overdue after', () => {
      const m = one('pentest', '2025-01-15T00:00:00Z'); // due 2026-07-15
      const p = item('pentest');
      expect(REOPEN_LEAD_DAYS).toBe(30);
      expect(itemState(p, m, facts, new Date('2026-06-01T00:00:00Z'))).toBe('done');
      expect(itemState(p, m, facts, new Date('2026-06-20T00:00:00Z'))).toBe('open');
      expect(itemState(p, m, facts, new Date('2026-07-16T00:00:00Z'))).toBe('overdue');
    });
    it('every manual item has a recurrence (none stays done forever)', () => {
      for (const i of COMPLIANCE_ITEMS.filter((x) => !x.auto)) expect(Boolean(i.yearly || i.everyMonths || i.reviewMonths), i.key).toBe(true);
      expect(item('mfa').reviewMonths).toBe(6);
      expect(item('dpa').reviewMonths).toBe(12);
    });
    it('vendor subs: one expired vendor reopens the item; past due → overdue', () => {
      const ks = item('mfa').subs!.map((s) => `mfa:${s.key}`);
      const m = new Map(ks.map((k, i) => [k, { item_key: k, done: true, done_at: i === 0 ? '2026-01-01T00:00:00Z' : '2026-05-01T00:00:00Z', updated_at: '' }]));
      expect(itemState(item('mfa'), m, facts, new Date('2026-06-10T00:00:00Z'))).toBe('partial');
      expect(itemState(item('mfa'), m, facts, new Date('2026-07-05T00:00:00Z'))).toBe('overdue');
    });
    it('fail-safe: missing/invalid/future dates are open', () => {
      expect(itemState(item('lawyer_review'), one('lawyer_review', null), facts, now)).toBe('open');
      expect(itemState(item('lawyer_review'), one('lawyer_review', 'garbage'), facts, now)).toBe('open');
      expect(itemState(item('lawyer_review'), one('lawyer_review', '2099-01-01T00:00:00Z'), facts, now)).toBe('open');
      expect(itemState(item('backup_drill'), new Map(), { ...facts, drill: { ok: true, at: 'x' } }, now)).toBe('open');
    });
    it('reopenedItems reports each item once, in the 24h window it reopened', () => {
      const m = one('dpo_decision', '2025-11-20T00:00:00Z'); // due 2026-11-20, reopen 2026-10-21
      const day = (s: string) => new Date(s);
      expect(reopenedItems(m, facts, day('2026-10-20T00:00:00Z'), day('2026-10-21T00:00:00Z')).map((i) => i.key)).toEqual(['dpo_decision']);
      expect(reopenedItems(m, facts, day('2026-10-21T00:00:00Z'), day('2026-10-22T00:00:00Z'))).toEqual([]);
    });
  });
});
