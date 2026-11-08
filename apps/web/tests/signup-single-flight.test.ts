import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { beginSignupFlight } from '@/lib/actions/signup-flight';

describe('one signup save', () => {
  it('runs the overlapping save once', async () => {
    let calls = 0;
    const first = beginSignupFlight('a@x.co', async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return 'created';
    });
    const second = beginSignupFlight('a@x.co', async () => {
      calls += 1;
      return 'again';
    });
    expect(await Promise.all([first, second])).toEqual(['created', 'created']);
    expect(calls).toBe(1);
    const third = beginSignupFlight('a@x.co', async () => 'later');
    expect(await third).toBe('later');
    expect(calls).toBe(1);
  });

  it('keeps the button and the action from starting a second save', () => {
    const form = readFileSync(new URL('../components/onboarding/OnboardingFormClient.tsx', import.meta.url), 'utf8');
    const action = readFileSync(new URL('../lib/actions/complete-onboarding.ts', import.meta.url), 'utf8');
    expect(form).toMatch(/submitLock\.current \|\| pending/);
    expect(form.indexOf('submitLock.current = true')).toBeLessThan(form.indexOf('await completeOnboarding'));
    expect(action.indexOf('return beginSignupFlight')).toBeLessThan(action.indexOf('createUser'));
    expect(action).toMatch(/issueSessionForUser\(admin, userId\)/);
    expect(action.match(/issueSessionForUser\(admin, userId\)/g)).toHaveLength(1);
    expect(action.match(/recordParentSessionGrant\(/g)).toHaveLength(1);
  });
});
