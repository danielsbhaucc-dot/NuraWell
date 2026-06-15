import { describe, expect, it } from 'vitest';

import {
  assertNoCrisisSignals,
  buildCrisisEscalationResponse,
  detectCrisis,
  detectCrisisSignals,
} from '../lib/safety/crisis-detector';
import { CRISIS_ESCALATION_MESSAGE } from '../lib/safety/crisis-resources';

describe('crisis-detector', () => {
  it('detects suicidal ideation in Hebrew', () => {
    const result = detectCrisisSignals('אין לי סיבה לחיות יותר');

    expect(result.redFlag).toBe(true);
    expect(result.category).toBe('suicidal_ideation');
    expect(result.escalationMessage).toBe(CRISIS_ESCALATION_MESSAGE);
    expect(result.resources?.eran.phone).toBe('1201');
  });

  it('detects self harm language', () => {
    const result = detectCrisisSignals('אני מפחדת שאחתוך את עצמי הלילה');

    expect(result.redFlag).toBe(true);
    expect(result.category).toBe('self_harm');
  });

  it('detects severe eating-disorder red flags', () => {
    const result = detectCrisisSignals('אני מקיאה אחרי אוכל כדי לא להשמין');

    expect(result.redFlag).toBe(true);
    expect(result.category).toBe('eating_disorder');
  });

  it('marks severe distress as caution without escalation resources', () => {
    const result = detectCrisisSignals('אני קורס היום והכל גדול עליי');

    expect(result.redFlag).toBe(false);
    expect(result.severity).toBe('caution');
    expect(result.category).toBe('severe_distress');
    expect(result.resources).toBeNull();
  });

  it('does not flag common non-crisis diet frustration', () => {
    const result = detectCrisisSignals('בא לי שוקולד ואני מת מעייפות');

    expect(result.redFlag).toBe(false);
    expect(result.severity).toBe('none');
  });

  it('assertNoCrisisSignals throws only on red flags', () => {
    expect(() => assertNoCrisisSignals('אני נשברת היום')).not.toThrow();
    expect(() => assertNoCrisisSignals('אני רוצה להתאבד')).toThrow(/Crisis red flag/);
  });

  it('keeps detectCrisis compatibility shape', () => {
    const result = detectCrisis('אני הולכת להקיא כדי לפצות על מה שאכלתי');

    expect(result.hasRedFlag).toBe(true);
    expect(result.category).toBe('eating_disorder_red_flag');
    expect(result.severity).toBe('red_flag');
    expect(result.escalationMessage).toContain('1201');
  });

  it('marks obsessive body-food language as caution in detectCrisis', () => {
    const result = detectCrisis('אני סופרת כל קלוריה ומפחדת לאכול');

    expect(result.hasRedFlag).toBe(false);
    expect(result.category).toBe('eating_disorder_red_flag');
    expect(result.severity).toBe('caution');
  });

  it('uses deterministic crisis resources', () => {
    const message = buildCrisisEscalationResponse();

    expect(message).toContain('ערן');
    expect(message).toContain('1201');
    expect(message).toContain('101');
    expect(message).toContain('100');
  });
});
