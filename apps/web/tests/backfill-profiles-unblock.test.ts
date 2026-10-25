import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIELD_V2_BACKFILL_TABLES } from '@/lib/security/field-backfill';
import { nameMatches } from '@/lib/security/name-match';

describe('profiles / user_memories / journey cache join the v2 backfill', () => {
  it('lists the three tables', () => {
    for (const t of ['profiles', 'user_memories', 'journey_next_step_cache']) expect(FIELD_V2_BACKFILL_TABLES).toContain(t);
  });

  it('no SQL text filter or embed reads encrypted profile columns', () => {
    for (const f of ['app/api/v1/ops/legal/search/route.ts', 'lib/ceo/tools.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/ilike\(\s*'full_name'/);
      expect(src).not.toMatch(/profiles!inner\([^)]*gender/);
    }
  });

  it('nameMatches is case/space-insensitive substring', () => {
    expect(nameMatches('נועה  כהן', 'נועה כהן')).toBe(true);
    expect(nameMatches('Noa Cohen', 'cohen')).toBe(true);
    expect(nameMatches(null, 'x')).toBe(false);
    expect(nameMatches('Noa', '  ')).toBe(false);
  });
});
