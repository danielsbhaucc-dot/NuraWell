import { describe, expect, it, vi } from 'vitest';
import { CANT_DO_TEXT, CEO_SYSTEM_PROMPT, capabilityRegistry, guardCapability } from '@/lib/ceo/agent';
import { classifyRisk, fingerprint, forwardedLine, isMorningBatchTime } from '@/lib/ceo/dev-forward';

const db = { from: () => ({ insert: () => Promise.resolve({}) }) } as never;

describe('Gideon capability guard (promises need a successful tool)', () => {
  it('promise without action → honest reply + auto capability request to Or', async () => {
    const forward = vi.fn(async () => ({ id: 'r1', deduped: false, risk: 'low' as const }));
    const r = await guardCapability(db, 'תזכיר לי כל יום ב-9 לשתות מים', 'סבבה, אזכיר לך כל יום ב-9', [], { forward });
    expect(r.text).toBe(CANT_DO_TEXT);
    expect(forward).toHaveBeenCalledWith(db, expect.objectContaining({ title: expect.stringContaining('Capability request') }), expect.objectContaining({ kind: 'capability_request' }));
  });

  it('capable + success → reply kept', async () => {
    const forward = vi.fn();
    const r = await guardCapability(db, 'תשתיק את דנה', 'סגור, הכנתי לך טיוטה לאישור', ['pause_user_notifications'], { forward: forward as never });
    expect(r.text).toBe('סגור, הכנתי לך טיוטה לאישור');
    expect(forward).not.toHaveBeenCalled();
  });

  it('capable + tool failed (nothing succeeded) → no fake confirmation', async () => {
    const forward = vi.fn(async () => ({ id: 'r2', deduped: true, risk: 'low' as const }));
    const r = await guardCapability(db, 'תפרסם את השיעור', 'סגור, אטפל בזה', [], { forward });
    expect(r.text).not.toContain('סגור');
  });

  it('sensitive capability → one-tap approve/reject buttons', async () => {
    const forward = vi.fn(async () => ({ id: 'r3', deduped: false, risk: 'sensitive' as const }));
    const r = await guardCapability(db, 'תשלח לכל המשתמשים מייל', 'אין בעיה, אשלח לך אישור', [], { forward });
    expect(r.buttons?.[0].map((b) => b.data)).toEqual(['ceo:ca:r3', 'ceo:cr:r3']);
  });

  it('normal answers without a promise pass untouched', async () => {
    expect((await guardCapability(db, 'כמה משתמשים?', 'יש 12 משתמשים פעילים', [])).text).toBe('יש 12 משתמשים פעילים');
  });

  it('registry is machine-readable and includes forward + Or status', () => {
    const names = capabilityRegistry().map((c) => c.name);
    expect(names).toContain('forward_to_developer');
    expect(names).toContain('or_work_status');
  });
});

describe('Or profile & auto-consult', () => {
  it('system prompt knows Or', () => {
    expect(CEO_SYSTEM_PROMPT).toContain('אור הוא המתכנת');
    expect(CEO_SYSTEM_PROMPT).toContain('כל באג או בעיה טכנית עוברים אליו');
    expect(CEO_SYSTEM_PROMPT).toMatch(/02:00.*10:00.*16:00/);
    expect(CEO_SYSTEM_PROMPT).toContain('or_work_status');
    expect(CEO_SYSTEM_PROMPT).toContain('done');
  });
  it('risk tiers', () => {
    expect(classifyRisk('תשלח הודעה למשתמשים')).toBe('sensitive');
    expect(classifyRisk('תכין לי סיכום של השגיאות')).toBe('low');
  });
  it('dedupe fingerprint is order-insensitive', () => {
    expect(fingerprint('ניסוח לא טבעי של אלמוג')).toBe(fingerprint('אלמוג: ניסוח טבעי לא'));
  });
  it('morning batch window ~07:30–11:00 IL', () => {
    expect(isMorningBatchTime(new Date('2026-10-20T04:40:00Z'))).toBe(true); // 07:40 IL
    expect(isMorningBatchTime(new Date('2026-10-19T20:00:00Z'))).toBe(false); // 23:00 IL
  });
  it('summary line lists forwards', () => {
    expect(forwardedLine([{ title: 'באג בצ׳אט', kind: 'finding' }])).toContain('העברתי לאור (1)');
    expect(forwardedLine([])).toBe('');
  });
});
