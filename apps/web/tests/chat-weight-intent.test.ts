import { describe, expect, it } from 'vitest';

import { parseWeightKgFromMessage } from '../lib/ai/chat-weight-intent';

describe('chat-weight-intent', () => {
  it('parses weight with context', () => {
    expect(parseWeightKgFromMessage('המשקל שלי היום 82.5 קג')).toBe(82.5);
    expect(parseWeightKgFromMessage('שוקל 91')).toBe(91);
  });

  it('rejects out of range', () => {
    expect(parseWeightKgFromMessage('משקל 12')).toBeNull();
    expect(parseWeightKgFromMessage('משקל 400')).toBeNull();
  });
});
