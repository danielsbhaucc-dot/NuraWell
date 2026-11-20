import { afterEach, describe, expect, it } from 'vitest';
import { labMissing, labTitle } from '@/tests/support/local-lab';

const prev = process.env.NW_REQUIRE_LAB;
afterEach(() => {
  if (prev === undefined) delete process.env.NW_REQUIRE_LAB;
  else process.env.NW_REQUIRE_LAB = prev;
});

describe('local lab gate', () => {
  it('names the missing piece so the skip is visible, and passes when nothing is missing', () => {
    delete process.env.NW_REQUIRE_LAB;
    const why = labMissing([{ kind: 'file', path: '/nonexistent/lab-gate-probe.env' }]);
    expect(why).toBe('needs lab file /nonexistent/lab-gate-probe.env');
    expect(labTitle('t', why)).toBe('t [skipped: needs lab file /nonexistent/lab-gate-probe.env]');
    expect(labMissing([{ kind: 'file', path: 'package.json' }])).toBeNull();
    expect(labTitle('t', null)).toBe('t');
  });
  it('NW_REQUIRE_LAB=1 turns a missing lab into a hard failure instead of a skip', () => {
    process.env.NW_REQUIRE_LAB = '1';
    expect(() => labMissing([{ kind: 'file', path: '/nonexistent/lab-gate-probe-2.env' }])).toThrow(/local lab required/);
  });
});
