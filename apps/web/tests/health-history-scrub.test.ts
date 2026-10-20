import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { scrubHealthFromChatHistory } from '@/lib/privacy/health-history-scrub';
import { encryptChatContent, decryptChatContent } from '@/lib/crypto/pii-fields';
import { REDACTED_CONTENT, REDACTED_PLACEHOLDER } from '@/lib/privacy/health-chat-redaction';
import { __resetPiiKeyCache } from '@/lib/crypto/pii';

beforeAll(() => {
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  __resetPiiKeyCache();
});

function fakeAdmin(tables: Record<string, Array<Record<string, unknown>>>) {
  return {
    from(t: string) {
      const rows = tables[t]!;
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        range: async () => ({ data: rows, error: null }),
        then: (res: (v: unknown) => unknown) => res({ data: rows, error: null }),
        update(patch: Record<string, unknown>) {
          return { eq: (_k: string, id: string) => ({ eq: async () => { Object.assign(rows.find((r) => r.id === id)!, patch); return { error: null }; } }) };
        },
      };
      return q;
    },
  };
}

describe('scrubHealthFromChatHistory', () => {
  it('replaces only health messages and session fields, locally', async () => {
    const u = 'user-1';
    const tables = {
      ai_interactions: [
        { id: 'm1', role: 'user', content: encryptChatContent('אני שוקלת 80 קילו', u) },
        { id: 'm2', role: 'user', content: encryptChatContent('היה יום טוב בעבודה', u) },
        { id: 'm3', role: 'assistant', content: encryptChatContent('בוא נדבר על הדיאטה שלך', u) },
      ],
      chat_sessions: [{ id: 's1', title: encryptChatContent('משקל ודיאטה', u), summary: encryptChatContent('דיברנו על הכולסטרול', u), preview_text: encryptChatContent('שלום', u) }],
    };
    const r = await scrubHealthFromChatHistory(fakeAdmin(tables) as never, u);
    expect(r).toEqual({ messages: 2, sessions: 1 });
    expect(decryptChatContent(tables.ai_interactions[0]!.content, u)).toBe(REDACTED_CONTENT);
    expect(decryptChatContent(tables.ai_interactions[1]!.content, u)).toBe('היה יום טוב בעבודה');
    expect(decryptChatContent(tables.ai_interactions[2]!.content, u)).toBe(REDACTED_PLACEHOLDER);
    expect(decryptChatContent(tables.chat_sessions[0]!.title, u)).toBe('שיחה');
    expect(tables.chat_sessions[0]!.summary).toBeNull();
    expect(decryptChatContent(tables.chat_sessions[0]!.preview_text, u)).toBe('שלום');
  });
});
