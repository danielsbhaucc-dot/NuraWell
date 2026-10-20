import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { buildPreCheckItems } from '@/lib/legal/preexport-check';

const rec = { id: '11111111-1111-4111-8111-111111111111', created_at: '2026-10-01T10:00:00Z', record_hash: 'a'.repeat(64), screenshot_sha256: 'b'.repeat(64), screenshot_segments: null, payload_json: JSON.stringify({ client: { viewport_w: 390, viewport_h: 700 } }) };
const okCheck = { id: rec.id, chain: true, signature: true, snapshot: true, record_hash: true, tsa: { ok: true, gen_time: null }, ots: { calendars: 2 }, screenshot: { present: true, ok: true }, email_receipt: true, problems: [] };

describe('pre-export check', () => {
  it('flags critical items and offers fixes', () => {
    const items = buildPreCheckItems({ records: [rec], checks: [{ ...okCheck, tsa: { ok: false, gen_time: null }, screenshot: { present: true, ok: false } }], attestations: [], logsConfigured: { supabase: false, vercel: false }, now: new Date('2026-10-02T00:00:00Z') });
    const tsa = items.find((i) => i.key === 'tsa')!;
    expect(tsa.severity).toBe('critical');
    expect(tsa.fix).toBe('retry_tsa');
    expect(items.find((i) => i.key === 'shot_mismatch')?.severity).toBe('critical');
    expect(items.find((i) => i.key === 'request_id')?.severity).toBe('warn');
    expect(items.find((i) => i.key === 'provider_logs')).toBeTruthy();
    expect(items[0]!.severity).toBe('critical');
  });
  it('detects a viewport-cropped legacy capture', () => {
    const items = buildPreCheckItems({ records: [rec], checks: [okCheck], attestations: [], shotMeta: { [rec.id]: { w: 780, h: 1400 } }, logsConfigured: { supabase: true, vercel: true } });
    expect(items.some((i) => i.key === 'shot_cropped')).toBe(true);
    expect(items.some((i) => i.severity === 'critical')).toBe(false);
  });
});
