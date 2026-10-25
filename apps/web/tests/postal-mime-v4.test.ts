import PostalMime from 'postal-mime';
import { describe, expect, it } from 'vitest';

const raw = [
  'X-Forwarded-For: owner@example.com',
  'From: "Vendor" <billing@vendor.example>',
  'To: legal@nurawell.ai',
  'Subject: =?UTF-8?B?16fXkdec15Q=?= #123',
  'X-Forwarded-For: attacker@evil.example',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="b1"',
  '',
  '--b1',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Total: 49.00 USD',
  '--b1',
  'Content-Type: application/pdf; name="r.pdf"',
  'Content-Disposition: attachment; filename="r.pdf"',
  'Content-Transfer-Encoding: base64',
  '',
  'JVBERi0xLjQK',
  '--b1--',
  '',
].join('\r\n');

describe('postal-mime 4 receipt parsing', () => {
  it('parses the fields receipts rely on', async () => {
    const m = await PostalMime.parse(Buffer.from(raw));
    expect(m.from?.address).toBe('billing@vendor.example');
    expect(m.subject).toBe('קבלה #123');
    expect(m.text?.trim()).toBe('Total: 49.00 USD');
    expect(m.attachments).toHaveLength(1);
    expect(Buffer.from(m.attachments[0]!.content as ArrayBuffer).toString('latin1')).toBe('%PDF-1.4\n');
    const first = m.headers.find((h) => h.key.toLowerCase() === 'x-forwarded-for');
    expect(first?.value).toBe('owner@example.com');
  });
});
