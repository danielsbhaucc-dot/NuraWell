import { describe, expect, it } from 'vitest';
import {
  buildOnboardingChatContextBlock,
  buildOnboardingVectorFacts,
} from '../lib/ai/onboarding-chat-context';

describe('onboarding-chat-context', () => {
  it('builds compact chat block when onboarding completed', () => {
    const block = buildOnboardingChatContextBlock({
      full_name: 'דנה כהן',
      gender: 'female',
      main_goal: 'weight_loss',
      current_weight_kg: 80,
      goal_weight_kg: 70,
      weakest_time_of_day: 'evening_night',
      main_obstacle: 'emotional_eating',
      main_obstacle_detail: null,
      wake_up_time: '06:30',
      sleep_time: '23:00',
      preferred_channel: 'in_app',
      ai_check_in_times: ['08:00', '19:30', '21:00'],
      onboarding_completed: true,
    });
    expect(block).toContain('אלמוג');
    expect(block).toContain('דנה');
    expect(block).toContain('ערב/לילה');
    expect(block).toContain('19:30');
  });

  it('returns empty block when onboarding not completed', () => {
    expect(
      buildOnboardingChatContextBlock({
        full_name: 'x',
        gender: null,
        main_goal: null,
        current_weight_kg: null,
        goal_weight_kg: null,
        weakest_time_of_day: null,
        main_obstacle: null,
        main_obstacle_detail: null,
        wake_up_time: null,
        sleep_time: null,
        preferred_channel: null,
        ai_check_in_times: null,
        onboarding_completed: false,
      })
    ).toBe('');
  });

  it('builds vector facts without LLM', () => {
    const facts = buildOnboardingVectorFacts({
      full_name: 'יוסי',
      gender: 'male',
      main_goal: 'both',
      current_weight_kg: 90,
      goal_weight_kg: 82,
      weakest_time_of_day: 'noon',
      main_obstacle: 'no_time',
      main_obstacle_detail: null,
      wake_up_time: '07:00',
      sleep_time: '22:30',
      preferred_channel: 'in_app',
      ai_check_in_times: ['09:00', '12:30', '20:00'],
      onboarding_completed: true,
    });
    expect(facts.length).toBeGreaterThanOrEqual(4);
    expect(facts.some((f) => f.text.includes('צהריים'))).toBe(true);
  });
});
