import { describe, expect, it } from 'vitest';
import { condenseContextSections, CONDENSED_OPEN, CONDENSED_CLOSE } from '../lib/ai/chat-memory/context-condenser';
import { looksLikeCondenserEcho, sanitizeWriterOutput } from '../lib/ai/sanitize-writer-output';
import { shapeQualitySample } from '../lib/ceo/tools';
import { CEO_SYSTEM_PROMPT } from '../lib/ceo/agent';

describe('Gideon quality-sample grounding', () => {
  it('empty sample says no samples: N=0', () => {
    const r = shapeQualitySample([], []);
    expect(r.sampleSize.total).toBe(0);
    expect(r.note).toContain('no samples: N=0');
  });
  it('near-empty sample is flagged, full sample has ids and no note', () => {
    expect(shapeQualitySample([{ id: 'a' }], []).note).toContain('N=1');
    const full = shapeQualitySample([{ id: 'a' }, { id: 'b' }], [{ id: 'c' }]);
    expect(full.note).toBeUndefined();
    expect(full.chat.map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('prompt forbids inventing examples', () => {
    expect(CEO_SYSTEM_PROMPT).toContain('אין נתונים להערכה');
  });
});

describe('condenser guard', () => {
  it('wraps the brief in neutral background delimiters', async () => {
    const mem = '## זיכרון\n' + 'פרט חשוב. '.repeat(300);
    const r = await condenseContextSections({ sections: ['א', mem], userMessage: 'היי', condensable: (s) => s === mem, call: async () => '- נקודה אחת שחשובה למשתמש עכשיו ועוד קצת טקסט' });
    expect(r.condensed).toBe(true);
    const block = r.sections[1]!;
    expect(block.startsWith(CONDENSED_OPEN)).toBe(true);
    expect(block.endsWith(CONDENSED_CLOSE)).toBe(true);
    expect(block).not.toContain('[תקציר הקשר רלוונטי]');
  });
  it('sanitizer strips echoed markers (new + legacy)', () => {
    for (const m of ['[תקציר הקשר רלוונטי]', CONDENSED_OPEN, CONDENSED_CLOSE]) {
      const t = `${m}\nשלום, איך היה היום?`;
      expect(looksLikeCondenserEcho(t)).toBe(true);
      expect(sanitizeWriterOutput(t)).toBe('שלום, איך היה היום?');
    }
    expect(looksLikeCondenserEcho('שלום')).toBe(false);
  });
});
