import { describe, it, expect } from 'vitest';
import { applyPiiDetectors } from '@/lib/ai/privacy/pii-patterns';
const run = (t: string) => applyPiiDetectors(t, (_v, k) => `<${k}>`);
describe('kinship names + plates', () => {
  it('redacts relative names', () => {
    expect(run('אשתי מיכל אמרה')).toBe('אשתי <PERSON> אמרה');
    expect(run('הבן שלי יואב אוהב')).toBe('הבן שלי <PERSON> אוהב');
    expect(run('ואמא שלי רחל')).toBe('ואמא שלי <PERSON>');
    expect(run('my wife Sarah said')).toBe('my wife <PERSON> said');
  });
  it('no over-redaction', () => {
    expect(run('אשתי אמרה שזה טעים')).toBe('אשתי אמרה שזה טעים');
    expect(run('הבן שלי אוהב פסטה')).toBe('הבן שלי אוהב פסטה');
    expect(run('אכלתי 2 פרוסות לחם')).toBe('אכלתי 2 פרוסות לחם');
  });
  it('plates', () => {
    expect(run('מספר רישוי 12-345-67')).toBe('מספר רישוי <PLATE>');
    expect(run('ירדתי 12 ק"ג')).toBe('ירדתי 12 ק"ג');
  });
});
describe('card keyword', () => {
  it('redacts non-Luhn card after keyword', () => {
    expect(run('כרטיס אשראי 4580 1234 5678 9123')).toBe('כרטיס אשראי <CARD>');
  });
});
