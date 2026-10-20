import { describe, expect, it } from 'vitest';
import { isSimStart } from '@/lib/ceo/stranger-sim';
import { commandsManifest, suggestCommand } from '@/lib/ceo/commands';

describe('Gideon simulation intent', () => {
  it.each(['/סימולציה', '/simulate', 'גדעון תעשה לי סימולציה', 'תעשה סימולציה', 'הפעל סימולציה', 'גדעון, תריץ סימולציה עכשיו', 'תבדוק אותי כזר', 'סימולציה', 'simulate', "let's run a simulation", 'בוא נעשה סימולציית זר'])('starts: %s', (t) => expect(isSimStart(t)).toBe(true));
  it.each(['מה זה סימולציה?', 'אל תעשה סימולציה', 'סיום סימולציה', 'אני מוותר', 'תעשה לי דוח', 'איך עובדת הסימולציה', '/סימו', 'שלום'])('does not start: %s', (t) => expect(isSimStart(t)).toBe(false));
});

describe('slash command suggestions', () => {
  it('prefix typo suggests the command with a button', () => {
    expect(suggestCommand('/סימו')?.cmd).toBe('/סימולציה');
    expect(suggestCommand('/simu')?.callback).toBe('ceo:sim:start');
    expect(suggestCommand('/lo')?.cmd).toBe('/lock');
  });
  it('known or unrelated commands get no suggestion', () => {
    expect(suggestCommand('/סימולציה')).toBeNull();
    expect(suggestCommand('/xyz')).toBeNull();
    expect(suggestCommand('סימו')).toBeNull();
  });
  it('manifest lists real commands for the AI prompt', () => {
    const m = commandsManifest();
    for (const c of ['/סימולציה', '/simulate', '/lock', '/kill', '/start']) expect(m).toContain(c);
  });
});
