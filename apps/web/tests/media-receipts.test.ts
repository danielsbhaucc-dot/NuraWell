import { describe, expect, it } from 'vitest';
import { addMonths, coverageFor, detectVendor, forwarderAllowed, gmailConfirmationCode, extractGmailConfirmation, decodeQuotedPrintable, isGmailForwardingConfirmation, normalizeForwarder, parseAmount, parsePeriod, parsePlan } from '@/lib/legal/media/receipts-core';
import { maskReceiptText } from '@/lib/legal/media/receipts';

describe('receipt rules', () => {
  it('vendor from body beats billing sender', () => {
    expect(detectVendor('no_reply@email.apple.com', 'Your receipt from Apple', 'SuperGrok monthly')).toBe('xai');
    expect(detectVendor('invoice+statements@stripe.com', 'Receipt', 'Suno Pro Plan')).toBe('suno');
    expect(detectVendor('payments-noreply@google.com', 'Google One', 'Google AI Pro')).toBe('google');
    expect(detectVendor('no_reply@email.apple.com', 'receipt', 'Some game')).toBe('apple');
  });
  it('amount, plan, period', () => {
    expect(parseAmount('Item\nTotal: $10.00\n')).toEqual({ amount: 10, currency: 'USD' });
    expect(parseAmount('סה"כ 39.90 ₪')).toEqual({ amount: 39.9, currency: 'ILS' });
    expect(parsePlan('suno', 'Suno Pro Plan monthly')).toMatch(/Pro Plan/i);
    expect(parsePeriod('Oct 1, 2026 – Nov 1, 2026', null)).toEqual({ start: '2026-10-01', end: '2026-11-01' });
    expect(parsePeriod('annual plan', '2026-01-31').end).toBe('2027-01-31');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
  it('forwarder allowlist incl. Gmail +caf_ envelope', () => {
    expect(normalizeForwarder('Dan.Iel+caf_=receipts=nurawell.ai@gmail.com')).toBe('daniel@gmail.com');
    expect(forwarderAllowed('daniel+caf_=receipts=nurawell.ai@gmail.com', {}, ['daniel@gmail.com'])).toBe(true);
    expect(forwarderAllowed('attacker@evil.com', { from: 'billing@suno.com' }, ['daniel@gmail.com'])).toBe(false);
    expect(forwarderAllowed('x@y.com', {}, [])).toBe(false);
  });
  it('gmail confirmation', () => {
    expect(isGmailForwardingConfirmation('forwarding-noreply@google.com', '(#123) Gmail Forwarding Confirmation')).toBe(true);
    expect(gmailConfirmationCode('Confirmation code: 123456789')).toBe('123456789');
    expect(gmailConfirmationCode('', '(#987654321) Gmail Forwarding Confirmation')).toBe('987654321');
    expect(gmailConfirmationCode('קוד האישור: 555666777')).toBe('555666777');
    expect(gmailConfirmationCode('קוד אישור - 111222333')).toBe('111222333');
    expect(decodeQuotedPrintable('=D7=A7=D7=95=D7=93 a=\r\nb')).toBe('קוד ab');
    const raw = 'Subject: (#246813579) Gmail Forwarding Confirmation\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nhttps://mail-settings.google.com/mail/vf-%5BANGjdJ=\r\n_abc%5D-xyz\r\n';
    expect(extractGmailConfirmation({ raw })).toEqual({ code: '246813579', link: 'https://mail-settings.google.com/mail/vf-%5BANGjdJ_abc%5D-xyz' });
    expect(extractGmailConfirmation({ html: '<a href="https://mail.google.com/mail/vf-%5Bx%5D?a=1&amp;b=2">x</a>' }).link).toBe('https://mail.google.com/mail/vf-%5Bx%5D?a=1&b=2');
  });
  it('coverage by generator + date', () => {
    const r = [{ id: '1', vendor: 'suno' as const, plan: 'Pro', period_start: '2026-10-01', period_end: '2026-11-01', trust: 'verified' }];
    expect(coverageFor('suno', '2026-10-15', r)?.id).toBe('1');
    expect(coverageFor('suno', '2026-12-01', r)).toBeNull();
    expect(coverageFor('grok', '2026-10-15', r)).toBeNull();
  });
  it('AI fallback text is masked', () => {
    const m = maskReceiptText('Receipt', 'Bill to daniel@gmail.com\nCard ending in 4242\nOrder 98765432\nTotal 10.00 USD\nHome address line');
    expect(m).not.toMatch(/daniel@|4242|98765432|address/);
    expect(m).toContain('10.00');
  });
});
