import { describe, expect, it } from 'vitest';
import {
  looksLikeBracketOnlyReply,
  looksLikeLeakedThinking,
  preferSanitizedWriterOutput,
  sanitizeWriterOutput,
  shouldHoldStreamForThinking,
} from '../lib/ai/sanitize-writer-output';

describe('sanitizeWriterOutput — leaked thinking', () => {
  it('strips English chain-of-thought and keeps the Hebrew reply', () => {
    const raw =
      'The user claimed 1, 2, 3. Maybe I should respond with empathy, or be more direct. I\'ll go with sitting with them.\n\nלבד ביום כזה זה מכה. אני פה.';
    expect(sanitizeWriterOutput(raw)).toBe('לבד ביום כזה זה מכה. אני פה.');
  });

  it('strips English chain-of-thought even in the same paragraph as the Hebrew reply', () => {
    const raw =
      "The user claimed 1, 2, 3. Maybe I should respond this way, or that way. I'll go with sitting with them. לבד ביום כזה זה מכה. אני פה.";
    expect(sanitizeWriterOutput(raw)).toBe('לבד ביום כזה זה מכה. אני פה.');
  });

  it('strips <think> blocks', () => {
    const raw = '<think>The user is asking for help. I should be warm.</think>\nאוף. יום כזה שיושב על החזה.';
    expect(sanitizeWriterOutput(raw)).toBe('אוף. יום כזה שיושב על החזה.');
  });

  it('does not strip a real Hebrew message with a mixed English word', () => {
    const raw = 'סבבה, נשמור על snack אחד בערב ולא על כל השקית.';
    expect(sanitizeWriterOutput(raw)).toBe(raw);
    expect(looksLikeLeakedThinking(raw)).toBe(false);
  });

  it('keeps existing placeholder stripping', () => {
    const raw = '[The user wants empathy]\nאני איתך בזה, בלי שיפוט.';
    expect(sanitizeWriterOutput(raw)).toBe('אני איתך בזה, בלי שיפוט.');
  });
});

describe('looksLikeLeakedThinking', () => {
  it('flags a full English planning dump', () => {
    const raw =
      'The user claimed they failed today. Maybe I should respond with a hug, or challenge the all-or-nothing. I\'ll go with a short empathic sentence.';
    expect(looksLikeLeakedThinking(raw)).toBe(true);
    expect(shouldHoldStreamForThinking(raw)).toBe(true);
    expect(preferSanitizedWriterOutput(raw)).toBe('');
  });

  it('does not flag a recovered Hebrew reply after stripping CoT', () => {
    const raw =
      'The user said it was a hard day. Maybe I should sit with them.\n\nיום שיושב על החזה. מה לחץ עליך שם?';
    expect(looksLikeLeakedThinking(raw)).toBe(false);
    expect(shouldHoldStreamForThinking(raw)).toBe(false);
  });

  it('holds the stream while an unclosed think tag is still open', () => {
    expect(shouldHoldStreamForThinking('<think>The user wants')).toBe(true);
  });

  it('holds a short English prefix so CoT never starts streaming', () => {
    expect(shouldHoldStreamForThinking('The user')).toBe(true);
    expect(shouldHoldStreamForThinking('אוף יום')).toBe(false);
  });

  it('still detects bracket-only replies', () => {
    expect(looksLikeBracketOnlyReply('[[USER_FIRST_NAME]]')).toBe(true);
  });
});
