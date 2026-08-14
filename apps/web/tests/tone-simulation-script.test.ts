import { describe, expect, it } from 'vitest';
import { formatToneSimulationCostSummary, TONE_SIMULATION_STEPS } from '../lib/ai/tone-simulation-script';

describe('tone simulation script', () => {
  it('has one user turn per tone parameter', () => {
    expect(TONE_SIMULATION_STEPS.map((s) => s.id)).toEqual([
      'general_help',
      'empathy',
      'boundaries',
      'argument',
      'follow_through',
    ]);
    for (const step of TONE_SIMULATION_STEPS) {
      expect(step.userText.trim().length).toBeGreaterThan(20);
    }
  });

  it('formats a cost summary in Hebrew', () => {
    const text = formatToneSimulationCostSummary({
      modelLabel: 'GPT Luna',
      steps: [
        { title: 'עזרה כללית', costUsd: 0.0123, inputTokens: 100, outputTokens: 50 },
        { title: 'אמפתיה', costUsd: 0.0077, inputTokens: 80, outputTokens: 40 },
      ],
    });
    expect(text).toContain('סיכום עלויות — GPT Luna');
    expect(text).toContain('סה״כ: $0.0200');
    expect(text).toContain('OpenRouter');
  });
});
