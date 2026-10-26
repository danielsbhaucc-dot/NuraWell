import { describe, expect, it } from 'vitest';
import { condenseContextSections } from '../lib/ai/chat-memory/context-condenser';

const mem = `[זיכרונות רלוונטיים]\n${'עובדה על המשתמש. '.repeat(120)}`;
const crisis = `[זיכרונות רלוונטיים] אזכור משבר קודם ${'x'.repeat(2000)}`;
const base = ['[זמן] עכשיו', mem, '[התחייבויות] ללכת 20 דק'];

describe('context condenser fail-safe', () => {
  it('falls back on timeout', async () => {
    const r = await condenseContextSections({ sections: base, userMessage: 'היי', timeoutMs: 20, call: () => new Promise(() => {}) });
    expect(r).toMatchObject({ condensed: false, reason: 'timeout' });
    expect(r.sections).toBe(base);
  });
  it('falls back on error and bad brief', async () => {
    expect((await condenseContextSections({ sections: base, userMessage: 'x', call: async () => { throw new Error('500'); } })).sections).toBe(base);
    expect((await condenseContextSections({ sections: base, userMessage: 'x', call: async () => 'ok' })).reason).toBe('bad_brief');
  });
  it('condenses only memory blocks, keeps others and safety', async () => {
    const brief = '- קושי פעיל: אכילה בלילה. הצלחה: 3 ימי הליכה.';
    const r = await condenseContextSections({ sections: [...base, crisis], userMessage: 'x', call: async () => brief });
    expect(r.condensed).toBe(true);
    expect(r.sections).toContain('[זמן] עכשיו');
    expect(r.sections).toContain('[התחייבויות] ללכת 20 דק');
    expect(r.sections).toContain(crisis);
    expect(r.sections.join()).not.toContain('עובדה על המשתמש');
  });
  it('skips when there is little to condense', async () => {
    expect((await condenseContextSections({ sections: ['[זיכרונות רלוונטיים] קצר'], userMessage: 'x', call: async () => 'never' })).reason).toBe('too_small');
  });
});
