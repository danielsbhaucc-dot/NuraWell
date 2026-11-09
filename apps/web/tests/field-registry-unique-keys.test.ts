import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ENCRYPTED_TABLES } from '@/lib/security/field-registry';

describe('field-registry unique column keys', () => {
  it('profiles keeps both birth columns once (no duplicate object keys)', () => {
    const cols = Object.keys(ENCRYPTED_TABLES.profiles.columns);
    expect(cols.filter((c) => c === 'date_of_birth')).toHaveLength(1);
    expect(cols.filter((c) => c === 'birth_date')).toHaveLength(1);
    // source text must not repeat the pair (runtime Object.keys would hide duplicates)
    const src = readFileSync(new URL('../lib/security/field-registry.ts', import.meta.url), 'utf8');
    const block = src.slice(src.indexOf('profiles:'), src.indexOf('ai_interactions:'));
    expect(block.split("date_of_birth: 'text'").length - 1).toBe(1);
    expect(block.split("birth_date: 'text'").length - 1).toBe(1);
  });

  it('no encrypted table declares duplicate column keys in source', () => {
    const src = readFileSync(new URL('../lib/security/field-registry.ts', import.meta.url), 'utf8');
    const tables = src.match(/\n  (\w+): \{[\s\S]*?columns: \{([\s\S]*?)\n  \}/g) ?? [];
    expect(tables.length).toBeGreaterThan(10);
    for (const t of Object.keys(ENCRYPTED_TABLES)) {
      const keys = Object.keys(ENCRYPTED_TABLES[t as keyof typeof ENCRYPTED_TABLES].columns);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
