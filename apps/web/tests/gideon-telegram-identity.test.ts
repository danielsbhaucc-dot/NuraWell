import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/ai/client', () => ({ AI_MODELS: {}, deepseek: {}, groq: {}, openrouter: {} }));
vi.mock('@/lib/api/rate-limit', () => ({ consumeRateLimit: vi.fn(async () => ({ ok: false })) }));
import { authorizedSender, handleTelegramUpdate, verifyTelegramSecret } from '@/lib/ceo/webhook';
import { allowedChatIds } from '@/lib/ceo/channel';

const A = new Set(['42']);
const msg = (o: Record<string, unknown>) => ({ message: { text: 'מה המצב ב-Ops?', ...o } }) as never;

describe('Gideon Telegram identity gate (numeric ids, fail closed)', () => {
  it('Daniel: private chat, from.id === chat.id, both allowlisted', () => {
    expect(authorizedSender(msg({ from: { id: 42 }, chat: { id: 42, type: 'private' } }), A)).toBe('42');
  });
  it.each([
    ['stranger', { from: { id: 7 }, chat: { id: 7, type: 'private' } }],
    ['no from', { chat: { id: 42, type: 'private' } }],
    ['spoofed chat (other sender in Daniel chat id)', { from: { id: 7 }, chat: { id: 42, type: 'private' } }],
    ['group containing Daniel', { from: { id: 42 }, chat: { id: 42, type: 'group' } }],
    ['missing chat type', { from: { id: 42 }, chat: { id: 42 } }],
    ['bot sender', { from: { id: 42, is_bot: true }, chat: { id: 42, type: 'private' } }],
    ['username/name only', { from: { id: 7, username: 'daniel', first_name: 'Daniel' }, chat: { id: 7, type: 'private' } }],
  ])('blocks %s', (_n, o) => {
    expect(authorizedSender(msg(o), A)).toBeNull();
  });
  it('callback from someone else on Daniel message is blocked', () => {
    const u = { callback_query: { id: 'c', from: { id: 7 }, data: 'ceo:a:x', message: { chat: { id: 42, type: 'private' }, message_id: 1 } } } as never;
    expect(authorizedSender(u, A)).toBeNull();
  });
  it('empty / non-numeric allowlist fails closed', () => {
    expect(allowedChatIds('').size).toBe(0);
    expect([...allowedChatIds('@daniel, daniel, 42')]).toEqual(['42']);
    expect(authorizedSender(msg({ from: { id: 42 }, chat: { id: 42, type: 'private' } }), new Set())).toBeNull();
  });
  it('blocked sender: no AI turn, no reply, audit row only', async () => {
    process.env.CEO_TELEGRAM_ALLOWED_CHAT_IDS = '42';
    const inserts: unknown[] = [];
    const db = { from: () => ({ insert: (r: unknown) => (inserts.push(r), Promise.resolve({})) }) } as never;
    const runTurn = vi.fn();
    const channel = { name: 't', send: vi.fn(async () => {}), ack: vi.fn(async () => {}) };
    const r = await handleTelegramUpdate(db, channel as never, msg({ from: { id: 7 }, chat: { id: 42, type: 'private' } }), { runTurn });
    expect(r).toEqual({ ignored: true });
    expect(runTurn).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
    expect(JSON.stringify(inserts)).toContain('stranger_blocked');
  });
  it('webhook secret: constant-time compare, fails closed', () => {
    expect(verifyTelegramSecret('s3cret', 's3cret')).toBe(true);
    expect(verifyTelegramSecret('wrong', 's3cret')).toBe(false);
    expect(verifyTelegramSecret(null, 's3cret')).toBe(false);
    expect(verifyTelegramSecret('x', undefined)).toBe(false);
  });
});
