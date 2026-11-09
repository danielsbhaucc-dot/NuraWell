/**
 * Nonempty legacy → 255–257 + backfill proof on isolated DB nurawell_pk_legacy_proof (PostgREST :3003).
 * Mock transport only. Does not touch main lab PostgREST :3002 / prod.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/api/rate-limit', () => ({
  consumeRateLimit: vi.fn(async () => ({ ok: true, limit: 99, remaining: 98, resetAt: 0 })),
  rateLimitResponse: vi.fn(),
}));
import { createClient } from '@supabase/supabase-js';
import { __resetFieldCrypto, decryptValue, setDekStoreForTests } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { startSim, getSim, recordSimAttempt, endSim } from '@/lib/ceo/stranger-sim';
import { handleUnknownSender, opsSetIdentity, verifiedFromIds } from '@/lib/ceo/telegram-verify';
import { telegramIdBidx, sealTelegramId } from '@/lib/ceo/telegram-id-seal';
import { runTgPkIdBackfill, type PkIdWrite } from '@/lib/privacy/telegram-pk-id-backfill';

const DB = 'nurawell_pk_legacy_proof';
const REST = 'http://127.0.0.1:5999';
const LEGACY_SIM = ['9300111001', '9300111002'] as const;
const LEGACY_ALLOWED = '9300222001';
const LEGACY_PENDING = '9300222002';
const LEGACY_BLOCKED = '9300222003';

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
  process.env.NEXT_PUBLIC_SUPABASE_URL = REST;
  process.env.CEO_TELEGRAM_ALLOWED_CHAT_IDS = '42';
}
function admin() {
  return createClient(REST, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
function loadRows(): { sims: { id: string; value: string; bidx: string | null }[]; idents: { id: string; value: string; bidx: string | null }[] } {
  const simLines = psql("select id::text || chr(9) || chat_id || chr(9) || coalesce(chat_bidx, '') || chr(9) || jsonb_array_length(attempts)::text from gideon_stranger_sim order by chat_id").split('\n').filter(Boolean);
  const idLines = psql("select id::text || chr(9) || from_id || chr(9) || coalesce(from_bidx, '') || chr(9) || status || chr(9) || attempts::text from gideon_telegram_identities order by from_id").split('\n').filter(Boolean);
  const sims = simLines.map((l) => {
    const [id, value, bidx] = l.split('\t');
    return { id, value, bidx: bidx ? bidx : null };
  });
  const idents = idLines.map((l) => {
    const [id, value, bidx] = l.split('\t');
    return { id, value, bidx: bidx ? bidx : null };
  });
  return { sims, idents };
}
function writeViaSql(w: PkIdWrite): boolean {
  const esc = (s: string) => s.replace(/'/g, "''");
  const out = psql(`update public.${w.table} set ${w.valueCol}='${esc(w.sealed)}', ${w.bidxCol}='${esc(w.bidx)}'
    where id='${esc(w.id)}' and ${w.bidxCol} is null and ${w.valueCol}='${esc(w.previous)}' and ${w.valueCol} not like 'enc:%' returning id`);
  return out === w.id;
}

describe('PK nonempty legacy upgrade proof (isolated DB :3003)', () => {
  beforeAll(() => {
    loadEnv();
    __resetFieldCrypto();
    setDekStoreForTests(null);
    expect(psql(`select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.gideon_stranger_sim'::regclass and contype='p'`)).toContain('PRIMARY KEY (id)');
    // Re-seed precise legacy digit rows (post-255 UUID PK shape) so suite is re-runnable
    psql(`
      truncate public.gideon_stranger_sim, public.gideon_telegram_identities;
      insert into public.gideon_stranger_sim (chat_id, started_at, expires_at, attempts) values
        ('9300111001', now() - interval '5 minutes', now() + interval '25 minutes',
         '[{"at":"2026-11-08T20:00:00Z","kind":"text"},{"at":"2026-11-08T20:01:00Z","kind":"command"},{"at":"2026-11-08T20:02:00Z","kind":"button"}]'::jsonb),
        ('9300111002', now() - interval '1 minutes', now() + interval '29 minutes',
         '[{"at":"2026-11-08T20:10:00Z","kind":"media"}]'::jsonb);
      insert into public.gideon_telegram_identities (from_id, status, code_hash, code_salt, expires_at, attempts, decided_at, decided_by, reason) values
        ('9300222001', 'allowed', null, null, null, 0, now() - interval '1 day', 'code', null),
        ('9300222002', 'pending', 'deadbeefcafebabe', 'saltsalt', now() + interval '8 minutes', 2, null, null, null),
        ('9300222003', 'blocked', null, null, null, 3, now() - interval '2 hours', 'system', 'enc:v2:reason_envelope_fixture_not_real_cipher_xxxxxxxxxxxx');
      update public.field_enc_enforcement set active=false where table_name in ('gideon_stranger_sim','gideon_telegram_identities');
    `);
    expect(psql(`select count(*) from gideon_stranger_sim where chat_id ~ '^\\d+$'`)).toBe('2');
    expect(psql(`select count(*) from gideon_telegram_identities where from_id ~ '^\\d+$'`)).toBe('3');
  });
  afterAll(() => {
    // leave proof DB intact for inspection; do not drop backups
  });

  it('constraints present: UNIQUE bidx + dual CHECK; enforcement still off', () => {
    expect(psql(`select count(*) from pg_constraint where conname='gideon_stranger_sim_chat_bidx_key'`)).toBe('1');
    expect(psql(`select count(*) from pg_constraint where conname='gideon_telegram_identities_from_bidx_key'`)).toBe('1');
    expect(psql(`select active::text from field_enc_enforcement where table_name='gideon_telegram_identities'`)).toBe('false');
    expect(psql(`select active::text from field_enc_enforcement where table_name='gideon_stranger_sim'`)).toBe('false');
  });

  it('backfill dry-run then apply; attempts+allowlist survive; no plaintext left; idempotent', async () => {
    const beforeAtt = psql(`select chat_id||':'||jsonb_array_length(attempts) from gideon_stranger_sim where chat_id in ('9300111001','9300111002') order by 1`);
    const beforeAllow = psql(`select from_id||':'||status||':'||attempts from gideon_telegram_identities order by from_id`);
    expect(beforeAtt).toContain('9300111001:3');
    expect(beforeAtt).toContain('9300111002:1');
    expect(beforeAllow).toContain('9300222001:allowed:0');
    expect(beforeAllow).toContain('9300222002:pending:2');
    expect(beforeAllow).toContain('9300222003:blocked:3');

    const { sims, idents } = loadRows();
    const plainSims = sims.filter((r) => /^\d+$/.test(r.value));
    const plainIdents = idents.filter((r) => /^\d+$/.test(r.value));
    expect(plainSims.length + plainIdents.length).toBeGreaterThanOrEqual(5);

    const dry = await runTgPkIdBackfill(plainSims, plainIdents, async (w) => writeViaSql(w), false);
    expect(dry).toMatchObject({ planned: plainSims.length + plainIdents.length, written: 0, aborted: false });

    const applied = await runTgPkIdBackfill(plainSims, plainIdents, async (w) => writeViaSql(w), true);
    expect(applied.aborted).toBe(false);
    expect(applied.written).toBe(plainSims.length + plainIdents.length);

    // no digit plaintext in covered columns
    expect(psql(`select count(*) from gideon_stranger_sim where chat_id ~ '^\\d+$'`)).toBe('0');
    expect(psql(`select count(*) from gideon_telegram_identities where from_id ~ '^\\d+$'`)).toBe('0');
    expect(psql(`select count(*) from gideon_stranger_sim where chat_id like 'enc:v2:%' and chat_bidx is not null`)).toBe(String(plainSims.length));
    expect(psql(`select count(*) from gideon_telegram_identities where from_id like 'enc:v2:%' and from_bidx is not null`)).toBe(String(plainIdents.length));

    // attempts + status membership survived (keyed by bidx / decrypt)
    for (const chat of LEGACY_SIM) {
      const b = telegramIdBidx('gideon_stranger_sim', 'chat_id', chat);
      const n = psql(`select jsonb_array_length(attempts) from gideon_stranger_sim where chat_bidx='${b}'`);
      expect(n).toBe(chat === '9300111001' ? '3' : '1');
      const cipher = psql(`select chat_id from gideon_stranger_sim where chat_bidx='${b}'`);
      expect(await decryptValue('gideon_stranger_sim', 'chat_id', 'system:ops', SYSTEM_ROW, cipher)).toBe(chat);
    }
    const allowB = telegramIdBidx('gideon_telegram_identities', 'from_id', LEGACY_ALLOWED);
    expect(psql(`select status||':'||attempts from gideon_telegram_identities where from_bidx='${allowB}'`)).toBe('allowed:0');
    const pendB = telegramIdBidx('gideon_telegram_identities', 'from_id', LEGACY_PENDING);
    expect(psql(`select status||':'||attempts from gideon_telegram_identities where from_bidx='${pendB}'`)).toBe('pending:2');
    const blkB = telegramIdBidx('gideon_telegram_identities', 'from_id', LEGACY_BLOCKED);
    expect(psql(`select status||':'||attempts from gideon_telegram_identities where from_bidx='${blkB}'`)).toBe('blocked:3');
    // reason envelope preserved on blocked
    expect(psql(`select reason like 'enc:v2:%' from gideon_telegram_identities where from_bidx='${blkB}'`)).toBe('t');

    const again = await runTgPkIdBackfill(loadRows().sims, loadRows().idents, async (w) => writeViaSql(w), true);
    expect(again).toMatchObject({ written: 0, aborted: false });
    expect(again.skipped).toBeGreaterThanOrEqual(5);
  }, 120_000);

  it('simulated abort mid-backfill leaves sealed rows consistent; resume finishes rest', async () => {
    // Re-seed one fresh legacy digit row (enforcement off)
    const EXTRA = '9300333001';
    psql(`delete from gideon_telegram_identities where from_id='${EXTRA}' or from_bidx='${telegramIdBidx('gideon_telegram_identities', 'from_id', EXTRA)}'`);
    const id = psql(`insert into gideon_telegram_identities (from_id, status, attempts) values ('${EXTRA}', 'allowed', 0) returning id`);
    const EXTRA2 = '9300333002';
    psql(`delete from gideon_telegram_identities where from_id='${EXTRA2}' or from_bidx='${telegramIdBidx('gideon_telegram_identities', 'from_id', EXTRA2)}'`);
    const id2 = psql(`insert into gideon_telegram_identities (from_id, status, attempts) values ('${EXTRA2}', 'allowed', 1) returning id`);

    let writes = 0;
    const abortingWrite = async (w: PkIdWrite) => {
      if (writes >= 1) return false; // abort after first success
      const ok = writeViaSql(w);
      if (ok) writes += 1;
      return ok;
    };
    const rows = [
      { id, value: EXTRA, bidx: null as string | null },
      { id: id2, value: EXTRA2, bidx: null as string | null },
    ];
    const aborted = await runTgPkIdBackfill([], rows, abortingWrite, true);
    expect(aborted.aborted).toBe(true);
    expect(aborted.written).toBe(1);
    // one sealed, one still plain — no half-row (bidx without seal or seal without bidx)
    const mixed = psql(`select count(*) from gideon_telegram_identities where id in ('${id}','${id2}') and ((from_id like 'enc:v2:%') <> (from_bidx is not null))`);
    expect(mixed).toBe('0');
    // resume completes
    const resumeRows = [
      { id, value: psql(`select from_id from gideon_telegram_identities where id='${id}'`), bidx: psql(`select coalesce(from_bidx,'') from gideon_telegram_identities where id='${id}'`) || null },
      { id: id2, value: psql(`select from_id from gideon_telegram_identities where id='${id2}'`), bidx: psql(`select coalesce(from_bidx,'') from gideon_telegram_identities where id='${id2}'`) || null },
    ].map((r) => ({ ...r, bidx: r.bidx === '' || r.bidx === null ? null : r.bidx }));
    const resumed = await runTgPkIdBackfill([], resumeRows, async (w) => writeViaSql(w), true);
    expect(resumed.aborted).toBe(false);
    expect(psql(`select count(*) from gideon_telegram_identities where id in ('${id}','${id2}') and from_id like 'enc:v2:%' and from_bidx is not null`)).toBe('2');
    expect(psql(`select status||':'||attempts from gideon_telegram_identities where from_bidx='${telegramIdBidx('gideon_telegram_identities', 'from_id', EXTRA2)}'`)).toBe('allowed:1');
  }, 90_000);

  it('PostgREST upsert concurrent on chat_bidx: single row; handlers mock transport; wrong key deny', async () => {
    const db = admin();
    const CHAT = '9300444001';
    const FROM = '9300444002';
    // cleanup
    for (const [table, col, bcol, plain] of [
      ['gideon_stranger_sim', 'chat_id', 'chat_bidx', CHAT],
      ['gideon_telegram_identities', 'from_id', 'from_bidx', FROM],
    ] as const) {
      const b = telegramIdBidx(table, col, plain);
      psql(`delete from public.${table} where ${bcol}='${b}'`);
    }

    const b = telegramIdBidx('gideon_stranger_sim', 'chat_id', CHAT);
    await startSim(db, CHAT);
    // concurrent upserts same bidx
    const s1 = sealTelegramId('gideon_stranger_sim', 'chat_id', CHAT);
    const s2 = sealTelegramId('gideon_stranger_sim', 'chat_id', CHAT);
    const [{ sealed: c1, bidx: b1 }, { sealed: c2, bidx: b2 }] = await Promise.all([s1, s2]);
    expect(b1).toBe(b2);
    const u1 = db.from('gideon_stranger_sim').upsert({ chat_id: c1, chat_bidx: b1, started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 1e6).toISOString(), attempts: [] }, { onConflict: 'chat_bidx' });
    const u2 = db.from('gideon_stranger_sim').upsert({ chat_id: c2, chat_bidx: b2, started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 1e6).toISOString(), attempts: [] }, { onConflict: 'chat_bidx' });
    const [r1, r2] = await Promise.all([u1, u2]);
    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();
    expect(psql(`select count(*) from gideon_stranger_sim where chat_bidx='${b}'`)).toBe('1');
    expect(psql(`select chat_id like 'enc:v2:%' and position('${CHAT}' in chat_id)=0 from gideon_stranger_sim where chat_bidx='${b}'`)).toBe('t');

    const sim = await getSim(db, CHAT);
    expect(sim?.chat_id).toBe(CHAT);
    await recordSimAttempt(db, sim!, 'text');
    expect(psql(`select jsonb_array_length(attempts) from gideon_stranger_sim where chat_bidx='${b}'`)).toBe('1');

    // identity challenge via handler (mock send)
    const channel = { name: 'telegram', send: async () => {}, ack: async () => {} };
    const dm = (text: string) => ({ message: { text, from: { id: Number(FROM) }, chat: { id: Number(FROM), type: 'private' } } });
    const now = () => new Date('2026-11-08T21:00:00Z');
    expect(await handleUnknownSender(db as never, channel as never, dm('hi') as never, { sendCode: async () => true, genCode: () => '111222', now })).toBe('prompted');
    const fb = telegramIdBidx('gideon_telegram_identities', 'from_id', FROM);
    expect(psql(`select status||'|'||attempts||'|'||(from_id like 'enc:v2:%') from gideon_telegram_identities where from_bidx='${fb}'`)).toBe('pending|0|true');
    expect(await handleUnknownSender(db as never, channel as never, dm('000000') as never, { sendCode: async () => true, genCode: () => '111222', now })).toBe('wrong');
    expect(psql(`select attempts from gideon_telegram_identities where from_bidx='${fb}'`)).toBe('1');
    // concurrent atomic attempt
    const a1 = db.from('gideon_telegram_identities').update({ attempts: 2 }).eq('from_bidx', fb).eq('status', 'pending').eq('attempts', 1).select('from_bidx');
    const a2 = db.from('gideon_telegram_identities').update({ attempts: 2 }).eq('from_bidx', fb).eq('status', 'pending').eq('attempts', 1).select('from_bidx');
    const [x1, x2] = await Promise.all([a1, a2]);
    expect([x1.data?.length ?? 0, x2.data?.length ?? 0].filter((n) => n > 0).length).toBe(1);

    expect(await handleUnknownSender(db as never, channel as never, dm('111222') as never, { sendCode: async () => true, genCode: () => '111222', now })).toBe('verified');
    const allow = await verifiedFromIds(db as never);
    expect(allow.has(FROM)).toBe(true);
    expect(allow.has(LEGACY_ALLOWED)).toBe(true); // prior legacy allowlist still decrypts

    // wrong/missing key: corrupt ciphertext → decrypt fails closed; ops deny invalid id before mutation
    const beforeCorrupt = psql(`select status from gideon_telegram_identities where from_bidx='${fb}'`);
    psql(`update gideon_telegram_identities set from_id='enc:v2:NOT_A_REAL_CIPHER_VALUE_xxxxxxxxxxxx' where from_bidx='${fb}'`);
    const allowAfter = await verifiedFromIds(db as never);
    expect(allowAfter.has(FROM)).toBe(false); // missing/wrong key → not in allowlist
    expect(await opsSetIdentity(db as never, 'not-digits', 'block', 'admin:proof')).toBe(false);
    expect(psql(`select status from gideon_telegram_identities where from_bidx='${fb}'`)).toBe(beforeCorrupt); // no mutation from invalid ops

    await endSim(db, CHAT);
    expect(psql(`select count(*) from gideon_stranger_sim where chat_bidx='${b}'`)).toBe('0');
  }, 120_000);
});
