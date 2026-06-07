import { describe, expect, it } from 'vitest';

import { computeEngagementStatus } from '../lib/churn/reengagement-moves';

describe('computeEngagementStatus mapping', () => {
  it('0-1 days → active', () => {
    expect(computeEngagementStatus(0)).toBe('active');
    expect(computeEngagementStatus(1)).toBe('active');
  });

  it('2 days → slipping', () => {
    expect(computeEngagementStatus(2)).toBe('slipping');
  });

  it('3-6 days → at_risk', () => {
    expect(computeEngagementStatus(3)).toBe('at_risk');
    expect(computeEngagementStatus(6)).toBe('at_risk');
  });

  it('7-13 days → dormant', () => {
    expect(computeEngagementStatus(7)).toBe('dormant');
    expect(computeEngagementStatus(13)).toBe('dormant');
  });

  it('14+ days → churned', () => {
    expect(computeEngagementStatus(14)).toBe('churned');
    expect(computeEngagementStatus(60)).toBe('churned');
  });

  it('handles negative / non-finite defensively', () => {
    expect(computeEngagementStatus(-5)).toBe('active');
    expect(computeEngagementStatus(Number.NaN)).toBe('churned');
  });
});
