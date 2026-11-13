import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { vatIncluded } from '@/lib/admin/fx-core';
import { parseAmount, parsePlan, parseVat } from '@/lib/legal/media/receipts-core';

const dir = path.join(__dirname, 'fixtures/receipts');
const load = (name: string) => readFileSync(path.join(dir, name), 'utf8');

/** Stated VAT (including 0) is stored; 18/118 is only used when the receipt is silent. */
function resolveVatIls(statedVat: number | null, amountIls: number | null): number | null {
  if (statedVat != null) return statedVat;
  if (amountIls) return vatIncluded(amountIls);
  return null;
}

describe('Google Play VAT + plan (real-shape fixtures)', () => {
  it('reads an explicit VAT of 0 on Google AI Plus and names the Plus plan', () => {
    const text = load('google-ai-plus-play.txt');
    expect(parseAmount(text)).toEqual({ amount: 39, currency: 'ILS' });
    expect(parseVat(text)).toBe(0);
    expect(parsePlan('google', text)).toMatch(/^Google AI Plus/i);
    expect(resolveVatIls(parseVat(text), 39)).toBe(0);
    expect(resolveVatIls(null, 39)).toBe(5.95); // fallback only when VAT is unstated
  });

  it('reads VAT 0 from the HTML part (entities + bidi marks)', () => {
    const html = load('google-ai-plus-play.html');
    expect(parseAmount(html)).toEqual({ amount: 39, currency: 'ILS' });
    expect(parseVat(html)).toBe(0);
    expect(parsePlan('google', html)).toMatch(/^Google AI Plus/i);
  });

  it('reads VAT 0 on a ChatGPT Plus Google Play receipt (same wording as live mail)', () => {
    const text = load('chatgpt-plus-play.txt');
    expect(parseAmount(text)).toEqual({ amount: 73, currency: 'ILS' });
    expect(parseVat(text)).toBe(0);
    expect(parsePlan('openai', text)).toMatch(/^ChatGPT Plus/i);
    expect(resolveVatIls(parseVat(text), 73)).toBe(0);
    expect(resolveVatIls(null, 73)).toBe(11.14);
  });

  it('reads VAT 0 on an X Subscription Google Play receipt and does not take the later price', () => {
    const text = load('x-subscription-play.txt');
    expect(parseAmount(text)).toEqual({ amount: 395, currency: 'ILS' });
    expect(parseVat(text)).toBe(0);
    expect(parsePlan('google', text)).toBeNull();
    expect(resolveVatIls(parseVat(text), 395)).toBe(0);
    expect(resolveVatIls(null, 395)).toBe(60.25);
  });

  it('still parses a stated non-zero VAT and stays silent when no VAT line exists', () => {
    expect(parseVat('Subtotal $10.00\nVAT $1.80\nTotal $11.80')).toBe(1.8);
    expect(parseVat('סה"כ: 39.00 ₪/חודש\nGoogle AI Plus (2 TB)')).toBeNull();
    expect(parsePlan('google', 'Google AI Pro monthly')).toMatch(/^Google AI Pro/i);
    expect(parsePlan('google', 'Google AI Plus monthly')).toMatch(/^Google AI Plus/i);
  });
});
