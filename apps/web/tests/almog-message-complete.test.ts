import { describe, expect, it, vi } from 'vitest';

import {
  looksLikeCompleteHebrewMessage,
  stitchModelTextUntilComplete,
} from '../lib/ai/almog-message-complete';

describe('looksLikeCompleteHebrewMessage', () => {
  it('detects sentence end', () => {
    expect(looksLikeCompleteHebrewMessage('שלום, איך הולך?')).toBe(true);
    expect(looksLikeCompleteHebrewMessage('עדיין באמצע')).toBe(false);
  });
});

describe('stitchModelTextUntilComplete', () => {
  it('returns initial text when not truncated', async () => {
    const out = await stitchModelTextUntilComplete(
      { text: 'שלום עולם.', finishReason: 'stop' },
      vi.fn(),
      [{ role: 'user', content: 'hi' }]
    );
    expect(out).toBe('שלום עולם.');
  });

  it('uses lightweight continuation without full history', async () => {
    const light = vi.fn().mockResolvedValueOnce({ text: 'וזה הסוף.', finishReason: 'stop' });
    const heavy = vi.fn();
    const out = await stitchModelTextUntilComplete(
      { text: 'התחלה', finishReason: 'length' },
      heavy,
      [{ role: 'system', content: 'x'.repeat(5000) }],
      { maxContinuations: 1, lightweightContinue: light }
    );
    expect(out).toBe('התחלה וזה הסוף.');
    expect(light).toHaveBeenCalledTimes(1);
    expect(heavy).not.toHaveBeenCalled();
  });
});
