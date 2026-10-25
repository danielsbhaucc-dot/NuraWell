import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SECURITY_DOCS } from '@/lib/legal/security-docs.generated';

describe('admin legal security docs are in sync with docs/security', () => {
  it('matches the markdown files (run node scripts/gen-security-docs.mjs)', () => {
    const dir = join(__dirname, '../../../docs/security');
    const files = readdirSync(dir).filter((f) => f.endsWith('.he.md'));
    expect(SECURITY_DOCS.map((d) => d.file).sort()).toEqual(files.sort());
    for (const d of SECURITY_DOCS) expect(d.markdown).toBe(readFileSync(join(dir, d.file), 'utf8'));
  });
});
