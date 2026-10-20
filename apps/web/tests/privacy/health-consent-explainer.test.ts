import { describe, expect, it } from 'vitest';
import { healthConsentExplainer } from '@/lib/privacy/health-consent-explainer';

describe('healthConsentExplainer', () => {
  for (const g of ['male', 'female', null] as const) {
    it(`clean copy for ${g}`, () => {
      const e = healthConsentExplainer(g);
      const all = [e.line, e.title, ...e.bullets].join(' ');
      expect(e.bullets.length).toBe(5);
      expect(all).not.toMatch(/\//);
      expect(all).not.toMatch(/אסור/);
    });
  }
  it('gender matched', () => {
    expect(healthConsentExplainer('male').bullets[2]).toContain('"מסכים"');
    expect(healthConsentExplainer('female').bullets[2]).toContain('"מסכימה"');
    expect(healthConsentExplainer('female').line).toContain('את מחליטה');
  });
});
