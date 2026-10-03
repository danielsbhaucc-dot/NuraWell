import { describe, expect, it } from 'vitest';
import {
  parseImmersiveAttentionStops,
  serializeImmersiveAttentionStops,
  formatSecondsAsClock,
} from '../lib/journey/immersiveAttentionStops';

describe('immersive attention stops', () => {
  it('parses configured mid-video stops sorted by time', () => {
    const blob = serializeImmersiveAttentionStops([
      {
        id: 'b',
        time_seconds: 40,
        question: 'שאלה מאוחרת?',
        feedback: 'יפה',
        auto_resume_seconds: 5,
      },
      {
        id: 'a',
        time_seconds: 12,
        question: 'שאלה מוקדמת?',
        feedback: 'ממשיכים',
        options: ['כן', 'לא'],
        correct_option_index: 0,
        auto_resume_seconds: 8,
      },
    ]);
    const stops = parseImmersiveAttentionStops(blob);
    expect(stops).toHaveLength(2);
    expect(stops[0].id).toBe('a');
    expect(stops[0].time_seconds).toBe(12);
    expect(stops[1].time_seconds).toBe(40);
  });

  it('formats cue clocks for the attention overlay', () => {
    expect(formatSecondsAsClock(75)).toBe('01:15');
    expect(formatSecondsAsClock(8)).toBe('00:08');
  });
});
