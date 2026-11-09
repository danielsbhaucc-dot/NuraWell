import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetFieldCrypto, decryptValue, setDekStoreForTests, type DekStore } from '@/lib/security/field-crypto';
import type { WrappedDek } from '@/lib/security/field-envelope';
import { withFieldDecryption } from '@/lib/security/field-fetch';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { CLOSED_FINDING, findingTitle } from '@/lib/platform/access/finding-title';
import { planAuditSummary, runAuditSummaryBatch } from '@/lib/privacy/audit-summary-backfill';

const SUMMARY = 'גישה לילית חריגה משעה לא מוכרת';
const BASE = 'https://x.supabase.co/rest/v1';
type Row = Record<string, unknown>;

function memStore(): DekStore {
  const rows = new Map<string, WrappedDek>();
  return {
    async get(u) { return rows.get(u) ?? null; },
    async putIfAbsent(u, w) { if (!rows.has(u)) rows.set(u, w); return rows.get(u)!; },
  };
}

let prev: string | undefined;
beforeEach(() => {
  prev = process.env.PII_ENCRYPTION_KEY;
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  __resetFieldCrypto();
  setDekStoreForTests(memStore());
});
afterEach(() => { process.env.PII_ENCRYPTION_KEY = prev; });

describe('access audit summary', () => {
  it('seals a new summary, still shows an old one, and hides ciphertext', async () => {
    const store: Row[] = [{ id: 'old', summary: SUMMARY, created_at: '2026-11-08T00:00:00Z' }];
    const fn = withFieldDecryption((async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      let out: Row[] = [];
      if (method === 'GET') out = store;
      if (method === 'POST') for (const r of [body]) (store.push({ ...r }), out.push(r));
      return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch);
    await fn(`${BASE}/access_audit_findings`, { method: 'POST', body: JSON.stringify({ id: 'new', summary: SUMMARY, signals: ['odd_hours'] }) });
    expect(String(store[1].summary)).toMatch(/^enc:v2:/);
    expect(String(store[1].summary)).not.toContain(SUMMARY);
    const sealedSignals = store[1].signals as string[];
    expect(Array.isArray(sealedSignals)).toBe(true);
    expect(sealedSignals).toHaveLength(1);
    expect(sealedSignals[0]).toMatch(/^enc:v2:/);
    expect(sealedSignals[0]).not.toContain('odd_hours');
    const rows = await (await fn(`${BASE}/access_audit_findings?select=summary&order=created_at.desc`, { method: 'GET' })).json() as Row[];
    expect(rows.map((r) => findingTitle(r.summary))).toEqual([SUMMARY, SUMMARY]);
    expect(findingTitle(store[1].summary)).toBe(CLOSED_FINDING);
    await expect(decryptValue('access_audit_findings', 'summary', 'system:ops', SYSTEM_ROW, store[1].summary)).rejects.toThrow();
  });

  it('rewrites leftover plaintext once and leaves a sealed row', async () => {
    const first = await planAuditSummary(SUMMARY);
    expect(first.action).toBe('write');
    if (first.action !== 'write') return;
    const table = new Map<string, string>([['a', SUMMARY], ['b', first.ciphertext]]);
    const applied = await runAuditSummaryBatch([...table].map(([id, summary]) => ({ id, summary })), async (patch) => { table.set(patch.id, patch.ciphertext); }, true);
    expect(applied.written).toBe(1);
    const again = await runAuditSummaryBatch([...table].map(([id, summary]) => ({ id, summary })), async () => { throw new Error('second'); }, true);
    expect(again.written).toBe(0);
    expect(again.failed).toBe(0);
  });

  it('keeps a readable row when another summary cannot be opened', async () => {
    const plan = await planAuditSummary(SUMMARY);
    if (plan.action !== 'write') throw new Error('plan');
    const rows = [
      { id: 'good', summary: plan.ciphertext, created_at: '2026-11-08T00:00:00Z' },
      { id: 'old', summary: SUMMARY, created_at: '2026-11-07T00:00:00Z' },
      { id: 'bad', summary: 'enc:v2:not-a-real-cipher', created_at: '2026-11-06T00:00:00Z' },
    ];
    const fn = withFieldDecryption((async () => new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch);
    const opened = await (await fn(`${BASE}/access_audit_findings?select=id,summary`, { method: 'GET' })).json() as Row[];
    expect(opened.map((r) => findingTitle(r.summary))).toEqual([SUMMARY, SUMMARY, CLOSED_FINDING]);
    expect(JSON.stringify(opened)).not.toContain('enc:v2');
  });

  it('does not widen privileges or log the summary', () => {
    const sql = readFileSync(new URL('../../../supabase/migrations/000237_access_audit_summary_ciphertext.sql', import.meta.url), 'utf8');
    expect(sql).not.toMatch(/^\s*grant\s|disable row level security|drop policy/im);
    expect(sql).toMatch(/summary not like 'enc:v2:%' and char_length\(summary\) <= 400/);
    const ui = readFileSync(new URL('../components/ops/access/AccessAuditFindings.tsx', import.meta.url), 'utf8');
    expect(ui).toMatch(/order\('created_at'/);
    expect(ui).toMatch(/findingTitle/);
    expect(ui).not.toMatch(/console\.(log|info|warn|error)/);
  });
});
