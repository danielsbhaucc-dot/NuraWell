import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REDACTED_CONTENT,
  almogRedactionReply,
  isHealthChatMessage,
  isRedactedContent,
  respondWithHealthRedaction,
  sanitizeIncomingMessages,
} from '@/lib/privacy/health-chat-redaction';

const SECRET = 'אני שוקלת 93.4 קילו ויש לי סוכרת';

describe('health chat classifier (deterministic, local)', () => {
  it.each([SECRET, 'הלחץ דם שלי 140/90', 'ירדתי 2 ק"ג השבוע', 'אכלתי 1800 קלוריות', 'הרופא שינה לי תרופה', 'I weigh 80kg'])(
    'flags %s',
    (t) => expect(isHealthChatMessage(t)).toBe(true)
  );
  it.each(['מה שלומך?', 'היה לי יום עמוס בעבודה', 'הלכתי עם הילדים לים', 'קבעתי פגישה ב-10'])('passes %s', (t) =>
    expect(isHealthChatMessage(t)).toBe(false)
  );
});

describe('Almog redaction reply', () => {
  it('is gendered, never echoes content, does not pressure', () => {
    const f = almogRedactionReply('female');
    const m = almogRedactionReply('male');
    expect(f).toContain('ספרי');
    expect(m).toContain('ספר לי');
    expect(m).toContain('ללא הסכמה מפורשת');
    for (const r of [f, m, almogRedactionReply(null)]) {
      expect(r).toMatch(/נמחק|מחקתי/);
      expect(r).not.toMatch(/93|קילו|סוכרת/);
      expect(r).not.toMatch(/\/[הת]\b/);
    }
  });
});

describe('sanitizeIncomingMessages (bypass: client resends / crafted history)', () => {
  it('replaces health user messages, keeps others and assistant turns', () => {
    const msgs = [
      { role: 'user', parts: [{ type: 'text', text: SECRET }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'היי' }] },
      { role: 'user', parts: [{ type: 'text', text: 'היה יום טוב' }] },
    ];
    const { messages, redacted } = sanitizeIncomingMessages(msgs);
    expect(redacted).toBe(1);
    expect(JSON.stringify(messages)).not.toContain('93.4');
    expect(isRedactedContent(messages[0].parts![0].text)).toBe(true);
    expect(messages[2]).toBe(msgs[2]);
  });
});

describe('respondWithHealthRedaction — no leakage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('stores only placeholder + notice; nothing in logs or response contains the text', async () => {
    const logs: unknown[] = [];
    for (const k of ['log', 'info', 'warn', 'error', 'debug'] as const)
      vi.spyOn(console, k).mockImplementation((...a) => void logs.push(a));
    const rows: unknown[] = [];
    const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { gender: 'female' } }) }) }) }) };
    const res = await respondWithHealthRedaction({
      supabase: {}, admin, userId: 'u1', sessionId: 's1', debugId: 'd1',
      ensureSession: async () => {},
      insert: async (_sb, row) => void rows.push(row),
    });
    const body = await res.text();
    expect(res.headers.get('x-almog-redacted')).toBe('1');
    expect(rows).toHaveLength(2);
    expect((rows[0] as { content: string }).content).toBe(REDACTED_CONTENT);
    const all = JSON.stringify({ rows, logs, body });
    expect(all).not.toMatch(/93\.4|סוכרת|שוקלת/);
  });

  it.each([
    [0, true],
    [1, false],
    [5, false],
  ])('server-side stored notice count %i → consent line %s; notice flagged', async (count, first) => {
    const rows: Array<{ content: string; metadata?: Record<string, unknown> }> = [];
    const chain: Record<string, unknown> = {};
    for (const k of ['select', 'eq']) chain[k] = () => chain;
    chain.maybeSingle = async () => ({ data: { gender: 'male' } });
    chain.contains = (_c: string, v: unknown) => {
      expect(v).toEqual({ redaction_notice: true });
      return Promise.resolve({ count });
    };
    const admin = { from: () => chain };
    const res = await respondWithHealthRedaction({
      supabase: {}, admin, userId: 'u1', sessionId: 's1', debugId: 'd1',
      ensureSession: async () => {},
      insert: async (_sb, row) => void rows.push(row),
    });
    const body = await res.text();
    expect(body.includes('ללא הסכמה מפורשת')).toBe(first);
    expect(/הסכמה|הגדרות/.test(body)).toBe(first);
    expect(rows[1].metadata).toEqual({ redaction_notice: true });
  });

  it('persist failure logs no content', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const admin = { from: () => { throw new Error('x'); } };
    const res = await respondWithHealthRedaction({
      supabase: {}, admin, userId: 'u1', sessionId: 's1', debugId: 'd1',
      ensureSession: async () => { throw new Error('db down'); },
      insert: async () => {},
    });
    expect(res.status).toBe(200);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/93|סוכרת/);
  });
});

describe('DB guard migration', () => {
  it('covers measurements, profiles and health memories', async () => {
    const fs = await import('node:fs');
    const sql = fs.readFileSync(new URL('../../../supabase/migrations/000146_health_consent_db_guard.sql', import.meta.url), 'utf8');
    for (const t of ['user_measurements', 'public.profiles', 'user_memories', 'health_consent_withdrawn'])
      expect(sql).toContain(t);
  });
});

describe('chat route gate', () => {
  it('has no resume_assistant exemption from health redaction', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../app/api/v1/ai/chat/route.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/if \(isHealthChatMessage\(lastUserText\)\) \{/);
    expect(src).not.toMatch(/isHealthChatMessage\(lastUserText\)\s*&&\s*!parsed\.data\.resume_assistant/);
  });
});
