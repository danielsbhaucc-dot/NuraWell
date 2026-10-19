import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('derived-text encryption', () => {
  it('encrypts/decrypts table rows bound to user', async () => {
    const { encryptTableRow, decryptTableRow, encryptAiContext, decryptAiContext } = await import('@/lib/crypto/pii-fields');
    const enc = encryptTableRow('chat_sessions', { title: 'שיחה על אכילה רגשית', summary: 's', status: 'open' }, 'u1');
    expect(String(enc.title).startsWith('enc:v1:')).toBe(true);
    expect(enc.status).toBe('open');
    expect(encryptTableRow('chat_sessions', enc, 'u1').title).toBe(enc.title); // idempotent
    expect(decryptTableRow('chat_sessions', { ...enc, user_id: 'u1' }).title).toBe('שיחה על אכילה רגשית');
    const ctx = encryptAiContext({ chat_summary: 'x', reengagement: { a: 1 } }, 'u1');
    expect(String(ctx.chat_summary).startsWith('enc:v1:')).toBe(true);
    expect(encryptAiContext(ctx, 'u1').chat_summary).toBe(ctx.chat_summary);
    expect(decryptAiContext(ctx, 'u1')).toEqual({ chat_summary: 'x', reengagement: { a: 1 } });
  });

  it('encrypts the live conversation file (raw chat text)', async () => {
    const { encryptTableRow, decryptTableRow } = await import('@/lib/crypto/pii-fields');
    const enc = encryptTableRow('chat_sessions', { live_conversation_file: 'משתמש: קשה לי בלילה' }, 'u1');
    expect(String(enc.live_conversation_file).startsWith('enc:v1:')).toBe(true);
    expect(decryptTableRow('chat_sessions', { ...enc, user_id: 'u1' }).live_conversation_file).toBe('משתמש: קשה לי בלילה');
  });

  it('seals Upstash metadata text, keeps ids/category plain', async () => {
    const { sealVectorMetadata, openVectorMetadata } = await import('@/lib/ai/upstash-vector-rest');
    const m = sealVectorMetadata({ userId: 'u1', text: 'המכשול: לילה', category: 'personal' });
    expect(String(m.text).startsWith('enc:v1:')).toBe(true);
    expect(m.category).toBe('personal');
    expect(m.userId).toBe('u1');
    expect(openVectorMetadata(m).text).toBe('המכשול: לילה');
    expect(openVectorMetadata({ ...m, userId: 'u2' }).text).toBe('');
  });
});
