import { describe, expect, it } from 'vitest';

import { applyDiscreteField } from '../lib/ai/onboarding-discrete-fields';
import { buildPrivacySafeProfileSummary } from '../lib/ai/onboarding-privacy-summary';
import {
  buildFieldFlags,
  buildLlmKnownContext,
  redactExtractedForClient,
} from '../lib/profile/extracted-field-flags';

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

describe('applyDiscreteField', () => {
  it('validates weight range', () => {
    const bad = applyDiscreteField({}, 'current_weight_kg', '12');
    expect(bad.ok).toBe(false);
    const ok = applyDiscreteField({}, 'current_weight_kg', '78.5');
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.extracted.current_weight_kg).toBe(78.5);
  });
});

describe('discrete-field privacy intro', () => {
  it('uses gendered imperative in warning', async () => {
    const { discreteFieldPrivacyIntro } = await import('../lib/ai/onboarding-discrete-fields');
    expect(discreteFieldPrivacyIntro('full_name', 'female')).toContain('אל תכתבי');
    expect(discreteFieldPrivacyIntro('full_name', 'male')).toContain('אל תכתוב');
  });
});

describe('after discrete continuation', () => {
  it('advances to main goal after name is saved', async () => {
    const { buildAfterDiscreteContinuation } = await import('../lib/ai/onboarding-chat-llm');
    const flags = {
      has_full_name: true,
      has_gender: false,
      has_main_goal: false,
      has_current_weight: false,
      has_goal_weight: false,
      has_weakest_time: false,
      has_main_obstacle: false,
      has_wake_time: false,
      has_sleep_time: false,
    };
    const cont = buildAfterDiscreteContinuation('full_name', flags, 'female');
    expect(cont.reply).toMatch(/ממשיכים בעדכון הפרופיל/);
    expect(cont.reply).toMatch(/מטרה/);
    expect(cont.request_discrete_field).toBeNull();
  });
});

describe('profile-chat-bootstrap', () => {
  it('builds flags from DB row without exposing sensitive values to public extracted', async () => {
    const { buildProfileChatBootstrap, describeKnownProfileForLlm } = await import(
      '../lib/profile/profile-chat-bootstrap'
    );
    const boot = buildProfileChatBootstrap({
      full_name: 'דני כהן',
      gender: 'male',
      main_goal: 'weight_loss',
      current_weight_kg: 88,
      goal_weight_kg: 75,
      wake_up_time: '07:00:00',
    });
    expect(boot.fieldFlags.has_full_name).toBe(true);
    expect(boot.fieldFlags.has_current_weight).toBe(true);
    expect(boot.extractedPublic.full_name).toBeUndefined();
    expect(boot.extractedPublic.current_weight_kg).toBeUndefined();
    expect(boot.extractedPublic.main_goal).toBe('weight_loss');
    const hint = describeKnownProfileForLlm(boot.fieldFlags, boot.extractedPublic);
    expect(hint).not.toContain('דני');
    expect(hint).not.toContain('88');
    expect(hint).toMatch(/שם שמור/);
  });

  it('asks intent clarification when onboarding is complete or basics are filled', async () => {
    const { shouldClarifyProfileUpdateIntent, buildFlagsFromProfileRow } = await import(
      '../lib/profile/profile-chat-bootstrap'
    );
    const empty = buildFlagsFromProfileRow(null);
    expect(shouldClarifyProfileUpdateIntent(empty, false)).toBe(false);
    expect(shouldClarifyProfileUpdateIntent(empty, true)).toBe(true);

    const complete = buildFlagsFromProfileRow({
      full_name: 'דנה',
      main_goal: 'weight_loss',
      main_obstacle: 'no_time',
    });
    expect(shouldClarifyProfileUpdateIntent(complete, false)).toBe(true);
  });

  it('normalizes relative avatar paths to cdn.nurawell.ai', async () => {
    const { normalizeStoredAvatarUrl } = await import('../lib/storage/user-avatar');
    const userId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const normalized = normalizeStoredAvatarUrl('/images/users/a1b2c3d4-e5f6-7890-abcd-ef1234567890/avatar.webp', userId, '1');
    expect(normalized).toMatch(/^https:\/\/cdn\.nurawell\.ai\/images\/users\//);
  });
});
