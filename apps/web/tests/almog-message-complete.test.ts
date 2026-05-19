import { describe, expect, it, vi } from 'vitest';

import { stitchModelTextUntilComplete } from '../lib/ai/almog-message-complete';

describe('stitchModelTextUntilComplete', () => {
  it('returns initial text when not truncated', async () => {
    const out = await stitchModelTextUntilComplete(
      { text: 'שלום עולם', finishReason: 'stop' },
      vi.fn(),
      [{ role: 'user', content: 'hi' }]
    );
    expect(out).toBe('שלום עולם');
  });

  it('appends continuation when finishReason is length', async () => {
    const cont = vi
      .fn()
      .mockResolvedValueOnce({ text: 'וזה הסוף.', finishReason: 'stop' });
    const out = await stitchModelTextUntilComplete(
      { text: 'התחלה', finishReason: 'length' },
      cont,
      [{ role: 'user', content: 'hi' }]
    );
    expect(out).toBe('התחלה וזה הסוף.');
    expect(cont).toHaveBeenCalledTimes(1);
  });
});
