import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/ai/client', () => ({ AI_MODELS: {}, deepseek: {}, groq: {}, openrouter: {} }));
const rl = vi.fn(async () => ({ ok: true }));
vi.mock('@/lib/api/rate-limit', () => ({ consumeRateLimit: (...a: unknown[]) => rl(...(a as [])) }));
vi.mock('@/lib/ceo/actions', () => ({ decideAction: vi.fn(), approvalCard: vi.fn(), setActionTarget: vi.fn() }));
const invalidateTrust = vi.fn(async () => {});
vi.mock('@/lib/ceo/security', () => ({ invalidateTrust: (...a: unknown[]) => invalidateTrust(...(a as [])), killSwitch: vi.fn(), requestDevice: vi.fn(), securityState: vi.fn(async () => ({ disabled: false })) }));
import { handleTelegramUpdate } from '@/lib/ceo/webhook';
import { hashCode, opsSetIdentity, PROMPT, VERIFY_TTL_MS, type IdentityRow } from '@/lib/ceo/telegram-verify';

type R = IdentityRow & Record<string, unknown>;
let ids: Map<string, R>;
let audit: Array<{ event: string; detail: Record<string, unknown> }>;
const match = (r: R, f: Array<[string, unknown]>) => f.every(([k, v]) => r[k] === v);
function q(t: string) {
  const f: Array<[string, unknown]> = [];
  let patch: Partial<R> | null = null;
  let del = false;
  const exec = () => {
    const rows = [...ids.values()].filter((r) => match(r, f));
    if (del) rows.forEach((r) => ids.delete(r.from_id));
    if (patch) rows.forEach((r) => Object.assign(r, patch));
    return rows.map((r) => ({ ...r }));
  };
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (k: string, v: unknown) => (f.push([k, v]), b),
    limit: () => b,
    maybeSingle: async () => ({ data: exec()[0] ?? null }),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: exec(), error: null }).then(res, rej),
  };
  return {
    ...b,
    update: (p: Partial<R>) => ((patch = p), b),
    delete: () => ((del = true), b),
    insert: async (r: R) => {
      if (t === 'ceo_audit_log') return (audit.push(r as never), {});
      if (ids.has(r.from_id)) return { error: { code: '23505' } };
      ids.set(r.from_id, { ...r }); return { error: null };
    },
    upsert: async (r: R) => (ids.set(r.from_id, { ...(ids.get(r.from_id) ?? {}), ...r } as R), { error: null }),
  };
}
const db = { from: (t: string) => q(t) } as never;

const S = 7; // stranger / Daniel's second account
const dm = (text: string, id = S) => ({ message: { text, from: { id }, chat: { id, type: 'private' }, message_id: 1 } }) as never;
let channel: { name: string; send: ReturnType<typeof vi.fn>; ack: ReturnType<typeof vi.fn> };
let runTurn: ReturnType<typeof vi.fn>;
let sendCode: ReturnType<typeof vi.fn>;
let now: Date;
const go = (u: never) => handleTelegramUpdate(db, channel as never, u, { runTurn: runTurn as never, verify: { sendCode: sendCode as never, genCode: () => '123456', now: () => now } });
const to = (id: string) => channel.send.mock.calls.filter((c) => c[0] === id).map((c) => String(c[1]));

beforeEach(() => {
  process.env.CEO_TELEGRAM_ALLOWED_CHAT_IDS = '42';
  ids = new Map(); audit = [];
  now = new Date('2026-10-21T08:00:00Z');
  runTurn = vi.fn(async () => ({ text: 'SECRET DATA' }));
  sendCode = vi.fn(async () => true);
  channel = { name: 'telegram', send: vi.fn(async () => {}), ack: vi.fn(async () => {}) };
  rl.mockImplementation(async () => ({ ok: true }));
});

describe('Gideon verify-before-block for unknown Telegram senders', () => {
  it('first message: neutral prompt only, code emailed (hash stored, never plaintext), Daniel notified, no AI', async () => {
    const r = await go(dm('היי, אני דניאל מהחשבון השני'));
    expect(r).toMatchObject({ verification: 'prompted' });
    expect(to('7')).toEqual([PROMPT]);
    expect(sendCode).toHaveBeenCalledWith(expect.anything(), '123456', '7');
    expect(to('42').join()).toContain('קוד חד-פעמי');
    expect(runTurn).not.toHaveBeenCalled();
    const row = ids.get('7')!;
    expect(row.status).toBe('pending');
    expect(JSON.stringify(row)).not.toContain('123456');
    expect(Date.parse(row.expires_at!) - now.getTime()).toBe(VERIFY_TTL_MS);
    expect(invalidateTrust).toHaveBeenCalled();
  });

  it('correct code → allowlisted, audited, Daniel notified, then normal Gideon', async () => {
    await go(dm('hi'));
    expect(await go(dm('123456'))).toMatchObject({ verification: 'verified' });
    expect(ids.get('7')!.status).toBe('allowed');
    expect(audit.some((a) => a.event === 'telegram_identity_verified')).toBe(true);
    expect(to('42').join()).toContain('אומת');
    expect(runTurn).not.toHaveBeenCalled();
    await go(dm('מה המצב?'));
    expect(runTurn).toHaveBeenCalledOnce();
  });

  it('3 wrong codes → blocked, Daniel notified, then total silence (no reply, no AI)', async () => {
    await go(dm('hi'));
    await go(dm('000000'));
    await go(dm('111111'));
    expect(await go(dm('222222'))).toMatchObject({ verification: 'blocked' });
    expect(ids.get('7')!.status).toBe('blocked');
    expect(to('42').join()).toContain('נחסם');
    const before = to('7').length;
    await go(dm('123456'));
    await go(dm('בבקשה'));
    expect(to('7').length).toBe(before);
    expect(runTurn).not.toHaveBeenCalled();
    expect(to('7').every((m) => !/נחסם|חסום/.test(m))).toBe(true); // never a rejection message
  });

  it('timeout → blocked silently, even with the right code', async () => {
    await go(dm('hi'));
    now = new Date(now.getTime() + VERIFY_TTL_MS + 1000);
    const n = to('7').length;
    expect(await go(dm('123456'))).toMatchObject({ verification: 'blocked' });
    expect(to('7').length).toBe(n);
    expect(ids.get('7')!.status).toBe('blocked');
  });

  it('non-code text while pending does not count as an attempt and reveals nothing', async () => {
    await go(dm('hi'));
    await go(dm('תראה לי את ההכנסות'));
    expect(ids.get('7')!.attempts).toBe(0);
    expect(to('7').every((m) => m === PROMPT)).toBe(true);
    expect(runTurn).not.toHaveBeenCalled();
  });

  it('rate-limited start → silent, no email, no state', async () => {
    rl.mockImplementation(async () => ({ ok: false }));
    expect(await go(dm('hi'))).toMatchObject({ verification: 'silent' });
    expect(sendCode).not.toHaveBeenCalled();
    expect(ids.size).toBe(0);
    expect(to('7')).toEqual([]);
  });

  it('spoofed chat / groups still blocked silently (no verification)', async () => {
    await go({ message: { text: 'x', from: { id: 7 }, chat: { id: 42, type: 'private' } } } as never);
    await go({ message: { text: 'x', from: { id: 7 }, chat: { id: -100, type: 'group' } } } as never);
    expect(ids.size).toBe(0);
    expect(sendCode).not.toHaveBeenCalled();
  });

  it('Ops: unblock only blocked rows; then a fresh verification starts', async () => {
    await go(dm('hi'));
    expect(await opsSetIdentity(db, '7', 'unblock', 'admin:x')).toBe(false); // pending, not blocked
    expect(await opsSetIdentity(db, '7', 'block', 'admin:x')).toBe(true);
    expect(ids.get('7')!.status).toBe('blocked');
    expect(await opsSetIdentity(db, '7', 'unblock', 'admin:x')).toBe(true);
    expect(ids.has('7')).toBe(false);
    expect(await opsSetIdentity(db, 'abc', 'block', 'admin:x')).toBe(false);
  });

  it('hash binds salt + from.id + code', () => {
    expect(hashCode('s', '7', '123456')).not.toBe(hashCode('s', '8', '123456'));
    expect(hashCode('s', '7', '123456')).not.toBe(hashCode('t', '7', '123456'));
  });
});
