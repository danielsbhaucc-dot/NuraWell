import { describe, expect, it } from 'vitest';
import { parseAmount, receiptTextFromFile, normalizeReceiptText } from '@/lib/legal/media/receipts-core';

describe('receipt amount parsing (Google Play / OpenAI formats)', () => {
  it('handles bidi marks around Hebrew prices in HTML', () => {
    const html = '<span dir=right>סה&quot;כ</span>: <span>\r\n\u200f74.90 \u200f₪/חודש </span>';
    expect(parseAmount(html)).toEqual({ amount: 74.9, currency: 'ILS' });
  });
  it('rejoins a number wrapped before its currency', () => {
    expect(parseAmount('המינוי ממשיך בעלות של 74.90\n₪/חודש.')).toEqual({ amount: 74.9, currency: 'ILS' });
  });
  it('prefers the total line over the item price', () => {
    expect(parseAmount('בסכום של 91.90 ₪ למשך 3 חודשים, ולאחר מכן 99.90 ₪/חודש\nSuperGrok 91.90 ₪\nסה"כ: 91.90 ₪')).toEqual({ amount: 91.9, currency: 'ILS' });
  });
  it('reads trial receipts as 0 and refunds', () => {
    expect(parseAmount('Google AI Pro 0.00 ₪\nסה"כ: 0.00 ₪')).toEqual({ amount: 0, currency: 'ILS' });
    expect(parseAmount('ננפיק לך החזר כספי בסכום של 67.07 ₪ על 200 GB')).toEqual({ amount: 67.07, currency: 'ILS' });
  });
  it('does not treat a future price notice as a charge', () => {
    expect(parseAmount('התשלום הבא 99.90\u00a0₪/חודש')).toEqual({ amount: null, currency: null });
    expect(parseAmount('שהחיוב הראשון על סך 73.00 ₪/חודש יבוצע רק ב-11 באוג׳')).toEqual({ amount: null, currency: null });
  });
  it('extracts text from a Gmail connector json export', () => {
    const j = JSON.stringify({ plaintextBody: 'ChatGPT Plus 73.00 ₪/חודש\nסה"כ: 73.00 ₪/חודש' });
    const t = receiptTextFromFile('2026-01-12_x.json', new TextEncoder().encode(j));
    expect(parseAmount(t!)).toEqual({ amount: 73, currency: 'ILS' });
    expect(receiptTextFromFile('a.pdf', new Uint8Array([1]))).toBeNull();
  });
  it('normalizes nbsp/entities', () => { expect(normalizeReceiptText('a&nbsp;b\u00a0c')).toBe('a b c'); });
});
