import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  COMPLIANCE_ITEMS, DPA_VENDORS, allItemKeys, isKnownDocFile, itemState, openItems, rowDone,
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
    expect(itemState(it2, new Map([['db_definitions_policy', row('db_definitions_policy', '2025-12-30T00:00:00Z')]]), facts, now)).toBe('overdue');
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
});
