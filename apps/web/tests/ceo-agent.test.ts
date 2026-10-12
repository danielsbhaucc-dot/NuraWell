import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  AI_MODELS: { background_groq: 'openai/gpt-oss-20b', background_groq_strong: 'openai/gpt-oss-120b', empathy: 'openai/gpt-5-mini' },
  deepseek: {}, groq: {}, openrouter: {},
}));
vi.mock('@/lib/admin/business-metrics', () => ({ buildBusinessMetrics: vi.fn(async () => ({ mrrIls: 0 })) }));
vi.mock('@/lib/api/rate-limit', () => ({ consumeRateLimit: vi.fn(async () => ({ ok: true })) }));

import { complete, isTechnicalSafe, _resetDeepseekState } from '@/lib/ceo/llm';
import { decideAction, proposeAction } from '@/lib/ceo/actions';
import { runCeoTurn } from '@/lib/ceo/agent';
import { handleTelegramUpdate, verifyTelegramSecret } from '@/lib/ceo/webhook';
import { createTelegramChannel, splitMessage } from '@/lib/ceo/telegram';
import { buildDigest, periodsFor } from '@/lib/ceo/digest';

/** Minimal in-memory Supabase fake: tables + eq/gt filters + update/insert/upsert/rpc. */
function fakeDb() {
  const t: Record<string, Record<string, unknown>[]> = { ceo_pending_actions: [], ceo_audit_log: [], ceo_conversations: [], profiles: [{ id: '11111111-1111-4111-8111-111111111111', notify_test_opt_in: false }] };
  let seq = 0;
  const q = (name: string) => {
    const filters: ((r: Record<string, unknown>) => boolean)[] = [];
    let op: 'select' | 'update' | 'insert' | 'upsert' = 'select';
    let payload: Record<string, unknown> = {};
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain, order: chain, limit: chain, in: chain, gte: chain, lt: chain, neq: chain,
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      gt: (k: string, v: string) => (filters.push((r) => String(r[k]) > v), b),
      update: (p: Record<string, unknown>) => ((op = 'update'), (payload = p), b),
      insert: (p: Record<string, unknown>) => ((op = 'insert'), (payload = p), b),
      upsert: (p: Record<string, unknown>) => ((op = 'upsert'), (payload = p), b),
      exec() {
        const rows = (t[name] ??= []);
        if (op === 'insert') {
          const r = { id: `a${++seq}`, status: 'pending', expires_at: new Date(Date.now() + 86_400_000).toISOString(), ...payload };
          rows.push(r);
          return [r];
        }
        if (op === 'upsert') {
          t[name] = rows.filter((r) => r.chat_key !== payload.chat_key).concat(payload);
          return [payload];
        }
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (op === 'update') hit.forEach((r) => Object.assign(r, payload));
        return hit;
      },
    });
    b.single = b.maybeSingle = async () => ({ data: (b.exec as () => unknown[])()[0] ?? null, error: null });
    b.then = (res: (v: unknown) => void) => res({ data: (b.exec as () => unknown[])(), error: null });
    return b;
  };
  return { t, db: { from: q, rpc: async () => ({ data: { users_total: 2, errors: 3 }, error: null }) } as never };
}

const tgFetch = () => vi.fn(async () => new Response('{"ok":true}'));

beforeEach(() => {
  process.env.CEO_TELEGRAM_ALLOWED_CHAT_IDS = '42';
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  delete process.env.DEEPSEEK_API_KEY;
  _resetDeepseekState();
});

describe('security', () => {
  it('rejects missing/wrong webhook secret', () => {
    expect(verifyTelegramSecret('x', undefined)).toBe(false);
    expect(verifyTelegramSecret(null, 's')).toBe(false);
    expect(verifyTelegramSecret('bad', 'good')).toBe(false);
    expect(verifyTelegramSecret('good', 'good')).toBe(true);
  });
  it('ignores chats not on the allowlist', async () => {
    const { db } = fakeDb();
    const f = tgFetch();
    const runTurn = vi.fn();
    const r = await handleTelegramUpdate(db, createTelegramChannel(f as never), { message: { chat: { id: 7 }, text: 'hi' } }, { runTurn });
    expect(r).toEqual({ ignored: true });
    expect(runTurn).not.toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
  });
  it('classification guard blocks personal data', () => {
    expect(isTechnicalSafe('{"errors":3,"users_total":2}')).toBe(true);
    expect(isTechnicalSafe('{"full_name":"x"}')).toBe(false);
    expect(isTechnicalSafe('a@b.com')).toBe(false);
    expect(isTechnicalSafe('id 11111111-1111-4111-8111-111111111111')).toBe(false);
  });
});

describe('approval flow', () => {
  it('write executes only after approval, once', async () => {
    const { db, t } = fakeDb();
    const a = await proposeAction(db, 'set_test_user', { userId: '11111111-1111-4111-8111-111111111111', enabled: true });
    expect(t.profiles[0].notify_test_opt_in).toBe(false);
    const r1 = await decideAction(db, a.id, true, 'admin:42');
    expect(r1.ok).toBe(true);
    expect(t.profiles[0].notify_test_opt_in).toBe(true);
    const r2 = await decideAction(db, a.id, true, 'admin:42');
    expect(r2.ok).toBe(false);
    expect(t.ceo_audit_log.map((x) => x.event)).toEqual(['action_proposed', 'action_approved', 'action_done']);
  });
  it('rejects non-write tools and expired actions', async () => {
    const { db, t } = fakeDb();
    await expect(proposeAction(db, 'metrics', {})).rejects.toThrow();
    const a = await proposeAction(db, 'set_test_user', { userId: '11111111-1111-4111-8111-111111111111', enabled: true });
    t.ceo_pending_actions[0].expires_at = new Date(Date.now() - 1000).toISOString();
    expect((await decideAction(db, a.id, true, 'x')).ok).toBe(false);
    expect(t.profiles[0].notify_test_opt_in).toBe(false);
  });
});

describe('agent turn + mocked Telegram', () => {
  it('read tool runs directly, write tool becomes approval buttons, memory saved', async () => {
    const { db, t } = fakeDb();
    const llm = vi
      .fn()
      .mockResolvedValueOnce({ message: { role: 'assistant', content: null, tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'metrics', arguments: '{"days":1}' } },
        { id: 'c2', type: 'function', function: { name: 'set_test_user', arguments: '{"userId":"11111111-1111-4111-8111-111111111111","enabled":true}' } },
      ] } })
      .mockResolvedValueOnce({ message: { role: 'assistant', content: 'יש 2 משתמשים. הכנתי פעולה לאישורך.' } });
    const r = await runCeoTurn(db, 'telegram:42', 'מה המצב?', { complete: llm as never });
    expect(r.text).toContain('2 משתמשים');
    expect(r.buttons[0][0].data).toMatch(/^ceo:a:/);
    expect(t.profiles[0].notify_test_opt_in).toBe(false);
    expect((t.ceo_conversations[0].turns as unknown[]).length).toBe(2);
    const toolMsg = llm.mock.calls[1][0].messages.find((m: { role: string }) => m.role === 'tool');
    expect(toolMsg.content).toContain('users_total');
  });
  it('callback button approves via Telegram and edits the message', async () => {
    const { db, t } = fakeDb();
    const a = await proposeAction(db, 'set_test_user', { userId: '11111111-1111-4111-8111-111111111111', enabled: true });
    const f = tgFetch();
    await handleTelegramUpdate(db, createTelegramChannel(f as never), { callback_query: { id: 'cb', data: `ceo:a:${a.id}`, message: { chat: { id: 42 }, message_id: 9 } } });
    expect(t.profiles[0].notify_test_opt_in).toBe(true);
    const methods = f.mock.calls.map((c) => String((c as unknown[])[0]).split('/').pop());
    expect(methods).toEqual(['answerCallbackQuery', 'editMessageText']);
  });
  it('splits long messages under the Telegram limit', () => {
    expect(splitMessage('x'.repeat(9000)).every((p) => p.length <= 4000)).toBe(true);
  });
});

describe('DeepSeek routing', () => {
  const ok = (provider: string) => ({ chat: { completions: { create: vi.fn(async () => ({ choices: [{ message: { role: 'assistant', content: provider } }] })) } } });
  it('technical → deepseek; 402 → falls back and caches exhausted', async () => {
    process.env.DEEPSEEK_API_KEY = 'k';
    const ds = { chat: { completions: { create: vi.fn(async () => { throw Object.assign(new Error('Insufficient Balance'), { status: 402 }); }) } } };
    const gq = ok('groq');
    const m = [{ role: 'user' as const, content: '{"errors":3}' }];
    const r1 = await complete({ messages: m, sensitivity: 'technical', clients: { deepseek: ds as never, groq: gq as never } });
    expect(r1.provider).toBe('openrouter-groq');
    await complete({ messages: m, sensitivity: 'technical', clients: { deepseek: ds as never, groq: gq as never } });
    expect(ds.chat.completions.create).toHaveBeenCalledTimes(1); // exhausted state cached
    _resetDeepseekState();
    const ds2 = ok('ds');
    expect((await complete({ messages: m, sensitivity: 'technical', clients: { deepseek: ds2 as never, groq: gq as never } })).provider).toBe('deepseek');
  });
  it('sensitive or personal payloads never reach deepseek', async () => {
    process.env.DEEPSEEK_API_KEY = 'k';
    const ds = ok('ds');
    const gq = ok('groq');
    await complete({ messages: [{ role: 'user', content: 'hi' }], clients: { deepseek: ds as never, groq: gq as never } });
    await complete({ messages: [{ role: 'user', content: '{"content":"chat text"}' }], sensitivity: 'technical', clients: { deepseek: ds as never, groq: gq as never } });
    expect(ds.chat.completions.create).not.toHaveBeenCalled();
  });
});

describe('digests', () => {
  it('one model call; daily is technical', async () => {
    const { db } = fakeDb();
    const llm = vi.fn(async () => ({ message: { role: 'assistant', content: 'יום שקט' } }));
    const text = await buildDigest(db, 'daily', { complete: llm as never });
    expect(llm).toHaveBeenCalledTimes(1);
    expect((llm.mock.calls[0] as unknown[])[0]).toMatchObject({ sensitivity: 'technical' });
    expect(text).toContain('/ops/errors');
  });
  it('weekly is sensitive; schedule picks period by Israel date', async () => {
    const { db } = fakeDb();
    const llm = vi.fn(async () => ({ message: { role: 'assistant', content: 'x' } }));
    await buildDigest(db, 'weekly', { complete: llm as never });
    expect((llm.mock.calls[0] as unknown[])[0]).toMatchObject({ sensitivity: 'sensitive' });
    expect(periodsFor(new Date('2026-11-01T06:00:00Z'))).toEqual(['monthly']);
    expect(periodsFor(new Date('2026-10-18T06:00:00Z'))).toEqual(['weekly']);
    expect(periodsFor(new Date('2026-10-13T06:00:00Z'))).toEqual(['daily']);
  });
});
