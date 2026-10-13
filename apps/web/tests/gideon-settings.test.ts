import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptSecret, digestRecipients, encryptSecret, GideonSettingsInput, maskSecret } from '@/lib/ceo/settings';
import { nextDigestAt } from '@/lib/ceo/digest';

describe('gideon settings secrets', () => {
  const k = randomBytes(32);
  it('round-trips and never stores plaintext', () => {
    const tok = '123456789:AAH-abcdefghijklmnopqrstuvwxyz012345';
    const enc = encryptSecret(tok, k);
    expect(enc).not.toContain('abcdefghij');
    expect(enc.startsWith('v1:')).toBe(true);
    expect(decryptSecret(enc, k)).toBe(tok);
    expect(encryptSecret(tok, k)).not.toBe(enc); // random IV
  });
  it('rejects tampering and wrong key', () => {
    const enc = encryptSecret('secret-value-1234', k);
    const parts = enc.split(':');
    parts[3] = Buffer.from('x' + Buffer.from(parts[3], 'base64').toString()).toString('base64');
    expect(() => decryptSecret(parts.join(':'), k)).toThrow();
    expect(() => decryptSecret(enc, randomBytes(32))).toThrow();
  });
  it('masks to last 4', () => {
    expect(maskSecret('123456789:AAHabcd')).toBe('••••abcd');
    expect(maskSecret(null)).toBeNull();
  });
});

describe('gideon settings validation', () => {
  const base = {
    cost_ratio_threshold: 2.5, cost_min_delta_usd: 0.25, cost_per_user_min_delta_usd: 0.02, cost_max_single_user_share: 0.6,
    digest_enabled: true, digest_hour: 9, alert_topics: { daily: true, weekly: true, monthly: false, cost: true, owner_tasks: true },
    recipients: [{ chat_id: '-100123456', label: 'קבוצה' }],
  };
  it('accepts valid input, secrets optional', () => expect(GideonSettingsInput.safeParse(base).success).toBe(true));
  it('rejects malformed token / chat id / hour', () => {
    expect(GideonSettingsInput.safeParse({ ...base, telegram_bot_token: 'nope' }).success).toBe(false);
    expect(GideonSettingsInput.safeParse({ ...base, recipients: [{ chat_id: 'abc', label: '' }] }).success).toBe(false);
    expect(GideonSettingsInput.safeParse({ ...base, digest_hour: 24 }).success).toBe(false);
  });
  it('empty string clears a token', () => expect(GideonSettingsInput.safeParse({ ...base, telegram_bot_token: '' }).success).toBe(true));
  it('recipients = env ∪ admin, deduped', () => {
    expect(digestRecipients({ recipients: [{ chat_id: '1', label: '' }, { chat_id: '2', label: '' }] }, ['1', '3']).sort()).toEqual(['1', '2', '3']);
  });
});

describe('digest hour', () => {
  it('next 09:00 IL after 21:00 IL is next morning', () => {
    const now = new Date('2026-10-13T18:00:30Z'); // 21:00 IL (UTC+3)
    expect(new Date(nextDigestAt(9, now) * 1000).toISOString()).toBe('2026-10-14T06:00:00.000Z');
  });
  it('same hour → 24h later, never now', () => {
    const now = new Date('2026-10-13T18:00:30Z');
    expect(new Date(nextDigestAt(21, now) * 1000).toISOString()).toBe('2026-10-14T18:00:00.000Z');
  });
});
