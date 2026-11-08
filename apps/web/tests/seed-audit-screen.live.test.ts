import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { __resetFieldCrypto, encryptValue, setDekStoreForTests, type DekStore } from '@/lib/security/field-crypto';
import type { WrappedDek } from '@/lib/security/field-envelope';
import { SYSTEM_ROW } from '@/lib/security/field-registry';

const DB = 'nurawell_stack_chain';
const OPEN = 'ממצא חתום שנפתח';
const LEGACY = 'ממצא ישן שנשאר גלוי';
const HIDDEN = 'ממצא שמפתח אחר לא פותח';

function psql(sql: string): string {
  return execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-Atq'], {
    encoding: 'utf8', input: sql, stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}
function store(): DekStore {
  const rows = new Map<string, WrappedDek>();
  return { async get(u) { return rows.get(u) ?? null; }, async putIfAbsent(u, w) { if (!rows.has(u)) rows.set(u, w); return rows.get(u)!; } };
}
const q = (value: string) => value.replace(/'/g, "''");

const screenReady = existsSync('/tmp/stack-screen/pii.key');

describe.skipIf(!screenReady)('seed the local findings screen', () => {
  it('writes one sealed row, one old row, and one row under another key', async () => {
    process.env.PII_ENCRYPTION_KEY = readFileSync('/tmp/stack-screen/pii.key', 'utf8').trim();
    __resetFieldCrypto();
    setDekStoreForTests(store());
    const open = await encryptValue('access_audit_findings', 'summary', 'system:audit', SYSTEM_ROW, OPEN);
    process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    __resetFieldCrypto();
    setDekStoreForTests(store());
    const hidden = await encryptValue('access_audit_findings', 'summary', 'system:audit', SYSTEM_ROW, HIDDEN);
    writeFileSync('/tmp/stack-screen/hidden.cipher', String(hidden));
    const run = psql(`insert into public.access_audit_runs (window_from, window_to) values (now() - interval '1 day', now()) returning id`);
    for (const summary of [String(open), LEGACY]) {
      psql(`insert into public.access_audit_findings (run_id, severity, summary, event_kind) values ('${run}', 'low', '${q(summary)}', 'pii_grant')`);
    }
    expect(String(open).startsWith('enc:v2:')).toBe(true);
    expect(String(open).includes(OPEN)).toBe(false);
    expect(String(hidden).startsWith('enc:v2:')).toBe(true);
    expect(psql(`select count(*)::text from public.access_audit_findings where run_id = '${run}'`)).toBe('2');
  });
});
