import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/crypto/pii-fields', () => ({
  decryptChatContent: (c: string) => c,
  encryptChatContent: (c: string) => c,
}));
vi.mock('@/lib/ai/usage-meter', () => ({ meteredFetch: (f: typeof fetch) => f }));

import { maskReplyQcInput } from '../lib/ai/reply-quality/core';
import { runAlmogReplyQualityCheck, REPLY_QC_LEARN_SOURCE } from '../lib/ai/reply-quality/run';

const NAME = 'נועה';
const PHONE = '052-1234567';
const reply = `${NAME}, נשמע שהיום היה עמוס באמת. אם תרצו לדבר, אפשר גם בטלפון ${PHONE} מחר בבוקר ננסה שוב ביחד.`;

describe('maskReplyQcInput', () => {
  it('masks name and PII in every field and restores them', () => {
    const { masked, restore } = maskReplyQcInput(
      { reply, lastUserText: `אני ${NAME}, הטלפון שלי ${PHONE}`, previousReplies: [`היי ${NAME}`], gender: null, healthConsentOff: false },
      NAME
    );
    const all = [masked.reply, masked.lastUserText, ...masked.previousReplies].join('\n');
    expect(all).not.toContain(NAME);
    expect(all).not.toContain('1234567');
    expect(masked.reply).toContain('[NAME]');
    expect(masked.reply).toMatch(/⟦P1⟧/);
    expect(restore(masked.reply)).toBe(reply);
  });
  it('is a no-op without a name or PII', () => {
    const { masked, restore } = maskReplyQcInput({ reply: 'שלום לכם', lastUserText: '', previousReplies: [], gender: null, healthConsentOff: false }, null);
    expect(masked.reply).toBe('שלום לכם');
    expect(restore('שלום לכם')).toBe('שלום לכם');
  });
});

type Op = { table: string; op: string; payload?: unknown };
function fakeAdmin(content: string) {
  const ops: Op[] = [];
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    for (const m of ['select', 'eq', 'gte', 'order', 'limit', 'neq']) q[m] = chain;
    q.maybeSingle = async () => ({ data: { id: 7, content, created_at: new Date().toISOString(), metadata: {} }, error: null });
    q.then = (res: (v: unknown) => void) => res({ data: [], error: null });
    q.insert = async (payload: unknown) => (ops.push({ table, op: 'insert', payload }), { error: null });
    q.update = (payload: unknown) => (ops.push({ table, op: 'update', payload }), { eq: () => ({ eq: async () => ({ error: null }) }) });
    q.delete = () => ({ eq: async () => ({ error: null }) });
    return q;
  };
  return { admin: { from } as never, ops };
}

describe('runAlmogReplyQualityCheck privacy', () => {
  let bodies: string[] = [];
  beforeEach(() => {
    bodies = [];
    process.env.OPENROUTER_API_KEY = 'test';
    vi.stubGlobal('fetch', async (_u: string, init: { body: string }) => {
      bodies.push(init.body);
      const sent = JSON.parse(init.body).messages[1].content as string;
      const latest = sent.split('LATEST ALMOG REPLY (review this):\n')[1]!;
      const fixed = latest.replace('ננסה', 'נוכל לנסות');
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ok: false, fixed }) } }] }), { status: 200 });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends only masked text, restores the name in the stored fix, logs anonymized', async () => {
    const { admin, ops } = fakeAdmin(reply);
    const out = await runAlmogReplyQualityCheck(admin, {
      userId: 'user-uuid-1', sessionId: 's1', lastUserText: `אני ${NAME}`, previousReplies: [],
      gender: null, healthConsentOff: false, firstName: NAME,
    });
    expect(out.status).toBe('edited');
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toContain(NAME);
    expect(bodies[0]).not.toContain('1234567');
    expect(bodies[0]).not.toContain('user-uuid-1');
    const upd = ops.find((o) => o.op === 'update')!.payload as { content: string };
    expect(upd.content).toContain(NAME);
    expect(upd.content).toContain(PHONE);
    expect(upd.content).toContain('נוכל לנסות');
    await new Promise((r) => setTimeout(r, 0));
    const log = ops.find((o) => o.table === 'notify_quality_events')!.payload as Array<Record<string, unknown>>;
    expect(log[0]!.source).toBe(REPLY_QC_LEARN_SOURCE);
    expect(log[0]!.stage).toBe('qc_edit');
    expect('user_id' in log[0]!).toBe(false);
    expect(JSON.stringify(log)).not.toContain(NAME);
    expect(JSON.stringify(log)).not.toContain('1234567');
  });

  it('still skips crisis turns without any model call', async () => {
    const { admin } = fakeAdmin(reply);
    const out = await runAlmogReplyQualityCheck(admin, {
      userId: 'u', sessionId: 's', lastUserText: 'x', previousReplies: [], gender: null, healthConsentOff: false, crisis: true, firstName: NAME,
    });
    expect(out).toEqual({ status: 'skipped', reason: 'crisis' });
    expect(bodies).toHaveLength(0);
  });
});
