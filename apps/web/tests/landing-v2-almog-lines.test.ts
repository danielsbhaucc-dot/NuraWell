import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const data = JSON.parse(
  readFileSync(join(__dirname, '../public/landing-v2/real/almog-lines.json'), 'utf8'),
) as { buckets: Record<string, string[]> };
const all = Object.values(data.buckets).flat();
const REQUIRED = ['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night', 'late', 'friday', 'shabbatEve', 'saturday', 'motzash', 'first', 'return', 'sameHour', 'longGap', 'sameDay'];

describe('landing-v2 Almog opening lines', () => {
  it('has 300+ lines', () => expect(all.length).toBeGreaterThanOrEqual(300));
  it('has no duplicates', () => expect(new Set(all).size).toBe(all.length));
  it('covers every time/day/visit bucket with 10+ lines', () => {
    for (const k of REQUIRED) expect(data.buckets[k]?.length ?? 0, k).toBeGreaterThanOrEqual(10);
  });
  it('keeps every line short (max 14 words) and free of statistics', () => {
    for (const l of all) {
      expect(l.replace(/%T/g, '00:00').split(/\s+/).length, l).toBeLessThanOrEqual(14);
      expect(/\d+\s*%|אחוז/.test(l), l).toBe(false);
    }
  });
});
