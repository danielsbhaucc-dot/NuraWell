import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COLUMN_CLASSIFICATION } from '@/lib/security/column-classification';
import { GATED_AFTER_IAM_MERGE } from '@/lib/security/field-registry';
import { NEXT_ENCRYPTION_STEP, PENDING_COLUMN_INVENTORY, PENDING_WORD_NOT_A_PLAINTEXT_COLUMN } from '@/lib/security/pending-column-inventory';

const classifiedPending = () => {
  const out: string[] = [];
  for (const [table, columns] of Object.entries(COLUMN_CLASSIFICATION)) {
    for (const [column, spec] of Object.entries(columns)) {
      if (spec[1].includes('pending (not encrypted yet)')) out.push(`${table}.${column}`);
    }
  }
  return out.sort();
};

describe('pending column inventory', () => {
  it('maps each sensitive pending column once and leaves the other pending words out', () => {
    const mapped = PENDING_COLUMN_INVENTORY.map((row) => `${row.table}.${row.column}`).sort();
    expect(mapped).toEqual(classifiedPending());
    expect(mapped).toHaveLength(19);
    expect(PENDING_WORD_NOT_A_PLAINTEXT_COLUMN).toHaveLength(8);
    const source = readFileSync(new URL('../lib/security/column-classification.ts', import.meta.url), 'utf8');
    expect(source.split('\n').filter((line) => line.toLowerCase().includes('pending'))).toHaveLength(27);
  });

  it('does not treat query keys or the SQL probe counter as ready to encrypt', () => {
    const held = PENDING_COLUMN_INVENTORY.filter((row) => row.verdict === 'מפתח_שאילתה' || row.verdict === 'כותב_SQL' || row.verdict === 'צמוד_למפתח');
    expect(held.map((row) => `${row.table}.${row.column}`).sort()).toEqual([
      'admin_passkeys.telegram_user_id',
      'gideon_device_requests.chat_id',
      'gideon_stranger_sim.attempts',
      'gideon_stranger_sim.chat_id',
      'gideon_telegram_identities.from_id',
      'ops_probe_daily.country',
    ]);
    for (const row of held) expect(row.next).toMatch(/לא מצפינים/);
    expect(PENDING_COLUMN_INVENTORY.find((row) => row.table === 'error_events')?.verdict).toBe('סיווג_ישן');
    expect(NEXT_ENCRYPTION_STEP).toMatch(/pii_access_grants\.reason/);
    expect(NEXT_ENCRYPTION_STEP).not.toMatch(/chat_id|from_id|telegram_user_id/);
  });

  it('keeps the IAM sealing list unused and stores no sample personal data', () => {
    const registry = readFileSync(new URL('../lib/security/field-registry.ts', import.meta.url), 'utf8');
    const uses = registry.split('GATED_AFTER_IAM_MERGE').length - 1;
    expect(uses).toBe(1);
    expect(Object.keys(GATED_AFTER_IAM_MERGE).sort()).toEqual([
      'access_audit_findings', 'access_audit_runs', 'ops_device_enrollments', 'pii_access_grants', 'pii_access_log',
    ]);
    const blob = JSON.stringify(PENDING_COLUMN_INVENTORY);
    expect(blob).not.toMatch(/@|enc:v2:|[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
