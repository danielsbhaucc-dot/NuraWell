import { describe, expect, it } from 'vitest';

import {
  buildPassiveBody,
  decidePassiveKind,
  isPassivePresenceEligible,
  pickPassiveValueTemplate,
} from '../lib/churn/passive-presence-batch';
import { detectPassiveTrigger } from '../lib/churn/israeli-holidays';

const NOW = new Date('2026-06-10T09:00:00Z');

describe('decidePassiveKind — priority + cooldowns', () => {
  it('trigger present and no recent trigger → trigger', () => {
    expect(
      decidePassiveKind({
        now: NOW,
        trigger: 'month_start',
        lastPassiveValueAt: null,
        lastPassiveTriggerAt: null,
      })
    ).toBe('trigger');
  });

  it('trigger present but sent within 14d → falls through (value/soft)', () => {
    const fiveDaysAgo = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      decidePassiveKind({
        now: NOW,
        trigger: 'monday',
        lastPassiveValueAt: null,
        lastPassiveTriggerAt: fiveDaysAgo,
      })
    ).toBe('value');
  });

  it('no trigger, value never sent → value (30d gate)', () => {
    expect(
      decidePassiveKind({
        now: NOW,
        trigger: null,
        lastPassiveValueAt: null,
        lastPassiveTriggerAt: null,
      })
    ).toBe('value');
  });

  it('value sent within 30d → soft', () => {
    const tenDaysAgo = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      decidePassiveKind({
        now: NOW,
        trigger: null,
        lastPassiveValueAt: tenDaysAgo,
        lastPassiveTriggerAt: null,
      })
    ).toBe('soft');
  });
});

describe('isPassivePresenceEligible', () => {
  it('only churned is eligible', () => {
    expect(isPassivePresenceEligible('churned')).toBe(true);
    expect(isPassivePresenceEligible('dormant')).toBe(false);
    expect(isPassivePresenceEligible('active')).toBe(false);
    expect(isPassivePresenceEligible(null)).toBe(false);
  });
});

describe('buildPassiveBody', () => {
  it('value kind returns a non-empty tip', () => {
    const body = buildPassiveBody({ kind: 'value', trigger: null, now: NOW });
    expect(body.length).toBeGreaterThan(0);
    expect(body).toBe(pickPassiveValueTemplate(NOW));
  });

  it('trigger kind returns a non-empty trigger template', () => {
    const body = buildPassiveBody({ kind: 'trigger', trigger: 'month_start', now: NOW });
    expect(body.length).toBeGreaterThan(0);
  });

  it('soft kind returns a non-empty presence message', () => {
    const body = buildPassiveBody({ kind: 'soft', trigger: null, now: NOW });
    expect(body.length).toBeGreaterThan(0);
  });

  it('trigger kind without trigger value falls back to soft (non-empty)', () => {
    const body = buildPassiveBody({ kind: 'trigger', trigger: null, now: NOW });
    expect(body.length).toBeGreaterThan(0);
  });
});

describe('detectPassiveTrigger', () => {
  it('first of month → month_start', () => {
    const firstOfMonth = new Date('2026-07-01T09:00:00Z');
    expect(detectPassiveTrigger(firstOfMonth, 'UTC')).toBe('month_start');
  });

  it('a regular mid-week non-Monday day → null', () => {
    // 2026-06-10 is a Wednesday
    expect(detectPassiveTrigger(new Date('2026-06-10T09:00:00Z'), 'UTC')).toBeNull();
  });

  it('Monday → monday', () => {
    // 2026-06-08 is a Monday
    expect(detectPassiveTrigger(new Date('2026-06-08T09:00:00Z'), 'UTC')).toBe('monday');
  });
});
