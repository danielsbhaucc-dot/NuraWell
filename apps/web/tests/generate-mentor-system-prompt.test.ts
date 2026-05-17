import { describe, expect, it } from 'vitest';
import {
  calculateDailyCheckInTimes,
  generateMentorSystemPrompt,
  parseTimeToMinutes,
} from '../lib/ai/generate-mentor-system-prompt';

describe('calculateDailyCheckInTimes', () => {
  it('returns exactly 3 times in HH:MM format', () => {
    const times = calculateDailyCheckInTimes('07:00', '23:00', 'evening_night');
    expect(times).toHaveLength(3);
    for (const t of times) {
      expect(t).toMatch(/^\d{2}:\d{2}$/);
    }
    const mins = times.map(parseTimeToMinutes);
    expect(mins[0]).toBeLessThan(mins[1]);
    expect(mins[1]).toBeLessThan(mins[2]);
  });

  it('places middle check-in before evening weak window', () => {
    const times = calculateDailyCheckInTimes('06:30', '22:30', 'evening_night');
    const middle = parseTimeToMinutes(times[1]);
    expect(middle).toBeGreaterThanOrEqual(parseTimeToMinutes('17:00'));
    expect(middle).toBeLessThanOrEqual(parseTimeToMinutes('20:30'));
  });
});

describe('generateMentorSystemPrompt', () => {
  it('includes obstacle and three check-in times', () => {
    const prompt = generateMentorSystemPrompt({
      full_name: 'ישראל ישראלי',
      gender: 'male',
      main_goal: 'both',
      current_weight_kg: 92,
      goal_weight_kg: 82,
      height_cm: 178,
      weakest_time_of_day: 'noon',
      main_obstacle: 'emotional_eating',
      wake_up_time: '07:00',
      sleep_time: '23:00',
      preferred_channel: 'in_app',
    });
    expect(prompt).toContain('דולב');
    expect(prompt).toContain('ישראל');
    expect(prompt).toContain('אכילה רגשית');
    expect(prompt).toMatch(/1\. \d{2}:\d{2}/);
    expect(prompt).toContain('לפני החלון הקשה');
  });
});
