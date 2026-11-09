import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/api/rate-limit', () => ({
  consumeRateLimit: vi.fn(async () => ({ ok: true, limit: 99, remaining: 98, resetAt: 0 })),
  rateLimitResponse: vi.fn(),
}));
import { createClient } from '@supabase/supabase-js';
import { __resetFieldCrypto, decryptValue, setDekStoreForTests } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { startSim, getSim, recordSimAttempt, endSim, simKind } from '@/lib/ceo/stranger-sim';
import { handleUnknownSender, opsSetIdentity, verifiedFromIds } from '@/lib/ceo/telegram-verify';
import { telegramIdBidx } from '@/lib/ceo/telegram-id-seal';
import { runTgPkIdBackfill, type PkIdWrite } from '@/lib/privacy/telegram-pk-id-backfill';

const DB = 'nurawell_stack_chain';
const SIM_CHAT = '9200111222';
const FROM_A = '9200333444';
const FROM_B = '9200555666';
const LEGACY_FROM = '9200777888';
const LEGACY_SIM = '9200999000';

function psql(sql: string): string {
  return execFileSync('psql', ['-h', '127.0.0.1', '-U', 'postgres', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-Atq'], {
    encoding: 'utf8', input: sql,
  }).trim();
}
function loadEnv() {
  for (const line of readFileSync('/workspace/local-lab-paired/secrets/next-a.env', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]] = m[2];
  }
}
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
function cleanup() {
  const keys = [
    ['gideon_stranger_sim', 'chat_id', 'chat_bidx', SIM_CHAT],
    ['gideon_stranger_sim', 'chat_id', 'chat_bidx', LEGACY_SIM],
    ['gideon_telegram_identities', 'from_id', 'from_bidx', FROM_A],
    ['gideon_telegram_identities', 'from_id', 'from_bidx', FROM_B],
    ['gideon_telegram_identities', 'from_id', 'from_bidx', LEGACY_FROM],
  ] as const;
  for (const [table, col, bcol, plain] of keys) {
    const b = telegramIdBidx(table, col, plain);
    if (table === 'gideon_stranger_sim') {
      psql(`delete from public.gideon_stranger_sim where chat_bidx='${b}' or chat_id='${plain}'`);
    } else {
      psql(`delete from public.gideon_telegram_identities where from_bidx='${b}' or from_id='${plain}'`);
    }
  }
}

describe('telegram PK id live SQL+handlers (mock transport only)', () => {
  beforeEach(() => {
    loadEnv();
    process.env.CEO_TELEGRAM_ALLOWED_CHAT_IDS = '42';
    __resetFieldCrypto();
    setDekStoreForTests(null);
    cleanup();
  });
  afterEach(() => cleanup());

  it('stranger_sim: seal+bidx upsert, attempt append via bidx, end; no plaintext at rest', async () => {
    const db = admin();
    await startSim(db, SIM_CHAT);
    const b = telegramIdBidx('gideon_stranger_sim', 'chat_id', SIM_CHAT);
    const stored = psql(`select (chat_id like 'enc:v2:%')||'|'||(chat_bidx is not null)||'|'||(position('${SIM_CHAT}' in chat_id)=0) from public.gideon_stranger_sim where chat_bidx='${b}'`);
    expect(stored).toBe('true|true|true');

    const sim = await getSim(db, SIM_CHAT);
    expect(sim?.chat_id).toBe(SIM_CHAT);
    await recordSimAttempt(db, sim!, 'text');
    await recordSimAttempt(db, sim!, 'command');
    expect(psql(`select jsonb_array_length(attempts) from public.gideon_stranger_sim where chat_bidx='${b}'`)).toBe('2');
    await startSim(db, SIM_CHAT);
    expect(psql(`select count(*) from public.gideon_stranger_sim where chat_bidx='${b}'`)).toBe('1');
    await endSim(db, SIM_CHAT);
    expect(psql(`select count(*) from public.gideon_stranger_sim where chat_bidx='${b}'`)).toBe('0');
    expect(simKind({ message: { text: '/x' } })).toBe('command');
  });

  it('identities: challenge/wrong/verify allowlist decrypt; concurrent attempt; ops denials; sealed at rest', async () => {
    const db = admin();
    const channel = { name: 'telegram', send: async () => {}, ack: async () => {} };
    const sendCode = async () => true;
    const now = () => new Date('2026-11-08T20:00:00Z');
    const dm = (text: string, id = FROM_A) => ({ message: { text, from: { id: Number(id) }, chat: { id: Number(id), type: 'private' } } });
    const b = telegramIdBidx('gideon_telegram_identities', 'from_id', FROM_A);

    expect(await handleUnknownSender(db as never, channel as never, dm('hi') as never, { sendCode, genCode: () => '654321', now })).toBe('prompted');
    expect(psql(`select (from_id like 'enc:v2:%')||'|'||(from_bidx is not null)||'|'||(position('${FROM_A}' in from_id)=0)||'|'||attempts||'|'||status from public.gideon_telegram_identities where from_bidx='${b}'`)).toBe('true|true|true|0|pending');

    expect(await handleUnknownSender(db as never, channel as never, dm('000000') as never, { sendCode, genCode: () => '654321', now })).toBe('wrong');
    expect(psql(`select attempts from public.gideon_telegram_identities where from_bidx='${b}'`)).toBe('1');

    const a1 = db.from('gideon_telegram_identities').update({ attempts: 2 }).eq('from_bidx', b).eq('status', 'pending').eq('attempts', 1).select('from_bidx');
    const a2 = db.from('gideon_telegram_identities').update({ attempts: 2 }).eq('from_bidx', b).eq('status', 'pending').eq('attempts', 1).select('from_bidx');
    const [r1, r2] = await Promise.all([a1, a2]);
    expect([r1.data?.length ?? 0, r2.data?.length ?? 0].filter((n) => n > 0).length).toBe(1);
    expect(psql(`select attempts from public.gideon_telegram_identities where from_bidx='${b}'`)).toBe('2');

    expect(await handleUnknownSender(db as never, channel as never, dm('654321') as never, { sendCode, genCode: () => '654321', now })).toBe('verified');
    const allow = await verifiedFromIds(db as never);
    expect(allow.has(FROM_A)).toBe(true);
    expect(allow.has(FROM_B)).toBe(false);

    expect(await opsSetIdentity(db as never, FROM_B, 'block', 'admin:test')).toBe(true);
    expect(psql(`select status||'|'||(from_id like 'enc:v2:%') from public.gideon_telegram_identities where from_bidx='${telegramIdBidx('gideon_telegram_identities', 'from_id', FROM_B)}'`)).toBe('blocked|true');
    expect(await opsSetIdentity(db as never, 'not-a-id', 'block', 'admin:test')).toBe(false);
    expect(await opsSetIdentity(db as never, FROM_B, 'allow', 'admin:test')).toBe(false); // blocked, not pending
  });

  it('legacy digit dry-run+apply backfill; idempotent; roundtrip decrypt; no plaintext left', async () => {
    const id = psql(`insert into public.gideon_telegram_identities (from_id, status, attempts) values ('${LEGACY_FROM}', 'blocked', 0) returning id`);
    const sid = psql(`insert into public.gideon_stranger_sim (chat_id, started_at, expires_at, attempts) values ('${LEGACY_SIM}', now(), now() + interval '30 minutes', '[]'::jsonb) returning id`);
    const write = async (w: PkIdWrite) => {
      const sql = `update public.${w.table} set ${w.valueCol}='${w.sealed.replace(/'/g, "''")}', ${w.bidxCol}='${w.bidx}' where id='${w.id}' and ${w.bidxCol} is null and ${w.valueCol}='${w.previous.replace(/'/g, "''")}' returning id`;
      return psql(sql) === w.id;
    };
    const sims = [{ id: sid, value: LEGACY_SIM, bidx: null as string | null }];
    const idents = [{ id, value: LEGACY_FROM, bidx: null as string | null }];
    expect(await runTgPkIdBackfill(sims, idents, write, false)).toMatchObject({ examined: 2, planned: 2, written: 0, aborted: false });
    expect(await runTgPkIdBackfill(sims, idents, write, true)).toMatchObject({ written: 2, aborted: false });
    expect(psql(`select (chat_id like 'enc:v2:%')||'|'||(chat_id='${LEGACY_SIM}') from public.gideon_stranger_sim where id='${sid}'`)).toBe('true|false');
    expect(psql(`select (from_id like 'enc:v2:%')||'|'||(from_id='${LEGACY_FROM}') from public.gideon_telegram_identities where id='${id}'`)).toBe('true|false');
    const cipher = psql(`select from_id from public.gideon_telegram_identities where id='${id}'`);
    expect(await decryptValue('gideon_telegram_identities', 'from_id', 'system:ops', SYSTEM_ROW, cipher)).toBe(LEGACY_FROM);
    const again = await runTgPkIdBackfill(
      [{ id: sid, value: psql(`select chat_id from public.gideon_stranger_sim where id='${sid}'`), bidx: psql(`select chat_bidx from public.gideon_stranger_sim where id='${sid}'`) }],
      [{ id, value: cipher, bidx: psql(`select from_bidx from public.gideon_telegram_identities where id='${id}'`) }],
      write,
      true,
    );
    expect(again).toMatchObject({ skipped: 2, written: 0, aborted: false });
  });
});
