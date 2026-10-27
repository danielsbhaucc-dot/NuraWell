import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeAlmogGolden } from './golden/almog-golden.cases';

const FIXTURE = join(__dirname, 'golden', 'almog-golden.fixture.json');

describe('Almog golden behavior (blocks any behavior diff)', () => {
  it('matches the recorded fixture exactly', () => {
    const actual = JSON.parse(JSON.stringify(computeAlmogGolden()));
    if (process.env.UPDATE_ALMOG_GOLDEN === '1') {
      writeFileSync(FIXTURE, JSON.stringify(actual, null, 2) + '\n');
      return;
    }
    expect(existsSync(FIXTURE), 'fixture missing').toBe(true);
    const expected = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    expect(actual).toEqual(expected);
  });
});
