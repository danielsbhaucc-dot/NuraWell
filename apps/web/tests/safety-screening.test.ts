import { describe, expect, it } from 'vitest';
import { buildSafetyScreening, SCREENING_GUIDANCE } from '../lib/onboarding/safety-screening';
import { validateBodyMetrics } from '../lib/onboarding/body-metrics';
import { GENDER_SLASH_RE } from '../lib/i18n/gender';

describe('onboarding safety screening', () => {
  const none = { edHistory: false, pregnancy: false, fluidRestriction: false, medicalFollowup: false, minor: false };
  it('derives adaptations', () => {
    expect(buildSafetyScreening(none)).toMatchObject({ no_weight: false, recommend_clinician: false });
    expect(buildSafetyScreening({ ...none, edHistory: true })).toMatchObject({ no_weight: true, recommend_clinician: true });
    expect(buildSafetyScreening({ ...none, pregnancy: true }).no_weight).toBe(true);
    expect(buildSafetyScreening({ ...none, minor: true })).toMatchObject({ no_weight: true, recommend_clinician: false });
    expect(buildSafetyScreening({ ...none, fluidRestriction: true })).toMatchObject({ fluid_restriction_alt: true, no_weight: false });
  });
  it('guidance copy is neutral Hebrew and ED guidance includes ער״ן', () => {
    for (const t of Object.values(SCREENING_GUIDANCE)) expect(GENDER_SLASH_RE.test(t)).toBe(false);
    expect(SCREENING_GUIDANCE.ed_history).toContain('1201');
  });
  it('weight is optional; entered values are still range-checked', () => {
    expect(validateBodyMetrics({ currentWeight: '', targetWeight: '', height: '' })).toBeNull();
    expect(validateBodyMetrics({ currentWeight: '5', targetWeight: '', height: '' })).toMatchObject({ field: 'current_weight' });
  });
});
