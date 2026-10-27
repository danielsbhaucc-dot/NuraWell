import { describe, expect, it } from 'vitest';
import { ownerOf, validateAreas, findAreas, catalogFlags, trackedAppFiles, REQUIRED_ALWAYS_ON } from '../../../scripts/modules/areas.mjs';
import { classify } from '../../../scripts/modules/boundaries.mjs';

const area = (id: string, owns: string[]) => ({ dir: `modules/${id}`, json: { id, owns } });

describe('area modules', () => {
  it('every catalog module has a valid manifest with two docs, and required always-on features are locked', () => {
    expect(validateAreas(findAreas(), catalogFlags(), trackedAppFiles())).toEqual([]);
    expect(REQUIRED_ALWAYS_ON).toEqual(['consents', 'trusted-device', 'nightly-scan']);
  });
  it('longest owned prefix wins', () => {
    const areas = [area('agent', ['apps/web/lib/ai/']), area('reminders', ['apps/web/lib/ai/almog-commitments/'])];
    expect(ownerOf('apps/web/lib/ai/x.ts', areas)).toBe('agent');
    expect(ownerOf('apps/web/lib/ai/almog-commitments/y.ts', areas)).toBe('reminders');
    expect(ownerOf('apps/web/lib/other.ts', areas)).toBeNull();
  });
  it('owned files pass the boundary check; owned files left on the legacy list fail; unowned new feature code fails', () => {
    const areas = [area('journey', ['apps/web/lib/journey/'])];
    const read = () => 'x';
    expect(classify(['apps/web/lib/journey/a.ts'], new Set(), read, areas)).toEqual([]);
    expect(classify(['apps/web/lib/journey/a.ts'], new Set(['apps/web/lib/journey/a.ts']), read, areas)).toHaveLength(1);
    expect(classify(['apps/web/lib/newfeature/a.ts'], new Set(), read, areas)).toHaveLength(1);
  });
  it('a missing required always-on feature fails validation', () => {
    const cat = new Map([['x', { name: 'x', core: true, essential: false }]]);
    const errs = validateAreas([{ dir: 'modules/x', json: { id: 'x', kind: 'area', alwaysOn: [], owns: [] } }], cat, []);
    expect(errs.some((e: string) => e.includes('"consents"'))).toBe(true);
  });
});
