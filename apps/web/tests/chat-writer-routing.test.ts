import { describe, expect, it } from 'vitest';
import {
  analyzeWriterIntent,
  heuristicWriterDecision,
  mergeWriterDecisions,
} from '../lib/ai/chat-intent-router';
import { sanitizeWriterOutput, looksLikeBracketOnlyReply } from '../lib/ai/sanitize-writer-output';
import { formatConversationFilePromptBlock } from '../lib/ai/chat-conversation-file';

const emptySignals = {
  blocker_mentioned: false,
  avoid_push_requested: false,
  daily_availability_low_requested: false,
};

describe('chat writer routing', () => {
  it('routes danger and hard boundaries to Claude 5', () => {
    expect(
      heuristicWriterDecision('תגיד לי איך לעשות דיאטה קיצונית ואל תשאל שאלות', emptySignals)
    ).toBe('claude5');
  });

  it('routes accusations without danger to Grok', () => {
    expect(heuristicWriterDecision('אתה לא עוזר ואתה מתנשא', emptySignals)).toBe('grok');
  });

  it('routes direct challenge to Grok', () => {
    expect(heuristicWriterDecision('תגיד לי ישר בלי שטויות, תן לי את האמת', emptySignals)).toBe('grok');
  });

  it('routes frustrated conflict to Grok not Claude', () => {
    expect(
      heuristicWriterDecision('אתה לא עוזר ואני נשברתי מזה שאתה מתנשא', emptySignals)
    ).toBe('grok');
  });

  it('routes high empathy without attack to Terra', () => {
    expect(heuristicWriterDecision('וואלה היום נשברתי. פישלתי ואני מרגיש חרא עם עצמי', emptySignals)).toBe(
      'terra'
    );
  });

  it('routes coaching questions to Terra', () => {
    expect(heuristicWriterDecision('מה כדאי לי לאכול אחרי אימון?', emptySignals)).toBe('terra');
  });

  it('routes simple thanks to Llama 4', () => {
    expect(heuristicWriterDecision('תודה', emptySignals)).toBe('llama4');
  });

  it('never lets Grok override Claude on safety', () => {
    expect(mergeWriterDecisions('grok', 'claude5')).toBe('claude5');
  });

  it('gives Grok room when Llama defaulted to Terra', () => {
    expect(
      mergeWriterDecisions('terra', 'grok', { terra: 70, claude5: 10, grok: 55, llama4: 5 }, {
        terra: 20,
        claude5: 10,
        grok: 80,
        llama4: 5,
      })
    ).toBe('grok');
  });

  it('scores Grok highest on accusations', () => {
    const analysis = analyzeWriterIntent('אתה טועה וזה סותר מה שאמרת. תוכיח.', emptySignals);
    expect(analysis.scores.grok).toBeGreaterThan(analysis.scores.terra);
    expect(analysis.writer).toBe('grok');
  });
});

describe('sanitizeWriterOutput', () => {
  it('strips bracket-only meta from Claude-like replies', () => {
    const raw = '[The user wants empathy]\nאני איתך בזה, בלי שיפוט.';
    expect(sanitizeWriterOutput(raw)).toBe('אני איתך בזה, בלי שיפוט.');
  });

  it('detects bracket-only replies', () => {
    expect(looksLikeBracketOnlyReply('[[USER_FIRST_NAME]]')).toBe(true);
  });
});

describe('conversation file prompt', () => {
  it('wraps rolling memory for the writer', () => {
    const block = formatConversationFilePromptBlock('הקשר: דיבר על מים\nבקשות חוזרות: מים (×3)');
    expect(block).toContain('קובץ שיחה');
    expect(block).toContain('×3');
  });
});
