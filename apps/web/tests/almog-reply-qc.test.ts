import { describe, expect, it } from 'vitest';
import {
  parseReplyQcVerdict,
  replyQcEnabled,
  replyQcSkipReason,
  validateReplyQcFix,
} from '../lib/ai/reply-quality/core';
import { REDACTED_CONTENT } from '../lib/privacy/health-chat-redaction';

const base = { lastUserText: 'היה לי יום עמוס', previousReplies: [], gender: 'male' as const, healthConsentOff: false };
const reply = 'נשמע שהיום היה עמוס באמת. מה הדבר הקטן שהכי עזר לך להחזיק מעמד היום?';

describe('reply QC verdict parsing', () => {
  it('accepts strict JSON and fenced JSON', () => {
    expect(parseReplyQcVerdict('{"ok":true}')).toEqual({ ok: true });
    expect(parseReplyQcVerdict('```json\n{"ok":false,"fixed":"x"}\n```')).toEqual({ ok: false, fixed: 'x' });
  });
  it('rejects anything else (fail-silent)', () => {
    expect(parseReplyQcVerdict('sure! ok')).toBeNull();
    expect(parseReplyQcVerdict('{"ok":false}')).toBeNull();
    expect(parseReplyQcVerdict('{"ok":"yes"}')).toBeNull();
  });
});

describe('reply QC skip rules', () => {
  it('skips redacted turns entirely', () => {
    expect(replyQcSkipReason({ ...base, lastUserText: REDACTED_CONTENT, reply })).toBe('redacted_turn');
  });
  it('never sends health-gated content when consent is off', () => {
    expect(replyQcSkipReason({ ...base, healthConsentOff: true, lastUserText: 'אני שוקל 90 קג', reply })).toBe('health_gate');
    expect(replyQcSkipReason({ ...base, healthConsentOff: false, lastUserText: 'אני שוקל 90 קג', reply })).toBeNull();
  });
  it('skips crisis and trivial replies', () => {
    expect(replyQcSkipReason({ ...base, reply, crisis: true })).toBe('crisis');
    expect(replyQcSkipReason({ ...base, reply: 'סבבה 🙂' })).toBe('too_short');
  });
});

describe('reply QC fix guardrails', () => {
  it('allows a small wording fix', () => {
    const fixed = reply.replace('לך', 'לך הכי');
    expect(validateReplyQcFix(reply, fixed, { healthConsentOff: false }).ok).toBe(true);
  });
  it('rejects unchanged, rewrites and big growth', () => {
    expect(validateReplyQcFix(reply, reply, { healthConsentOff: false })).toEqual({ ok: false, reason: 'unchanged' });
    expect(validateReplyQcFix(reply, 'משהו אחר לגמרי שאין בו שום קשר לתשובה המקורית בכלל ובכלל', { healthConsentOff: false }).ok).toBe(false);
    expect(validateReplyQcFix(reply, reply + ' ועוד משפט ארוך שנוסף פתאום בלי סיבה', { healthConsentOff: false })).toEqual({ ok: false, reason: 'length_change' });
  });
  it('rejects garbled output (NUL bytes / orphan letters)', () => {
    const o = 'אני מבין שאת עייפה. מה הכי היה מעייף היום? אולי כדאי שתנוחי קצת.';
    expect(validateReplyQcFix(o, 'אני מבין\u0000ה\u0000 שעייפה. מה הכי היה מעייף היום? אולי כדאי שתנוחי קצת.', { healthConsentOff: false })).toEqual({ ok: false, reason: 'garbled' });
  });
  it('rejects added numbers and changed tokens', () => {
    expect(validateReplyQcFix(reply, reply.replace('היום?', 'היום? 3'), { healthConsentOff: false })).toEqual({ ok: false, reason: 'adds_numbers' });
    const withTok = `[FIRST_NAME], ${reply}`;
    expect(validateReplyQcFix(withTok, reply, { healthConsentOff: false }).ok).toBe(false);
  });
  it('rejects edits that introduce health text when consent is off', () => {
    const fixed = reply.replace('להחזיק מעמד', 'לשמור על המשקל');
    expect(validateReplyQcFix(reply, fixed, { healthConsentOff: true })).toEqual({ ok: false, reason: 'adds_health' });
  });
});

describe('reply QC flag', () => {
  it('env kill-switch wins', () => {
    expect(replyQcEnabled({ ALMOG_REPLY_QC: 'off' })).toBe(false);
    expect(replyQcEnabled({ ALMOG_REPLY_QC: '1' })).toBe(true);
  });
});
