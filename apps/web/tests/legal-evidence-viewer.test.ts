import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildEvidenceViewer, type ViewerRecord } from '@/lib/legal/evidence-viewer';

const sha = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex');

describe('offline evidence viewer', () => {
  it('embeds data, keys and verification script; escapes markup', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const img = existsSync(process.env.VIEWER_SAMPLE_IMG ?? '') ? new Uint8Array(readFileSync(process.env.VIEWER_SAMPLE_IMG!)) : new Uint8Array([1, 2, 3]);
    let prev = 'GENESIS';
    const records: ViewerRecord[] = [1, 2].map((n) => {
      const payload = JSON.stringify({ n, prev_hash: prev, action: n === 1 ? 'grant' : 'withdraw', screenshot_sha256: sha(img), note: '<script>x</script>' });
      const h = sha(payload);
      const r: ViewerRecord = { n, title: n === 1 ? 'מתן הסכמה' : 'ביטול הסכמה', at: new Date(Date.UTC(2026, 9, 20, 9 + n)).toISOString(), tone: n === 1 ? 'good' : 'bad', reference: `NW-20261020-${h.slice(0, 8).toUpperCase()}`,
        payload_json: payload, record_hash: h, prev_hash: prev, signature: sign(null, Buffer.from(h), privateKey).toString('base64'), key_id: 'k1',
        images: [{ name: 'screenshot.webp', mime: 'image/webp', bytes: img, expected_sha256: sha(img), caption: 'צילום החלון ברגע האישור' }],
        fields: [['מילה שהוקלדה', n === 1 ? '"מאשרים"' : '"מבטלים"'], ['פס זיהוי בצילום', 'משתמש 1a2b3c4d · da***@gmail.com · 20.10.2026, 12:00:00 (שעון ישראל) · iOS 18.1 · Safari']],
        server_checks: [{ label: 'חותמת זמן', ok: true }, { label: 'עיגון ציבורי', ok: true }], text_lines: ['אני מסכים לעיבוד מידע בריאותי'] };
      prev = h; return r;
    });
    const html = await buildEvidenceViewer({ kind: 'consent', case_ref: 'NW-CASE-20261020-ABC123', generated_at: '2026-10-20T18:00:00Z', generated_by: 'דניאל רחמן (מנהל המערכת)', title: 'תיק הסכמה · נועה כהן',
      subject: [['שם', 'נועה כהן'], ['דוא"ל', 'noa@example.com'], ['מזהה משתמש', '1a2b3c4d-0000'], ['בדיקת שלמות בשרת', 'תקין']], overall_ok: true, keys: [{ key_id: 'k1', pem, status: 'current' }], records });
    expect(html).toContain("crypto.subtle.verify");
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain("default-src 'none'");
    if (process.env.VIEWER_OUT) { mkdirSync(process.env.VIEWER_OUT, { recursive: true }); writeFileSync(`${process.env.VIEWER_OUT}/sample-viewer.html`, html);
      const bad = html.replace(/"action\\\\":\\\\"withdraw/, '"action\\\\":\\\\"grant'); writeFileSync(`${process.env.VIEWER_OUT}/sample-viewer-tampered.html`, bad); }
  });
});
