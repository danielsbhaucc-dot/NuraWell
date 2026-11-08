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
    expect(mapped).toHaveLength(7);
    expect(PENDING_WORD_NOT_A_PLAINTEXT_COLUMN).toHaveLength(8);
    // sealed content gaps must not linger as classification-pending
    expect(mapped).not.toContain('pii_access_log.country');
    expect(mapped).not.toContain('access_audit_findings.signals');
  });

  it('does not treat query keys or the SQL probe counter as ready to encrypt', () => {
    const held = PENDING_COLUMN_INVENTORY.filter((row) => row.verdict === 'מפתח_שאילתה' || row.verdict === 'כותב_SQL' || row.verdict === 'צמוד_למפתח');
    expect(held.map((row) => `${row.table}.${row.column}`).sort()).toEqual([
      'error_events.message',
      'gideon_stranger_sim.attempts',
      'gideon_stranger_sim.chat_id',
      'gideon_telegram_identities.from_id',
      'ops_probe_daily.country',
    ]);
    for (const row of held) expect(row.next).toMatch(/לא מצפינים/);
    expect(held.map((row) => `${row.table}.${row.column}`)).not.toContain('parent_signup_claims.email');
    expect(PENDING_COLUMN_INVENTORY.map((row) => `${row.table}.${row.column}`)).not.toContain('parent_signup_claims.email');
    expect(NEXT_ENCRYPTION_STEP).toMatch(/Device telegram-id|stranger_sim|telegram_identities/i);
    expect(NEXT_ENCRYPTION_STEP).toMatch(/stranger_sim|telegram_identities/);
    expect(NEXT_ENCRYPTION_STEP).not.toMatch(/blindly marked fixed|all telegram fixed/i);
  });

  it('keeps the IAM sealing list unused and stores no sample personal data', () => {
    const registry = readFileSync(new URL('../lib/security/field-registry.ts', import.meta.url), 'utf8');
    const uses = registry.split('GATED_AFTER_IAM_MERGE').length - 1;
    expect(uses).toBe(1);
    // All former GATED content columns were promoted; list is intentionally empty.
    expect(Object.keys(GATED_AFTER_IAM_MERGE).sort()).toEqual([]);
    const blob = JSON.stringify(PENDING_COLUMN_INVENTORY);
    expect(blob).not.toMatch(/@|enc:v2:|[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
