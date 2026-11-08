import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('signup is bound to the verified nonce', () => {
  it('does not share an in-memory result by email', () => {
    const action = readFileSync(new URL('../lib/actions/complete-onboarding.ts', import.meta.url), 'utf8');
    const form = readFileSync(new URL('../components/onboarding/OnboardingFormClient.tsx', import.meta.url), 'utf8');
    expect(action).not.toMatch(/beginSignupFlight|signupFlights/);
    expect(action.indexOf('beginSignupClaim')).toBeLessThan(action.indexOf('createUser'));
    expect(action.indexOf('finishSignupClaim')).toBeLessThan(action.indexOf('PARENT_SESSION_COOKIE, packed'));
    expect(action).toMatch(/abortSignupClaim/);
    expect(form).toMatch(/submitLock\.current \|\| pending/);
    const off = action.slice(action.indexOf('if (!parentVerified)'), action.indexOf('const signUpData'));
    expect(off).toMatch(/auth\.resend/);
    expect(off).not.toMatch(/beginSignupClaim|issueSessionForUser/);
  });
});
