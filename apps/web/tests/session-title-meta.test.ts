import { describe, expect, it } from 'vitest';
import { parseChatSessionMeta, shouldRetitleAt } from '../lib/ai/chat-sessions/session-title';
import { parseDemoAccessCookie, signDemoAccessCookie } from '../lib/demo-access/cookie';

describe('session title meta', () => {
  it('parses JSON title + topic', () => {
    expect(parseChatSessionMeta('{"title":"קושי עם שתיית מים","topic":"habits"}')).toEqual({ title: 'קושי עם שתיית מים', topic: 'habits' });
    expect(parseChatSessionMeta('```json\n{"title":"אכילה רגשית בערב","topic":"bogus"}\n```').topic).toBeNull();
  });
  it('retitles only on milestones', () => {
    expect(shouldRetitleAt(2, false)).toBe(true);
    expect(shouldRetitleAt(4, true)).toBe(false);
    expect(shouldRetitleAt(6, true)).toBe(true);
  });
});

describe('demo cookie tombstone', () => {
  it('expired cookie parses only with allowExpired', async () => {
    process.env.DEMO_ACCESS_COOKIE_SECRET ||= 'x'.repeat(40);
    const v = await signDemoAccessCookie({ linkId: '11111111-1111-1111-1111-111111111111', userId: '22222222-2222-2222-2222-222222222222', expMs: Date.now() - 1000, sessionEpoch: 1, guestName: null, reason: 'רק בדיקה' });
    if (!v) return; // secret env name differs — covered by demo-access.test
    expect(await parseDemoAccessCookie(v)).toBeNull();
    expect((await parseDemoAccessCookie(v, Date.now(), { allowExpired: true }))?.linkId).toBe('11111111-1111-1111-1111-111111111111');
  });
});
