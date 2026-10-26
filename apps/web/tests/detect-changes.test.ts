import { describe, expect, it } from 'vitest';
import { detectNotableChanges, formatNotableChangesBlock } from '../lib/ai/insights/patterns/detect-changes';

const at = (d: string, h = 9) => `${d}T${String(h).padStart(2, '0')}:00:00Z`;
const now = new Date('2026-10-26T10:00:00Z');

describe('notable changes', () => {
  it('flags a broken streak', () => {
    const ev = ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'].map((d) => ({ at: at(d), kind: 'done' as const }));
    ev.push({ at: at('2026-10-25'), kind: 'missed' as const } as any);
    expect(detectNotableChanges(ev, now).map((c) => c.kind)).toContain('streak_broken');
  });
  it('flags an unusual success on a usually-hard weekday and SOS after quiet, risk first', () => {
    // Mondays (2026-10-05, 12, 19) missed, done on 2026-10-26 (Monday)
    const ev: any[] = ['2026-10-05', '2026-10-12', '2026-10-19'].map((d) => ({ at: at(d), kind: 'missed' }));
    ev.push({ at: at('2026-10-26', 7), kind: 'done' }, { at: at('2026-10-25'), kind: 'sos' });
    const r = detectNotableChanges(ev, now);
    expect(r[0]!.kind).toBe('sos_after_quiet');
    expect(r.map((c) => c.kind)).toContain('unusual_success');
  });
  it('is silent on a normal routine and formats nothing for empty input', () => {
    const ev = ['2026-10-24', '2026-10-25'].map((d) => ({ at: at(d), kind: 'done' as const }));
    expect(detectNotableChanges(ev, now)).toEqual([]);
    expect(formatNotableChangesBlock([])).toBe('');
  });
});
