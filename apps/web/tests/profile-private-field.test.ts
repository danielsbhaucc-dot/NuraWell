import { describe, expect, it } from 'vitest';

import { applyDiscreteField } from '../lib/ai/onboarding-discrete-fields';
import { buildPrivacySafeProfileSummary } from '../lib/ai/onboarding-privacy-summary';
import {
  buildFieldFlags,
  buildLlmKnownContext,
  redactExtractedForClient,
} from '../lib/profile/extracted-field-flags';
import {
  decryptPrivateFieldValueForTest,
  encryptPrivateFieldValue,
} from '../lib/profile/private-field-crypto-client';

describe('extracted-field-flags', () => {
  it('builds flags without exposing values', () => {
    const flags = buildFieldFlags({
      full_name: 'דני',
      main_goal: 'weight_loss',
      current_weight_kg: 90,
    });
    expect(flags.has_full_name).toBe(true);
    expect(flags.has_main_goal).toBe(true);
    expect(flags.has_current_weight).toBe(true);
    const ctx = buildLlmKnownContext(
      { full_name: 'דני', main_goal: 'weight_loss', current_weight_kg: 90 },
      flags
    );
    expect(ctx).not.toHaveProperty('full_name', 'דני');
    expect(ctx).not.toHaveProperty('current_weight_kg');
    expect(ctx.has_full_name).toBe(true);
    expect(ctx.main_goal).toBe('weight_loss');
  });

  it('redacts sensitive keys from API payload', () => {
    const redacted = redactExtractedForClient({
      full_name: 'שרה',
      main_goal: 'both',
      goal_weight_kg: 65,
    });
    expect(redacted.full_name).toBeUndefined();
    expect(redacted.goal_weight_kg).toBeUndefined();
    expect(redacted.main_goal).toBe('both');
  });
});

describe('onboarding-privacy-summary', () => {
  it('never echoes PII in history summary', () => {
    const s = buildPrivacySafeProfileSummary(
      { full_name: 'יוסי כהן', current_weight_kg: 88, main_goal: 'weight_loss' },
      'male'
    );
    expect(s).not.toContain('יוסי');
    expect(s).not.toContain('88');
    expect(s).toMatch(/פרטיות/i);
  });
});

describe('private-field crypto', () => {
  it('roundtrips AES envelope with test key pair', async () => {
    const pair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey']
    );
    const publicJwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
    const privateJwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;

    const envelope = await encryptPrivateFieldValue('דני לוי', publicJwk);
    const plain = await decryptPrivateFieldValueForTest(envelope, privateJwk);
    expect(plain).toBe('דני לוי');
  });
});

describe('applyDiscreteField', () => {
  it('validates weight range', () => {
    const bad = applyDiscreteField({}, 'current_weight_kg', '12');
    expect(bad.ok).toBe(false);
    const ok = applyDiscreteField({}, 'current_weight_kg', '78.5');
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.extracted.current_weight_kg).toBe(78.5);
  });
});
