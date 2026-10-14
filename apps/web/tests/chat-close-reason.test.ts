import { describe, expect, it } from 'vitest';
import { closeReasonLabel, isFarewellMessage, normalizeCloseReason } from '../lib/ai/chat-sessions/close-reason';
import { autoCloseReason } from '../lib/ai/chat-sessions/auto-close-stale-sessions';

const now = Date.parse('2026-10-14T12:00:00Z');
const ago = (min: number) => new Date(now - min * 60_000).toISOString();

describe('close reasons', () => {
  it('labels', () => {
    expect(closeReasonLabel('auto_idle')).toBe('נסגרה אוטומטית אחרי שעה בלי פעילות');
    expect(closeReasonLabel('almog_ended')).toContain('אלמוג סגר');
    expect(closeReasonLabel(null)).toBe('השיחה נסגרה');
    expect(normalizeCloseReason('bogus')).toBeNull();
  });
  it('farewell detection', () => {
    expect(isFarewellMessage('תודה!')).toBe(true);
    expect(isFarewellMessage('לילה טוב 🙏')).toBe(true);
    expect(isFarewellMessage('תודה, אבל עוד שאלה על הארוחה')).toBe(false);
  });
  it('picks the right auto reason', () => {
    const base = { sessionUpdatedAt: ago(20), nowMs: now };
    expect(autoCloseReason({ ...base, lastTurnRole: 'assistant', lastTurnAt: ago(20), lastUserText: 'תודה' })).toBe('almog_ended');
    expect(autoCloseReason({ ...base, lastTurnRole: 'assistant', lastTurnAt: ago(20), lastUserText: 'מה עם מחר?' })).toBeNull();
    expect(autoCloseReason({ ...base, lastTurnRole: 'assistant', lastTurnAt: ago(5), lastUserText: 'תודה' })).toBeNull();
    expect(autoCloseReason({ sessionUpdatedAt: ago(61), nowMs: now, lastTurnRole: 'assistant', lastTurnAt: ago(61) })).toBe('auto_idle');
    expect(autoCloseReason({ sessionUpdatedAt: ago(61), nowMs: now, lastTurnRole: 'user', lastTurnAt: ago(61) })).toBeNull();
    expect(autoCloseReason({ sessionUpdatedAt: ago(1500), nowMs: now, lastTurnRole: 'user', lastTurnAt: ago(1500) })).toBe('auto_abandoned');
  });
});
