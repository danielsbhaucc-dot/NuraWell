import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetFieldCrypto, setDekStoreForTests, type DekStore } from '@/lib/security/field-crypto';
import { piiEnforceProbe } from '@/lib/security/field-backfill';

const mem = (): DekStore => {
  const m = new Map();
  return { async get(u) { return m.get(u) ?? null; }, async putIfAbsent(u, w) { if (!m.has(u)) m.set(u, w); return m.get(u); } };
};
const env = { ...process.env };
beforeEach(() => {
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://probe.supabase.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
  __resetFieldCrypto();
  setDekStoreForTests(mem());
});
afterEach(() => { process.env = { ...env }; });

describe('pii_enforce_probe', () => {
  it('replays the sealed app bodies and a plaintext variant through the rolled-back rpc', async () => {
    const calls: Array<{ fn: string; args: Record<string, Record<string, unknown>> }> = [];
    const raw = {
      from: () => ({ select: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { actor_id: '11111111-1111-4111-8111-111111111111', subject_id: '22222222-2222-4222-8222-222222222222' } }) }) }) }),
      rpc: async (fn: string, args: Record<string, Record<string, unknown>>) => { calls.push({ fn, args }); return { data: { sealed: 'accepted', plain: 'rejected: x' }, error: null }; },
    };
    const r = await piiEnforceProbe(raw as never);
    expect(r).toMatchObject({ grantSealed: true, logSealed: true });
    expect(calls.map((c) => c.args.p_table)).toEqual(['pii_access_grants', 'pii_access_log']);
    const [g, l] = calls;
    expect(String(g.args.p_row.reason)).toMatch(/^enc:v2:/);
    expect(g.args.p_plain.reason).toBe('synthetic plaintext reason for probe only');
    expect(String(l.args.p_row.resource)).toMatch(/^enc:v2:/);
    expect(l.args.p_plain.resource).toBe('probe-plain');
    expect(JSON.stringify(calls)).not.toContain('חיוב כפול');
  });

  it('migration rolls back every attempt and is service_role only', () => {
    const sql = readFileSync(new URL('../../../supabase/migrations/000261_enc_enforce_write_probe.sql', import.meta.url), 'utf8');
    expect(sql).toContain("raise exception 'probe-rollback' using errcode = 'P0099'");
    expect(sql).toMatch(/revoke all on function public\.enc_enforce_write_probe\(text, jsonb, jsonb\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.enc_enforce_write_probe\(text, jsonb, jsonb\) to service_role/);
  });
});
