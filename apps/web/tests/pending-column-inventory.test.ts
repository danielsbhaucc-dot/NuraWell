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
  it('maps each sensitive pending column once (none left after doc_url register)', () => {
    const mapped = PENDING_COLUMN_INVENTORY.map((row) => `${row.table}.${row.column}`).sort();
    expect(mapped).toEqual(classifiedPending());
    expect(mapped).toEqual([]);
    expect(PENDING_WORD_NOT_A_PLAINTEXT_COLUMN).toHaveLength(8);
  });

  it('documents registered doc_url + triage notes; not a full-PII finish', () => {
    expect(COLUMN_CLASSIFICATION.billing_invoices.doc_url[1]).toMatch(/registered/);
    expect(COLUMN_CLASSIFICATION.billing_invoices.doc_url[1]).not.toMatch(/pending \(not encrypted yet\)/);
    expect(COLUMN_CLASSIFICATION.error_events.message[1]).toMatch(/registered/);
    expect(COLUMN_CLASSIFICATION.ip_block_ranges.reason[0]).toBe('non_sensitive');
    expect(COLUMN_CLASSIFICATION.ip_block_ranges.reason[1]).toMatch(/sole app writer|literal 'manual'/);
    expect(COLUMN_CLASSIFICATION.ops_probe_daily.country[0]).toBe('non_sensitive');
    expect(COLUMN_CLASSIFICATION.ops_probe_daily.country[1]).toMatch(/linkable pseudonymous|not a public/);
    expect(NEXT_ENCRYPTION_STEP).toMatch(/billing_invoices\.doc_url registered/i);
    expect(NEXT_ENCRYPTION_STEP).toMatch(/append-only/i);
    expect(NEXT_ENCRYPTION_STEP).toMatch(/Not a full-PII finish/i);
  });

  it('keeps the IAM sealing list unused and stores no sample personal data', () => {
    const registry = readFileSync(new URL('../lib/security/field-registry.ts', import.meta.url), 'utf8');
    expect(registry.split('GATED_AFTER_IAM_MERGE').length - 1).toBe(1);
    expect(Object.keys(GATED_AFTER_IAM_MERGE).sort()).toEqual([]);
    expect(JSON.stringify(PENDING_COLUMN_INVENTORY)).not.toMatch(/@|enc:v2:|[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
