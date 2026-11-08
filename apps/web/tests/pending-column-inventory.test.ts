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
    expect(mapped).toEqual(['billing_invoices.doc_url']);
    expect(PENDING_WORD_NOT_A_PLAINTEXT_COLUMN).toHaveLength(8);
    expect(mapped).not.toContain('error_events.message');
    expect(mapped).not.toContain('ip_block_ranges.reason');
    expect(mapped).not.toContain('ops_probe_daily.country');
    expect(mapped).not.toContain('gideon_stranger_sim.chat_id');
  });

  it('documents triage: sealed/fixed/aggregate out of pending; doc_url held for writer', () => {
    expect(COLUMN_CLASSIFICATION.error_events.message[1]).toMatch(/registered/);
    expect(COLUMN_CLASSIFICATION.ip_block_ranges.reason[0]).toBe('non_sensitive');
    expect(COLUMN_CLASSIFICATION.ops_probe_daily.country[0]).toBe('non_sensitive');
    expect(COLUMN_CLASSIFICATION.billing_invoices.doc_url[1]).toMatch(/pending \(not encrypted yet\)/);
    expect(NEXT_ENCRYPTION_STEP).toMatch(/nonempty legacy|PK nonempty/i);
    expect(NEXT_ENCRYPTION_STEP).toMatch(/billing_invoices\.doc_url/);
    expect(NEXT_ENCRYPTION_STEP).toMatch(/Not a full-PII finish/i);
    expect(NEXT_ENCRYPTION_STEP).not.toMatch(/\ball PII complete\b/i);
  });

  it('keeps the IAM sealing list unused and stores no sample personal data', () => {
    const registry = readFileSync(new URL('../lib/security/field-registry.ts', import.meta.url), 'utf8');
    expect(registry.split('GATED_AFTER_IAM_MERGE').length - 1).toBe(1);
    expect(Object.keys(GATED_AFTER_IAM_MERGE).sort()).toEqual([]);
    expect(JSON.stringify(PENDING_COLUMN_INVENTORY)).not.toMatch(/@|enc:v2:|[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
