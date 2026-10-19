import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('no db in tests'); } }));

beforeAll(() => { process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64'); });

describe('seal: restore placeholders then encrypt', () => {
  it('restores [NAME] in table rows and ai_context before encrypting', async () => {
    const { sealTableRow, sealProfilePatch, __setFirstNameLookup } = await import('@/lib/crypto/pii-seal');
    const { decryptTableRow, decryptAiContext } = await import('@/lib/crypto/pii-fields');
    const lookup = vi.fn(async () => 'נועה');
    __setFirstNameLookup(lookup);
    for (const [table, col] of [['chat_sessions', 'title'], ['user_memories', 'memory_text'], ['user_insights', 'insight_text'], ['chat_periodic_summaries', 'ai_insight'], ['pending_chat_logs', 'raw_chat_text']] as const) {
      const row = await sealTableRow(table, { [col]: 'שיחה עם [NAME] על הערב, טלפון [PHONE]' } as Record<string, unknown>, 'u1');
      expect(String(row[col]).startsWith('enc:v1:')).toBe(true);
      expect(String(decryptTableRow(table, row, 'u1')[col]).trim()).toBe('שיחה עם נועה על הערב, טלפון');
    }
    const p = await sealProfilePatch({ ai_context: { chat_summary: '[[USER_FIRST_NAME]] מתקשה בערב', reengagement: { n: 1 } } }, 'u1');
    expect(decryptAiContext(p.ai_context, 'u1')).toEqual({ chat_summary: 'נועה מתקשה בערב', reengagement: { n: 1 } });
    const calls = lookup.mock.calls.length;
    await sealTableRow('chat_sessions', { title: 'בלי placeholders' }, 'u1');
    expect(lookup.mock.calls.length).toBe(calls); // no lookup when not needed
    __setFirstNameLookup(null);
  });
  afterAll(() => vi.restoreAllMocks());
});
