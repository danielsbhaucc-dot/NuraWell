import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  AI_MODELS: { background_groq: 'openai/gpt-oss-20b', background_groq_strong: 'openai/gpt-oss-120b', empathy: 'openai/gpt-5-mini' },
  deepseek: {}, groq: {}, openrouter: {},
}));
vi.mock('@/lib/admin/business-metrics', () => ({ buildBusinessMetrics: vi.fn(async () => ({ mrrIls: 0 })) }));
vi.mock('@/lib/api/rate-limit', () => ({ consumeRateLimit: vi.fn(async () => ({ ok: true })) }));

import { fallbackShabbat, holyWindows, quietState, resolveUntil, DEFAULT_SHABBAT, type OwnerPref } from '@/lib/ceo/quiet';
import { composeHeld, createDbGate, decideOutbound, flushOutbox, _resetPrefsCache } from '@/lib/ceo/outbound';
import { savePref, listPrefs } from '@/lib/ceo/prefs';
import { createTelegramChannel } from '@/lib/ceo/telegram';
import { guardPromise, runCeoTurn } from '@/lib/ceo/agent';

/** In-memory Supabase fake with the filters these modules use. */
function fakeDb(seed: Record<string, Record<string, unknown>[]> = {}) {
  const t: Record<string, Record<string, unknown>[]> = { ceo_audit_log: [], ceo_conversations: [], ceo_pending_actions: [], gideon_owner_prefs: [], gideon_outbox: [], ...seed };
  let seq = 0;
  const from = (name: string) => {
    const filters: ((r: Record<string, unknown>) => boolean)[] = [];
    let op: 'select' | 'update' | 'insert' | 'upsert' | 'delete' = 'select';
    let payload: Record<string, unknown> = {};
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain, order: chain, limit: chain, neq: chain,
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), b),
      lt: (k: string, v: string) => (filters.push((r) => r[k] != null && String(r[k]) < v), b),
      gt: (k: string, v: string) => (filters.push((r) => String(r[k]) > v), b),
      gte: (k: string, v: unknown) => (filters.push((r) => (r[k] as number) >= (v as number)), b),
      update: (p: Record<string, unknown>) => ((op = 'update'), (payload = p), b),
      insert: (p: Record<string, unknown>) => ((op = 'insert'), (payload = p), b),
      upsert: (p: Record<string, unknown>) => ((op = 'upsert'), (payload = p), b),
      delete: () => ((op = 'delete'), b),
      exec() {
        const rows = (t[name] ??= []);
        if (op === 'insert') {
          const r = { id: name === 'gideon_outbox' ? ++seq : `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, created_at: new Date(Date.UTC(2026, 9, 16, 18, 0, seq)).toISOString(), status: name === 'gideon_outbox' ? 'held' : 'pending', active: true, ...payload };
          rows.push(r);
          return [r];
        }
        if (op === 'upsert') {
          const k = 'chat_key' in payload ? 'chat_key' : 'id';
          const prev = rows.find((r) => r[k] === payload[k]);
          if (prev) Object.assign(prev, payload);
          else rows.push({ ...payload });
          return [payload];
        }
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (op === 'update') hit.forEach((r) => Object.assign(r, payload));
        if (op === 'delete') t[name] = rows.filter((r) => !hit.includes(r));
        return hit;
      },
    });
    b.single = b.maybeSingle = async () => ({ data: (b.exec as () => unknown[])()[0] ?? null, error: null });
    b.then = (res: (v: unknown) => void, rej?: (e: unknown) => void) => {
      try {
        res({ data: (b.exec as () => unknown[])(), error: null });
      } catch (e) {
        rej?.(e);
      }
    };
    return b;
  };
  return { t, db: { from, rpc: async () => ({ data: {}, error: null }) } as never };
}

const SHABBAT: OwnerPref = { id: 'sh', kind: 'shabbat', label: 'שבת', params: { ...DEFAULT_SHABBAT }, active: true };
// The incident: Fri 16/10/2026. Candle lighting Jerusalem (40 min) 17:26 IL, tzeit 18:41 IL on Sat 17/10.
const FRI_21_IL = new Date('2026-10-16T18:00:00Z'); // the daily digest that was sent on Shabbat
const SAT_NOON_IL = new Date('2026-10-17T09:00:00Z');
const SAT_21_IL = new Date('2026-10-17T18:00:00Z'); // weekly summary — after tzeit, as Daniel asked
const tg = () => vi.fn(async () => new Response('{"ok":true}'));
const bodies = (f: ReturnType<typeof tg>) => f.mock.calls.map((c) => JSON.parse(String(((c as unknown[])[1] as { body: string }).body)));

beforeEach(() => {
  process.env.CEO_TELEGRAM_ALLOWED_CHAT_IDS = '42';
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  _resetPrefsCache();
});

describe('Shabbat / Yom Tov time calc', () => {
  it('computes the 16-17/10/2026 Shabbat for Jerusalem (candle lighting → tzeit)', () => {
    const [w] = holyWindows(new Date('2026-10-15T00:00:00Z'), new Date('2026-10-18T00:00:00Z'));
    expect(w.start.toISOString()).toBe('2026-10-16T14:26:00.000Z');
    expect(w.end.toISOString()).toBe('2026-10-17T15:41:00.000Z');
    expect(w.reason).toBe('shabbat');
  });
  it('merges Rosh Hashana (Fri-Sat) into one window and covers Yom Kippur', () => {
    const ws = holyWindows(new Date('2026-09-10T00:00:00Z'), new Date('2026-09-23T00:00:00Z'));
    expect(ws.map((w) => [w.start.toISOString(), w.end.toISOString(), w.reason])).toEqual([
      ['2026-09-11T15:10:00.000Z', '2026-09-13T16:24:00.000Z', 'shabbat'],
      ['2026-09-18T15:01:00.000Z', '2026-09-19T16:16:00.000Z', 'shabbat'],
      ['2026-09-20T14:58:00.000Z', '2026-09-21T16:14:00.000Z', 'yom_tov'],
    ]);
  });
  it('Shabbat-only mode ignores weekday Yom Tov and ends Shabbat at Saturday tzeit', () => {
    const ws = holyWindows(new Date('2026-09-10T00:00:00Z'), new Date('2026-09-23T00:00:00Z'), { ...DEFAULT_SHABBAT, yom_tov: false });
    expect(ws.map((w) => w.start.toISOString())).toEqual(['2026-09-11T15:10:00.000Z', '2026-09-18T15:01:00.000Z']);
    expect(ws[0].end.toISOString()).toBe('2026-09-12T16:26:00.000Z');
  });
  it('candle-lighting minutes and city change the start; summer and winter (DST) both work', () => {
    const tlv = holyWindows(new Date('2026-10-15T00:00:00Z'), new Date('2026-10-18T00:00:00Z'), { ...DEFAULT_SHABBAT, city: 'Tel Aviv', candle_mins: 20 })[0];
    expect(tlv.start.getTime()).toBeGreaterThan(Date.parse('2026-10-16T14:26:00Z'));
    const summer = holyWindows(new Date('2026-07-01T00:00:00Z'), new Date('2026-07-05T00:00:00Z'))[0];
    const winter = holyWindows(new Date('2026-12-01T00:00:00Z'), new Date('2026-12-06T00:00:00Z'))[0];
    for (const w of [summer, winter]) {
      const h = (d: Date) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23' }).format(d));
      expect(h(w.start)).toBeGreaterThanOrEqual(15);
      expect(h(w.start)).toBeLessThanOrEqual(19);
      expect(h(w.end)).toBeGreaterThanOrEqual(16);
      expect(h(w.end)).toBeLessThanOrEqual(21);
    }
  });
  it('fallback window is conservative (Fri 16:00 → Sat 20:00 IL)', () => {
    const [w] = fallbackShabbat(new Date('2026-10-15T00:00:00Z'), new Date('2026-10-18T00:00:00Z'));
    expect(w.start.toISOString()).toBe('2026-10-16T13:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-10-17T17:00:00.000Z');
  });
  it('quietState: Friday 21:00 is quiet until tzeit; Saturday 21:00 is not', () => {
    const q = quietState([SHABBAT], FRI_21_IL);
    expect(q.quiet && q.until.toISOString()).toBe('2026-10-17T15:41:00.000Z');
    expect(quietState([SHABBAT], SAT_21_IL).quiet).toBe(false);
    expect(quietState([{ ...SHABBAT, active: false }], FRI_21_IL).quiet).toBe(false);
  });
  it('quiet hours (overnight, IL time) chain into Shabbat', () => {
    const night: OwnerPref = { id: 'n', kind: 'quiet_hours', label: 'לילה', params: { from: '22:00', to: '08:00' }, active: true };
    const q = quietState([night], new Date('2026-10-19T20:30:00Z')); // Mon 23:30 IL
    expect(q.quiet && q.until.toISOString()).toBe('2026-10-20T05:00:00.000Z');
    expect(quietState([night], new Date('2026-10-20T06:00:00Z')).quiet).toBe(false);
    const chained = quietState([night, SHABBAT], new Date('2026-10-17T15:00:00Z')); // Sat 18:00 → tzeit, then 22:00?
    expect(chained.quiet && chained.until.toISOString()).toBe('2026-10-17T15:41:00.000Z');
  });
  it('resolveUntil end_of_shabbat = tzeit', () => {
    expect(resolveUntil('end_of_shabbat', new Date('2026-10-16T13:29:00Z'), [SHABBAT])?.toISOString()).toBe('2026-10-17T15:41:00.000Z');
  });
});

describe('enforcement at the send layer', () => {
  it('decide: replies always; digests held; security held by default, allowed by setting; muted topics dropped', () => {
    expect(decideOutbound([SHABBAT], { kind: 'reply' }, FRI_21_IL).action).toBe('send');
    expect(decideOutbound([SHABBAT], { kind: 'digest', topic: 'daily' }, FRI_21_IL)).toMatchObject({ action: 'hold', reason: 'shabbat' });
    expect(decideOutbound([SHABBAT], { kind: 'security' }, FRI_21_IL).action).toBe('hold');
    expect(decideOutbound([{ ...SHABBAT, params: { ...DEFAULT_SHABBAT, emergencies: 'allow' } }], { kind: 'security' }, FRI_21_IL).action).toBe('send');
    expect(decideOutbound([SHABBAT], { kind: 'digest', topic: 'weekly' }, SAT_21_IL).action).toBe('send');
    expect(decideOutbound([SHABBAT], {}, SAT_NOON_IL).action).toBe('hold'); // untyped = gated
    const mute: OwnerPref = { id: 'm', kind: 'mute_topic', label: 'בלי עדכון יומי', params: { topics: ['daily', 'security'] }, active: true };
    expect(decideOutbound([mute], { kind: 'digest', topic: 'daily' }, SAT_21_IL).action).toBe('drop');
    expect(decideOutbound([mute], { kind: 'security' }, SAT_21_IL).action).toBe('send'); // security can't be muted
  });

  it('regression 16/10: the Friday 21:00 digest is held, not sent; a direct reply still goes out', async () => {
    const { db, t } = fakeDb({ gideon_owner_prefs: [{ ...SHABBAT, id: 'p1' }] });
    const f = tg();
    const schedule = vi.fn(async () => null);
    const ch = createTelegramChannel(f as never, async () => 'tok', createDbGate(() => db, { now: () => FRI_21_IL, schedule }));
    await ch.send('42', '☀️ עדכון יומי', undefined, { kind: 'digest', topic: 'daily' });
    await ch.send('42', '📌 תזכורת', [[{ text: '✅', data: 'ceo:td:x' }], [{ text: 'FaceID', data: '', webApp: 'https://x' }]], { kind: 'reminder', topic: 'owner_tasks' });
    expect(f).not.toHaveBeenCalled();
    expect(t.gideon_outbox).toHaveLength(2);
    expect(t.gideon_outbox[0].deliver_after).toBe('2026-10-17T15:41:00.000Z');
    expect(t.gideon_outbox[1].buttons).toEqual([[{ text: '✅', data: 'ceo:td:x' }]]); // one-time Face ID buttons never held
    expect(schedule).toHaveBeenCalledWith(new Date('2026-10-17T15:41:00.000Z'));
    expect(t.ceo_audit_log.some((r) => r.event === 'outbound_held')).toBe(true);
    await ch.send('42', 'תשובה', undefined, { kind: 'reply' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('DB down during Shabbat: keeps the promise (not sent); outside Shabbat: sends', async () => {
    const f = tg();
    const boom = () => {
      throw new Error('no db');
    };
    await createTelegramChannel(f as never, async () => 'tok', createDbGate(boom, { now: () => SAT_NOON_IL })).send('42', 'x', undefined, { kind: 'alert' });
    expect(f).not.toHaveBeenCalled();
    await createTelegramChannel(f as never, async () => 'tok', createDbGate(boom, { now: () => new Date('2026-10-19T09:00:00Z') })).send('42', 'x', undefined, { kind: 'alert' });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('outbox flush', () => {
  it('does nothing while quiet; after tzeit sends ONE combined message and empties the outbox', async () => {
    const { db, t } = fakeDb({ gideon_owner_prefs: [{ ...SHABBAT, id: 'p1' }] });
    const gate = createDbGate(() => db, { now: () => FRI_21_IL, schedule: async () => null });
    const ch = createTelegramChannel(tg() as never, async () => 'tok', gate);
    await ch.send('42', 'עדכון א', undefined, { kind: 'digest', topic: 'weekly' });
    await ch.send('42', 'עדכון ב', [[{ text: '✅', data: 'ceo:td:x' }]], { kind: 'reminder' });
    const send = vi.fn(async () => {});
    expect(await flushOutbox(db, send, { now: SAT_NOON_IL })).toMatchObject({ sent: 0, quietUntil: '2026-10-17T15:41:00.000Z' });
    expect(send).not.toHaveBeenCalled();
    const r = await flushOutbox(db, send, { now: new Date('2026-10-17T15:42:00Z') });
    expect(r).toMatchObject({ sent: 1, messages: 2 });
    expect(send).toHaveBeenCalledTimes(1);
    const [chat, text, buttons] = send.mock.calls[0] as unknown as [string, string, unknown];
    expect(chat).toBe('42');
    expect(text).toContain('📬');
    expect(text).toContain('עדכון א');
    expect(text).toContain('עדכון ב');
    expect(buttons).toEqual([[{ text: '✅', data: 'ceo:td:x' }]]);
    expect(t.gideon_outbox).toHaveLength(0);
    expect(await flushOutbox(db, send, { now: new Date('2026-10-17T15:43:00Z') })).toMatchObject({ sent: 0, messages: 0 }); // idempotent
  });
  it('a failed delivery puts messages back on hold', async () => {
    const { db, t } = fakeDb({ gideon_outbox: [{ id: 1, chat_id: '42', kind: 'digest', text: 'x', buttons: null, status: 'held', created_at: '2026-10-16T18:00:00Z' }] });
    await flushOutbox(db, async () => { throw new Error('tg down'); }, { now: SAT_21_IL });
    expect(t.gideon_outbox[0].status).toBe('held');
  });
  it('single held message is delivered as-is', () => {
    expect(composeHeld([{ id: 1, chat_id: '42', kind: 'digest', topic: null, text: 'רק זה', buttons: null, created_at: '2026-10-16T18:00:00Z' }]).text).toBe('רק זה');
  });
});

describe('preferences store', () => {
  it('validates and saves; Gideon-made quiet windows let security alerts through', async () => {
    const { db, t } = fakeDb({ gideon_owner_prefs: [{ ...SHABBAT, id: 'p1', expires_at: null }] });
    await expect(savePref(db, { kind: 'quiet_hours', label: 'לילה', active: true }, 'gideon')).rejects.toThrow();
    await expect(savePref(db, { kind: 'mute_topic', label: 'שקט', active: true }, 'gideon')).rejects.toThrow();
    const q = await savePref(db, { kind: 'quiet_until', label: 'היום שבת', until: 'end_of_shabbat', active: true }, 'gideon', new Date('2026-10-16T13:29:00Z'));
    expect(q.params.until).toBe('2026-10-17T15:41:00.000Z');
    expect(q.params.emergencies).toBe('allow');
    expect(q.expires_at).toBe('2026-10-17T15:41:00.000Z');
    const n = await savePref(db, { kind: 'quiet_hours', label: 'לילה', from: '23:00', to: '07:00', active: true }, 'ops', new Date(), { emergencies: 'hold' });
    expect(n.params).toMatchObject({ from: '23:00', to: '07:00', emergencies: 'hold' });
    // Shabbat: single row, Gideon can't change its emergencies policy
    await savePref(db, { kind: 'shabbat', label: 'בלי הודעות בשבת', active: true, yom_tov: false }, 'gideon');
    expect(t.gideon_owner_prefs.filter((r) => r.kind === 'shabbat')).toHaveLength(1);
    expect(t.gideon_owner_prefs.find((r) => r.kind === 'shabbat')!.params).toMatchObject({ yom_tov: false, emergencies: 'hold' });
    expect((await listPrefs(db)).length).toBe(2); // the one-off quiet_until already expired (real clock)
  });
});

describe('Gideon may confirm only after the save succeeded', () => {
  const ASK = 'גדעון לא לדוח לי הודעה היום, זה שבת'; // Daniel's exact words on 16/10

  it('the 16/10 reply ("מובן. היום לא אשלח לך הודעות.") without a save is replaced by the honest truth', async () => {
    const { db, t } = fakeDb();
    const llm = vi.fn()
      .mockResolvedValueOnce({ message: { role: 'assistant', content: 'מובן. היום לא אשלח לך הודעות.' } })
      .mockResolvedValueOnce({ message: { role: 'assistant', content: 'סבבה, לא אשלח.' } });
    const r = await runCeoTurn(db, 'telegram:42', ASK, { complete: llm as never });
    expect(llm).toHaveBeenCalledTimes(2); // one corrective round
    const corr = (llm.mock.calls[1][0] as { messages: { role: string; content: string }[] }).messages.find((m) => m.role === 'system' && m.content.startsWith('בדיקת מערכת'))!;
    expect(corr.role).toBe('system');
    expect(corr.content).toContain('owner_pref_set');
    expect(r.text).toContain('לא הצלחתי לשמור');
    expect(r.text).not.toContain('סבבה');
    expect(t.gideon_owner_prefs).toHaveLength(0);
  });

  it('with a successful owner_pref_set the confirmation carries the enforced rule', async () => {
    const { db, t } = fakeDb();
    const llm = vi.fn()
      .mockResolvedValueOnce({ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'owner_pref_set', arguments: JSON.stringify({ kind: 'shabbat', label: 'לא לשלוח לי בשבת' }) } }] } })
      .mockResolvedValueOnce({ message: { role: 'assistant', content: 'סבבה, שמרתי.' } });
    const r = await runCeoTurn(db, 'telegram:42', ASK, { complete: llm as never });
    expect(t.gideon_owner_prefs).toHaveLength(1);
    expect(r.text).toContain('סבבה');
    expect(r.text).toContain('נשמר ונאכף');
    expect(r.text).toContain('שקט בשבת');
    expect(t.ceo_audit_log.some((x) => x.event === 'owner_pref_saved')).toBe(true);
  });

  it('a failed save + confirmation is overridden; unrelated questions are untouched', () => {
    expect(guardPromise(ASK, 'סגור 👍', [{ ok: false }])).toContain('לא הצלחתי לשמור');
    expect(guardPromise('מה היה בשבת?', 'בסדר, היו 3 משתמשים פעילים.', [])).toBe('בסדר, היו 3 משתמשים פעילים.');
    expect(guardPromise('תפסיק לשלוח לי את העדכון היומי', 'לא הבנתי, למה בדיוק הכוונה?', [])).toBe('לא הבנתי, למה בדיוק הכוונה?');
  });

  it('active rules are injected into every turn', async () => {
    const { db } = fakeDb({ gideon_owner_prefs: [{ ...SHABBAT, id: 'p1', expires_at: null }] });
    const llm = vi.fn().mockResolvedValueOnce({ message: { role: 'assistant', content: 'היי' } });
    await runCeoTurn(db, 'telegram:42', 'מה קורה', { complete: llm as never });
    const sys = (llm.mock.calls[0][0] as { messages: { role: string; content: string }[] }).messages[1].content;
    expect(sys).toContain('הוראות קבועות של דניאל');
    expect(sys).toContain('שקט בשבת');
  });
});
