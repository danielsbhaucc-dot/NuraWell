import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  encodeEmojiReactionFix,
  extractEmojiReactionFix,
  stripEmojiReactionMarker,
} from '@/lib/ai/emoji-reaction/marker';
import { buildPreviousReactionPromptBlock } from '@/lib/ai/emoji-reaction/persist-user-reaction';

describe('emoji reaction fix', () => {
  it('parses replace and remove, last one wins', () => {
    expect(extractEmojiReactionFix('סליחה ⟦NW_RX_FIX:{"e":"🙏"}⟧')).toEqual({
      action: 'replace',
      reaction: { emoji: '🙏', verb: 'הגיב עם' },
    });
    expect(extractEmojiReactionFix('a ⟦NW_RX_FIX:{"e":"🙏"}⟧ b ⟦NW_RX_FIX:{"remove":true}⟧')).toEqual({ action: 'remove' });
    expect(extractEmojiReactionFix('בלי סימון')).toBeNull();
    expect(extractEmojiReactionFix('⟦NW_RX_FIX:{"e":"hello"}⟧')).toBeNull();
  });

  it('round-trips encode and is stripped from displayed/stored text', () => {
    const m = encodeEmojiReactionFix({ action: 'remove' });
    expect(extractEmojiReactionFix(`x ${m}`)).toEqual({ action: 'remove' });
    expect(stripEmojiReactionMarker(`צודק, לא מתאים. ${m}`)).toBe('צודק, לא מתאים.');
    expect(stripEmojiReactionMarker('רגע ⟦NW_RX_FIX:{"e":')).toBe('רגע');
  });

  it('adds a prompt block only when a previous reaction exists', () => {
    const turns = [
      { role: 'user', content: 'נכשלתי היום שוב', emoji_reaction: { emoji: '😂', verb: 'צחק' } },
      { role: 'assistant', content: 'קורה' },
      { role: 'user', content: 'למה צחקת?' },
    ];
    const block = buildPreviousReactionPromptBlock(turns, 'למה צחקת?');
    expect(block).toContain('😂');
    expect(block).toContain('NW_RX_FIX');
    expect(buildPreviousReactionPromptBlock([{ role: 'user', content: 'היי' }], 'היי')).toBeNull();
  });
});
