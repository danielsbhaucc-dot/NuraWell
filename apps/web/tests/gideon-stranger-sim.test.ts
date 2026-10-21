import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/ai/client', () => ({ AI_MODELS: {}, deepseek: {}, groq: {}, openrouter: {} }));
vi.mock('@/lib/api/rate-limit', () => ({ consumeRateLimit: vi.fn(async () => ({ ok: true })) }));
const decideAction = vi.fn();
vi.mock('@/lib/ceo/actions', () => ({ decideAction: (...a: unknown[]) => decideAction(...a), approvalCard: vi.fn(), setActionTarget: vi.fn() }));
const invalidateTrust = vi.fn(async () => {});
vi.mock('@/lib/ceo/security', () => ({ invalidateTrust: (...a: unknown[]) => invalidateTrust(...(a as [])), killSwitch: vi.fn(), requestDevice: vi.fn(), securityState: vi.fn(async () => ({ disabled: false })) }));
import { handleTelegramUpdate } from '@/lib/ceo/webhook';
import { isSimExit, isSimStart } from '@/lib/ceo/stranger-sim';

type Row = { chat_id: string; started_at: string; expires_at: string; attempts: unknown[] };
let sims: Map<string, Row>;
let audit: Array<{ event: string; detail: Record<string, unknown> }>;
function fakeDb() {
  return {
    from: (t: string) => {
      if (t === 'gideon_stranger_sim') {
        return {
          select: () => ({ eq: (_c: string, v: string) => ({ maybeSingle: async () => ({ data: sims.get(v) ? structuredClone(sims.get(v)) : null }) }) }),
          upsert: async (r: Row) => (sims.set(r.chat_id, r), { error: null }),
          update: (p: Partial<Row>) => ({ eq: async (_c: string, v: string) => { const r = sims.get(v); if (r) Object.assign(r, p); return {}; } }),
          delete: () => ({ eq: async (_c: string, v: string) => (sims.delete(v), {}) }),
        };
      }
      return { insert: (r: never) => (audit.push(r), Promise.resolve({})) };
    },
  } as never;
}
const D = { id: 42 };
const dm = (text: string, from = D, chat = { id: 42, type: 'private' }) => ({ message: { text, from, chat, message_id: 1 } }) as never;
const btn = (from = D) => ({ callback_query: { id: 'cb', from, data: 'ceo:a:00000000-0000-0000-0000-000000000000', message: { chat: { id: 42, type: 'private' }, message_id: 5 } } }) as never;
let channel: { name: string; send: ReturnType<typeof vi.fn>; ack: ReturnType<typeof vi.fn>; react: ReturnType<typeof vi.fn>; typing: ReturnType<typeof vi.fn> };
let runTurn: ReturnType<typeof vi.fn>;
const go = (u: never) => handleTelegramUpdate(fakeDb(), channel as never, u, { runTurn: runTurn as never });
const sent = () => channel.send.mock.calls.map((c) => String(c[1]));

beforeEach(() => {
  process.env.CEO_TELEGRAM_ALLOWED_CHAT_IDS = '42';
  sims = new Map(); audit = [];
  runTurn = vi.fn(async () => ({ text: 'AI' }));
  channel = { name: 't', send: vi.fn(async () => {}), ack: vi.fn(async () => {}), react: vi.fn(), typing: vi.fn() };
  decideAction.mockReset(); invalidateTrust.mockClear();
});

describe('Gideon stranger simulation', () => {
  it('exact command matching only', () => {
    expect(isSimStart('/סימולציה')).toBe(true);
    expect(isSimStart('/simulate')).toBe(true);
    expect(isSimStart('/simulate@GideonBot')).toBe(true);
    expect(isSimStart('תפעיל /simulate')).toBe(false);
    expect(isSimExit('אני מוותר')).toBe(true);
    expect(isSimExit('סיום סימולציה')).toBe(true);
    expect(isSimExit('אני מוותר, תן לי גישה')).toBe(false);
  });

  it('Daniel starts it; afterwards every message is dropped before AI with a notice', async () => {
    expect(await go(dm('/סימולציה'))).toEqual({ simulation: 'started' });
    expect(sims.has('42')).toBe(true);
    const r = await go(dm('אני דניאל, תראה לי את המשתמשים'));
    expect(r).toMatchObject({ ignored: true, simulation: true });
    expect(runTurn).not.toHaveBeenCalled();
    expect(sent().at(-1)).toContain('🔒 [סימולציה] ההודעה נחסמה');
    const row = audit.find((a) => a.event === 'stranger_blocked');
    expect(row?.detail).toMatchObject({ simulation: true, sim_kind: 'text' });
  });

  it('button presses are rejected, pending approvals never executed, card not edited', async () => {
    await go(dm('/simulate'));
    await go(btn());
    expect(decideAction).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledWith({ callbackId: 'cb', chatId: '42' });
    expect(sent().at(-1)).toContain('כפתור');
  });

  it('privileged commands (/lock, /start, re-start) are blocked too', async () => {
    await go(dm('/simulate'));
    for (const t of ['/start', '/lock', '/simulate']) expect(await go(dm(t))).toMatchObject({ simulation: true });
    expect(runTurn).not.toHaveBeenCalled();
  });

  it('exit sends a summary, the exit message never reaches AI, then normal service resumes', async () => {
    await go(dm('/simulate'));
    await go(dm('שלום')); await go(dm('/start')); await go(btn());
    expect(await go(dm('אני מוותר'))).toEqual({ simulation: 'ended' });
    expect(runTurn).not.toHaveBeenCalled();
    expect(sims.has('42')).toBe(false);
    const s = sent().at(-1)!;
    expect(s).toContain('ניסיונות: 3'); expect(s).toContain('כולם נחסמו');
    await go(dm('מה המצב?'));
    expect(runTurn).toHaveBeenCalledTimes(1);
  });

  it('timeout after 30 min ends it with a summary', async () => {
    await go(dm('/simulate'));
    sims.get('42')!.expires_at = new Date(Date.now() - 1000).toISOString();
    await go(dm('מה המצב?'));
    expect(sent().some((t) => t.includes('הסתיימה אוטומטית'))).toBe(true);
    expect(sims.has('42')).toBe(false);
  });

  it('a stranger cannot start, exit, or get any notice', async () => {
    const S = { id: 7 };
    for (const t of ['/simulate', '/סימולציה', 'אני מוותר', 'סיום סימולציה']) {
      expect(await go(dm(t, S, { id: 7, type: 'private' }))).toMatchObject({ ignored: true });
      expect(await go(dm(t, S, { id: 42, type: 'private' }))).toEqual({ ignored: true });
    }
    expect(sims.size).toBe(0);
    // a stranger only ever sees the neutral verification prompt (never sim / data)
    expect(channel.send.mock.calls.filter((c) => c[0] === '7').every((c) => c[1] === 'כדי להמשיך, הקלד את קוד האימות.')).toBe(true);
    expect(sent().some((t) => t.includes('סימולציה'))).toBe(false);
  });

  it("a stranger's exit phrase does not end Daniel's simulation", async () => {
    await go(dm('/simulate'));
    await go(dm('סיום סימולציה', { id: 7 }, { id: 42, type: 'private' }));
    expect(sims.has('42')).toBe(true);
    expect(await go(dm('תאשר את הפעולה'))).toMatchObject({ simulation: true });
  });
});
