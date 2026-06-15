import { describe, expect, it } from 'vitest';

import { buildGuardianTouch } from '../lib/ai/guardian/build-guardian-touch';
import { evaluateGuardianGate, guardianOptedIn } from '../lib/ai/guardian/guardian-gates';
import type { RiskWindow } from '../lib/ai/risk-window';

const validWindow: RiskWindow = {
  weekday: 1,
  start_hhmm: '20:00',
  duration_min: 60,
  trigger: 'emotional',
  confidence: 0.72,
  sample_size: 3,
  distinct_dates: 2,
};

function allowed(overrides = {}) {
  return evaluateGuardianGate({
    aiContext: { guardian: { opted_in: true } },
    engagementStatus: 'active',
    riskSignals: {},
    window: validWindow,
    touchesToday: 0,
    touchesThisWeek: 0,
    recentlyActive: false,
    ...overrides,
  });
}

describe('guardian gates', () => {
  it('recognizes nested and legacy opt-in flags', () => {
    expect(guardianOptedIn({ guardian: { opted_in: true } })).toBe(true);
    expect(guardianOptedIn({ guardian_opted_in: true })).toBe(true);
    expect(guardianOptedIn({ guardian: { opted_in: false } })).toBe(false);
  });

  it('allows a valid opted-in user', () => {
    expect(allowed()).toEqual({ allowed: true });
  });

  it('blocks safety and preference gates', () => {
    expect(allowed({ aiContext: {} })).toEqual({ allowed: false, reason: 'not_opted_in' });
    expect(allowed({ aiContext: { guardian: { opted_in: true }, avoid_push: true } })).toEqual({
      allowed: false,
      reason: 'avoid_push',
    });
    expect(
      allowed({
        aiContext: {
          guardian: { opted_in: true },
          life_context: { kind: 'crisis', profile: 'pause', summary: 'תקופה קשה', push_level: 'minimal' },
        },
      })
    ).toEqual({ allowed: false, reason: 'life_pause' });
    expect(allowed({ riskSignals: { red_flag_at: '2026-06-15T10:00:00Z' } })).toEqual({
      allowed: false,
      reason: 'red_flag',
    });
  });

  it('blocks frequency, active users, churned users and weak patterns', () => {
    expect(allowed({ touchesToday: 1 })).toEqual({ allowed: false, reason: 'frequency_cap' });
    expect(allowed({ touchesThisWeek: 3 })).toEqual({ allowed: false, reason: 'frequency_cap' });
    expect(allowed({ recentlyActive: true })).toEqual({ allowed: false, reason: 'recently_active' });
    expect(allowed({ engagementStatus: 'churned' })).toEqual({ allowed: false, reason: 'churned' });
    expect(allowed({ window: { ...validWindow, confidence: 0.59 } })).toEqual({
      allowed: false,
      reason: 'low_confidence',
    });
    expect(allowed({ window: { ...validWindow, distinct_dates: 1 } })).toEqual({
      allowed: false,
      reason: 'low_date_spread',
    });
  });

  it('builds a supportive non-restrictive touch', () => {
    const touch = buildGuardianTouch({ fullName: 'דני כהן', window: validWindow, leadMin: 30 });

    expect(touch.title).toContain('דני');
    expect(touch.body).toContain('להיות פה איתך');
    expect(touch.body).not.toMatch(/אל תאכל|תתאפק|דיאטה|כישלון/);
    expect(touch.body).toMatch(/\?$/);
  });
});
