import { describe, expect, it } from 'vitest';

import { createPiiShield, PII_PLACEHOLDERS, modelRequiresPiiShield } from '../lib/ai/privacy/pii-shield';

describe('pii-shield', () => {
  it('tokenizes first name and full name from profile', () => {
    const shield = createPiiShield({ full_name: 'שרון כהן', phone: '050-1234567' });
    const out = shield.tokenizeText('שלום שרון, איך הולך? שרון כהן מדברת.');
    expect(out).toContain(PII_PLACEHOLDERS.USER_FIRST_NAME);
    expect(out).toContain(PII_PLACEHOLDERS.USER_FULL_NAME);
    expect(out).not.toContain('שרון');
    expect(out).not.toContain('שרון כהן');
  });

  it('detokenizes model output back to real name for client', () => {
    const shield = createPiiShield({ full_name: 'דני לוי' });
    const modelReply = `היי ${PII_PLACEHOLDERS.USER_FIRST_NAME}, מה שלומך?`;
    expect(shield.detokenizeText(modelReply)).toBe('היי דני, מה שלומך?');
  });

  it('handles placeholder split across stream chunks', () => {
    const shield = createPiiShield({ full_name: 'מיה רוז' });
    const detok = shield.createStreamDetokenizer();
    const part1 = detok.push(`שלום ${PII_PLACEHOLDERS.USER_FIRST_NAME.slice(0, 8)}`);
    const part2 = detok.push(`${PII_PLACEHOLDERS.USER_FIRST_NAME.slice(8)}!`);
    const tail = detok.flush();
    expect(part1 + part2 + tail).toBe('שלום מיה!');
  });

  it('tokenizes email and phone in user message', () => {
    const shield = createPiiShield({ full_name: 'אבי' });
    const out = shield.tokenizeText('תתקשר אליי 050-9876543 או test@example.com');
    expect(out).toContain(PII_PLACEHOLDERS.USER_PHONE);
    expect(out).toContain(PII_PLACEHOLDERS.USER_EMAIL);
    expect(out).not.toContain('test@example.com');
  });

  it('assertNoRawPii blocks outbound payload with raw name', () => {
    const shield = createPiiShield({ full_name: 'נועה גולן' });
    const safe = shield.tokenizeText('שלום נועה');
    expect(() => shield.assertNoRawPii(safe)).not.toThrow();
    expect(() => shield.assertNoRawPii('שלום נועה')).toThrow(/PII shield/);
  });

  it('modelRequiresPiiShield detects qwen models', () => {
    expect(modelRequiresPiiShield('qwen/qwen3.7-plus')).toBe(true);
    expect(modelRequiresPiiShield('meta-llama/llama-4-scout')).toBe(false);
  });
});
