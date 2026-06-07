import { describe, expect, it } from 'vitest';

import { createPiiShield, PII_PLACEHOLDERS, modelRequiresPiiShield } from '../lib/ai/privacy/pii-shield';

describe('pii-shield', () => {
  it('replaces first name and full name with a natural Hebrew pseudonym', () => {
    const shield = createPiiShield({ full_name: 'שרון כהן', phone: '050-1234567' });
    const pseudonym = shield.firstNamePlaceholder;
    const out = shield.tokenizeText('שלום שרון, איך הולך? שרון כהן מדברת.');
    expect(pseudonym).toBeTruthy();
    expect(pseudonym).not.toBe('שרון');
    // הפסיאודונים הוא שם עברי טבעי — לא טוקן ברקטים לטיני.
    expect(pseudonym).not.toMatch(/\[\[/);
    expect(out).toContain(pseudonym!);
    expect(out).not.toContain('שרון');
    expect(out).not.toContain('שרון כהן');
  });

  it('detokenizes model output (pseudonym) back to the real name for the client', () => {
    const shield = createPiiShield({ full_name: 'דני לוי' });
    const pseudonym = shield.firstNamePlaceholder!;
    const modelReply = `היי ${pseudonym}, מה שלומך?`;
    expect(shield.detokenizeText(modelReply)).toBe('היי דני, מה שלומך?');
  });

  it('handles a pseudonym split across stream chunks', () => {
    const shield = createPiiShield({ full_name: 'מיה רוז' });
    const pseudonym = shield.firstNamePlaceholder!;
    const detok = shield.createStreamDetokenizer();
    const mid = Math.max(1, Math.floor(pseudonym.length / 2));
    const part1 = detok.push(`שלום ${pseudonym.slice(0, mid)}`);
    const part2 = detok.push(`${pseudonym.slice(mid)}!`);
    const tail = detok.flush();
    expect(part1 + part2 + tail).toBe('שלום מיה!');
  });

  it('detokenizes bracket placeholders even with internal whitespace from small models', () => {
    const shield = createPiiShield({ phone: '050-1234567' });
    expect(shield.detokenizeText('חייג [[ USER_PHONE ]] עכשיו')).toBe('חייג 050-1234567 עכשיו');
  });

  it('does not stall the stream when [[ appears without a closing ]]', () => {
    const shield = createPiiShield({ full_name: 'מיה רוז' });
    const detok = shield.createStreamDetokenizer();
    const longTail = '[[ not a real placeholder, just markdown-ish text that keeps going and going';
    const out = detok.push(longTail) + detok.flush();
    expect(out).toBe(longTail);
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
