import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  AI_MODELS: { background_groq: 'openai/gpt-oss-20b', background_groq_strong: 'openai/gpt-oss-120b', empathy: 'openai/gpt-5-mini' },
  deepseek: {}, groq: {}, openrouter: {},
}));
vi.mock('@/lib/admin/business-metrics', () => ({ buildBusinessMetrics: vi.fn(async () => ({ mrrIls: 0 })) }));
vi.mock('@/lib/api/rate-limit', () => ({ consumeRateLimit: vi.fn(async () => ({ ok: true })) }));

import { complete, isTechnicalSafe, _resetDeepseekState } from '@/lib/ceo/llm';
import { approvalCard, decideAction, proposeAction } from '@/lib/ceo/actions';
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
      select: chain, order: chain, limit: chain, in: chain, gte: chain, lt: chain, neq: chain, is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), b),
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
          { const k = 'chat_key' in payload ? 'chat_key' : 'id'; const prev = rows.find((r) => r[k] === payload[k]); t[name] = rows.filter((r) => r[k] !== payload[k]).concat({ ...(prev ?? {}), ...payload }); }
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
    // the stranger gets nothing; only the owner (42) is alerted
    expect(f.mock.calls.every((c) => JSON.parse(String(((c as unknown[])[1] as { body: string }).body)).chat_id === '42')).toBe(true);
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
    expect(r.cards?.[0].buttons[0][0].data).toMatch(/^ceo:a:/);
    expect(r.cards?.[0].buttons[0].map((b) => b.text)).toEqual(['✅ אשר', '✏️ ערוך', '❌ דחה']);
    expect(r.cards?.[0].text).not.toMatch(/[{}]|[0-9a-f]{8}-[0-9a-f]{4}/);
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
    const r1 = await complete({ messages: m, sensitivity: 'technical', clients: { deepseek: ds as never, groq: gq as never, openrouter: gq as never } });
    expect(r1.provider).toMatch(/^openrouter/);
    await complete({ messages: m, sensitivity: 'technical', clients: { deepseek: ds as never, groq: gq as never, openrouter: gq as never } });
    expect(ds.chat.completions.create).toHaveBeenCalledTimes(1); // exhausted state cached
    _resetDeepseekState();
    const ds2 = ok('ds');
    expect((await complete({ messages: m, sensitivity: 'technical', clients: { deepseek: ds2 as never, groq: gq as never, openrouter: gq as never } })).provider).toBe('deepseek');
  });
  it('sensitive or personal payloads never reach deepseek', async () => {
    process.env.DEEPSEEK_API_KEY = 'k';
    const ds = ok('ds');
    const gq = ok('groq');
    await complete({ messages: [{ role: 'user', content: 'hi' }], clients: { deepseek: ds as never, groq: gq as never, openrouter: gq as never } });
    await complete({ messages: [{ role: 'user', content: '{"content":"chat text"}' }], sensitivity: 'technical', clients: { deepseek: ds as never, groq: gq as never, openrouter: gq as never } });
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
    expect(text).toContain('nurawell.vercel.app/ops/errors');
  });
  it('weekly is sensitive; schedule picks period by Israel date', async () => {
    const { db } = fakeDb();
    const llm = vi.fn(async () => ({ message: { role: 'assistant', content: 'x' } }));
    await buildDigest(db, 'weekly', { complete: llm as never });
    expect((llm.mock.calls[0] as unknown[])[0]).toMatchObject({ sensitivity: 'sensitive' });
    expect(periodsFor(new Date('2026-10-31T18:00:00Z'))).toEqual(['monthly']);
    expect(periodsFor(new Date('2026-10-17T18:00:00Z'))).toEqual(['weekly']);
    expect(periodsFor(new Date('2026-10-13T18:00:00Z'))).toEqual(['daily']);
  });
});

describe('full admin tools + routing', () => {
  it('all conversational turns use gpt-5.4-mini by default', async () => {
    const { pickModel } = await import('@/lib/ceo/agent');
    expect(pickModel('כמה משתמשים יש?')).toBe('openai/gpt-5.4-mini');
    expect(pickModel('תנתח לי למה משתמשים נוטשים')).toBe('openai/gpt-5.4-mini');
  });
  it('blocks role escalation and non-allowlisted tables; destructive gets warning', async () => {
    const { db } = fakeDb();
    const { TOOL_BY_NAME } = await import('@/lib/ceo/tools');
    const upd = TOOL_BY_NAME.get('db_update')!;
    await expect(upd.run(db, { table: 'profiles', match: { id: 'x' }, patch: { role: 'admin' } })).rejects.toThrow(/not writable/);
    expect(() => upd.schema.parse({ table: 'auth_users', match: { id: 'x' }, patch: {} })).toThrow();
    expect(() => upd.schema.parse({ table: 'profiles', match: {}, patch: { full_name: 'a' } })).toThrow();
    const a = await proposeAction(db, 'delete_user', { userId: '11111111-1111-4111-8111-111111111111' });
    expect(a.destructive).toBe(true);
    expect(approvalCard(a).text).toContain('בלתי הפיכה');
    expect(a.summary).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });
});

describe('formatting + time context', () => {
  it('converts markdown to Telegram HTML and escapes the rest', async () => {
    const { mdToTelegramHtml, mdToPlain } = await import('@/lib/ceo/format');
    expect(mdToTelegramHtml('**חשוב** <x> & `a<b` [פאנל](https://n.app/ops)\n- פריט')).toBe('<b>חשוב</b> &lt;x&gt; &amp; <code>a&lt;b</code> <a href="https://n.app/ops">פאנל</a>\n• פריט');
    expect(mdToPlain('**a** `b`')).toBe('a b');
  });
  it('falls back to plain text on HTML parse error', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response('{"ok":false}', { status: 400 }))
      .mockResolvedValueOnce(new Response('{"ok":true}'));
    await createTelegramChannel(f as never).send('42', '**x**');
    const bodies = f.mock.calls.map((c) => JSON.parse((c as [string, { body: string }])[1].body));
    expect(bodies[0].parse_mode).toBe('HTML');
    expect(bodies[1].parse_mode).toBeUndefined();
    expect(bodies[1].text).toBe('x');
  });
  it('injects Israel time, day part and Shabbat', async () => {
    const { israelTimeContext } = await import('@/lib/ceo/time-context');
    const noon = israelTimeContext(new Date('2026-10-12T09:30:00Z'));
    expect(noon).toContain('12:30');
    expect(noon).toContain('צהריים');
    expect(israelTimeContext(new Date('2026-10-17T08:00:00Z'))).toContain('שבת');
  });
  it('passes history + snapshot + time to the model', async () => {
    const { db, t } = fakeDb();
    t.ceo_conversations.push({ chat_key: 'telegram:42', summary: 'דיברנו על נטישה', turns: [{ role: 'user', content: 'שאלה קודמת' }, { role: 'assistant', content: 'תשובה קודמת' }] });
    const llm = vi.fn(async () => ({ message: { role: 'assistant', content: 'ok' } }));
    await runCeoTurn(db, 'telegram:42', 'מה קורה היום?', { complete: llm as never });
    const msgs = (llm.mock.calls[0] as unknown as [{ messages: { role: string; content: string }[] }])[0].messages;
    expect(msgs[1].content).toContain('עכשיו בישראל');
    expect(msgs[1].content).toContain('users_total');
    expect(msgs[1].content).toContain('דיברנו על נטישה');
    expect(msgs.map((m) => m.content)).toContain('תשובה קודמת');
  });
});

describe('owner task tracker', () => {
  it('reminds only due/overdue or high-priority tasks, not twice a day', async () => {
    const { dueForReminder } = await import('@/lib/ceo/owner-tasks');
    const now = new Date('2026-10-12T18:00:00Z');
    const base = { detail: '', status: 'open', origin: 'content', snoozed_until: null, last_reminded_at: null };
    const r = dueForReminder([
      { ...base, id: '1', title: 'צילום', priority: 'normal', due_date: '2026-10-12' },
      { ...base, id: '2', title: 'עתידי', priority: 'normal', due_date: '2026-10-20' },
      { ...base, id: '3', title: 'דחוף', priority: 'high', due_date: null },
      { ...base, id: '4', title: 'הוזכר', priority: 'high', due_date: null, last_reminded_at: '2026-10-12T10:00:00Z' },
    ], now);
    expect(r.map((t) => t.id)).toEqual(['1', '3']);
  });
  it('done / snooze buttons update the task', async () => {
    const { db, t } = fakeDb();
    t.ceo_owner_tasks = [{ id: 'k1', title: 'לצלם סרטון', status: 'open' }];
    const f = tgFetch();
    await handleTelegramUpdate(db, createTelegramChannel(f as never), { callback_query: { id: 'cb', data: 'ceo:ts:k1', message: { chat: { id: 42 }, message_id: 3 } } });
    expect(t.ceo_owner_tasks[0].status).toBe('snoozed');
    await handleTelegramUpdate(db, createTelegramChannel(f as never), { callback_query: { id: 'cb', data: 'ceo:td:k1', message: { chat: { id: 42 }, message_id: 3 } } });
    expect(t.ceo_owner_tasks[0].status).toBe('done');
  });
  it('create tool is restricted to human-only origins', async () => {
    const { TOOL_BY_NAME } = await import('@/lib/ceo/tools');
    const c = TOOL_BY_NAME.get('owner_task_create')!;
    expect(() => c.schema.parse({ title: 'לתקן באג', origin: 'code' })).toThrow();
    expect(c.description).toMatch(/ONLY if it truly requires a human/);
  });
});

describe('demo links via dedicated tool', () => {
  it('generic writes to token tables are blocked; create_demo_link is a write tool with a human summary', async () => {
    const { TOOL_BY_NAME: T } = await import('@/lib/ceo/tools');
    const ins = T.get('db_insert')!;
    expect(() => ins.schema.parse({ table: 'demo_access_links', row: { guest_name: 'x' } })).toThrow();
    const demo = T.get('create_demo_link')!;
    expect(demo.write).toBe(true);
    expect(demo.secretResult).toBe(true);
    const s = demo.summarize!(demo.schema.parse({ guest_name: 'אורי', hours: 24 }));
    expect(s).toBe('יצירת קישור דמו לאורי, בתוקף ליממה');
    expect(s).not.toMatch(/token|hash|demo_access/);
  });
});

describe('demo fast path + picker + effects', () => {
  it('"תן לאלכס גישה" becomes a demo card with a target picker, no LLM call', async () => {
    const { db, t } = fakeDb();
    t.profiles.push({ id: '22222222-2222-4222-8222-222222222222', full_name: 'Test', role: 'test' });
    const llm = vi.fn();
    const r = await runCeoTurn(db, 'telegram:42', 'תן לאלכס גישה', { complete: llm as never });
    expect(llm).not.toHaveBeenCalled();
    expect(t.ceo_pending_actions[0].tool).toBe('create_demo_link');
    expect((t.ceo_pending_actions[0].args as { guest_name: string }).guest_name).toBe('אלכס');
    const card = r.cards![0];
    expect(card.buttons.some((row) => row[0].data.startsWith('ceo:t:'))).toBe(true);
    expect(card.buttons.at(-1)!.map((b) => b.text)).toEqual(['✅ אשר', '✏️ ערוך', '❌ דחה']);
  });
  it('picker button sets the target and re-renders the card', async () => {
    const { db, t } = fakeDb();
    t.profiles.push({ id: '22222222-2222-4222-8222-222222222222', full_name: 'Test', role: 'test' });
    const a = await proposeAction(db, 'create_demo_link', { guest_name: 'אלכס' });
    const f = tgFetch();
    await handleTelegramUpdate(db, createTelegramChannel(f as never), { callback_query: { id: 'cb', data: `ceo:t:${a.id}:22222222`, message: { chat: { id: 42 }, message_id: 9 } } });
    expect((t.ceo_pending_actions[0].args as { targetUserId: string }).targetUserId).toBe('22222222-2222-4222-8222-222222222222');
    const edit = f.mock.calls.find((c) => String((c as unknown[])[0]).endsWith('editMessageText')) as unknown[];
    const body = JSON.parse(String((edit[1] as { body: string }).body));
    expect(body.reply_markup.inline_keyboard.flat().find((b: { text: string }) => b.text.startsWith('✓'))?.text).toMatch(/^✓ Test/);
  });
  it('incoming message gets 👀 reaction + typing', async () => {
    const { db } = fakeDb();
    const f = tgFetch();
    await handleTelegramUpdate(db, createTelegramChannel(f as never), { message: { chat: { id: 42 }, text: 'היי', message_id: 5 } }, { runTurn: async () => ({ text: 'שלום', buttons: [] }) });
    const methods = f.mock.calls.map((c) => String((c as unknown[])[0]).split('/').pop());
    expect(methods.slice(0, 2)).toEqual(['setMessageReaction', 'sendChatAction']);
  });
});

describe('stolen-phone protection', () => {
  const sec = (t: Record<string, Record<string, unknown>[]>, s: Record<string, unknown>) => { t.gideon_settings = [{ id: 1, ...s }]; };
  it('routine approval stays one tap without a passkey enrolled', async () => {
    const { db, t } = fakeDb();
    const a = await proposeAction(db, 'set_test_user', { userId: '11111111-1111-4111-8111-111111111111', enabled: true });
    expect((await decideAction(db, a.id, true, 'x')).ok).toBe(true);
    expect(t.profiles[0].notify_test_opt_in).toBe(true);
  });
  it('sensitive approval needs Face ID (returns a one-time link) and never executes on tap', async () => {
    const { db, t } = fakeDb();
    t.admin_passkeys = [{ id: 'k1', credential_id: 'c' }];
    sec(t, { reverify_minutes: 0 });
    const a = await proposeAction(db, 'delete_user', { userId: '11111111-1111-4111-8111-111111111111' });
    expect(a.sensitive).toBe(true);
    const r = await decideAction(db, a.id, true, 'x');
    expect(r.ok).toBe(false);
    expect(r.stepupUrl).toMatch(/\/gideon\/verify\?t=[A-Za-z0-9_-]{40,}/);
    expect(t.ceo_pending_actions[0].status).toBe('pending');
    expect(t.webauthn_challenges[0].token_hash).toMatch(/^[0-9a-f]{64}$/); // only the hash is stored
  });
  it('trust window lets sensitive actions through; kill switch blocks everything', async () => {
    const { db, t } = fakeDb();
    t.admin_passkeys = [{ id: 'k1', credential_id: 'c' }];
    sec(t, { reverify_minutes: 0, trusted_until: new Date(Date.now() + 3_600_000).toISOString() });
    const a = await proposeAction(db, 'db_update', { table: 'journey_steps', match: { is_published: false }, patch: { is_published: true } });
    expect(a.sensitive).toBe(true); // bulk
    expect((await decideAction(db, a.id, true, 'x')).stepupUrl).toBeUndefined();
    sec(t, { disabled: true });
    const b = await proposeAction(db, 'set_test_user', { userId: '11111111-1111-4111-8111-111111111111', enabled: false });
    expect((await decideAction(db, b.id, true, 'x')).text).toContain('מושבת');
  });
  it('lockout after failed step-ups', async () => {
    const { db, t } = fakeDb();
    t.admin_passkeys = [{ id: 'k1', credential_id: 'c' }];
    sec(t, { locked_until: new Date(Date.now() + 600_000).toISOString() });
    const a = await proposeAction(db, 'set_test_user', { userId: '11111111-1111-4111-8111-111111111111', enabled: true });
    expect((await decideAction(db, a.id, true, 'x')).text).toContain('נעול');
  });
  it('unknown chat alerts the owner, gets no reply; /lock kills', async () => {
    const { db, t } = fakeDb();
    const f = tgFetch();
    await handleTelegramUpdate(db, createTelegramChannel(f as never), { message: { chat: { id: 999 }, text: 'היי' } });
    const sent = f.mock.calls.map((c) => JSON.parse(String(((c as unknown[])[1] as { body: string }).body)));
    expect(sent).toHaveLength(1);
    expect(sent[0].chat_id).toBe('42');
    expect(sent[0].text).toContain('לא מוכר');
    await handleTelegramUpdate(db, createTelegramChannel(tgFetch() as never), { message: { chat: { id: 42 }, text: '/lock' } });
    expect(t.gideon_settings[0].disabled).toBe(true);
  });
});
