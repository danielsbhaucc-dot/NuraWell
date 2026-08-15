import { describe, expect, it } from 'vitest';
import { extractOpenRouterDeltaText } from '../lib/ai/openrouter-delta-text';

describe('extractOpenRouterDeltaText', () => {
  it('reads plain string content', () => {
    expect(extractOpenRouterDeltaText({ delta: { content: 'אוף, יום קשה' } })).toBe(
      'אוף, יום קשה'
    );
  });

  it('reads output_text parts used by GPT-5.6', () => {
    expect(
      extractOpenRouterDeltaText({
        delta: { content: [{ type: 'output_text', text: 'וואלה אחי' }] },
      })
    ).toBe('וואלה אחי');
  });

  it('does not treat reasoning as the user-visible reply', () => {
    expect(
      extractOpenRouterDeltaText({
        delta: { reasoning: 'thinking about empathy', content: '' },
      })
    ).toBe('');
  });
});
