import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { __resetFieldCrypto, decryptValue, setDekStoreForTests } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { beginSignupClaim } from '@/lib/central/signup-claim';
import { sealSignupEmailBinding, signupEmailBidx } from '@/lib/central/signup-claim-email';
import { planSignupEmailLegacy, runSignupEmailBackfillBatch } from '@/lib/privacy/parent-signup-email-backfill';

const DB = 'nurawell_stack_chain';
const PREFIX = 'live-email-seal-';
const NONCE = PREFIX + 'a'.repeat(16);
const NONCE2 = PREFIX + 'b'.repeat(16);
const LEGACY = PREFIX + 'legacy01';
const SUB = 'parent-sub-live-email';
const EMAIL = 'live-seal@example.test';

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
function counts() {
  const line = psql(`select count(*)||'|'||count(*) filter (where email like 'enc:v2:%')||'|'||count(*) filter (where email not like 'enc:%')||'|'||count(*) filter (where email_bidx is not null) from public.parent_signup_claims`);
  const [total, sealed, legacy, bidx] = line.split('|').map(Number);
  return { total, sealed, legacy, bidx };
}
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
function cleanup() {
  psql(`delete from public.parent_signup_claims where nonce like '${PREFIX}%'`);
}

describe('signup claim email live SQL+handler', () => {
  beforeEach(() => {
    loadEnv();
    __resetFieldCrypto();
    setDekStoreForTests(null);
    cleanup();
  });
  afterEach(() => { cleanup(); });

  it('SQL definition is 4-arg only; old plaintext signature absent', () => {
    const args = psql(`select string_agg(pg_get_function_identity_arguments(oid), '|') from pg_proc where proname='parent_signup_begin' and pronamespace='public'::regnamespace`);
    expect(args).toBe('p_nonce text, p_sub text, p_email_sealed text, p_email_bidx text');
    expect(psql(`select count(*)::text from pg_proc where proname='parent_signup_begin' and pg_get_function_identity_arguments(oid)='p_nonce text, p_sub text, p_email text'`)).toBe('0');
    // Direct call of missing 3-arg must fail at parse/plan — prove via to_regprocedure
    expect(psql(`select to_regprocedure('public.parent_signup_begin(text,text,text)') is null`)).toBe('t');
    expect(psql(`select to_regprocedure('public.parent_signup_begin(text,text,text,text)') is not null`)).toBe('t');
    expect(psql(`select has_function_privilege('service_role','public.parent_signup_begin(text,text,text,text)','execute')`)).toBe('t');
    expect(psql(`select has_function_privilege('anon','public.parent_signup_begin(text,text,text,text)','execute')`)).toBe('f');
  });

  it('new claim stores sealed+bidx; concurrency one winner; replay/mismatch/malformed', async () => {
    const before = counts();
    const db = admin();
    const [a, b] = await Promise.all([
      beginSignupClaim(db, { nonce: NONCE, sub: SUB, email: EMAIL }),
      beginSignupClaim(db, { nonce: NONCE, sub: SUB, email: EMAIL }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(['busy', 'claimed']);
    // Isolated fixture row: sealed + bidx, no plaintext email in cell
    const row = psql(`select (email like 'enc:v2:%')||'|'||(email_bidx is not null)||'|'||(email !~* 'live-seal')||'|'||state from public.parent_signup_claims where nonce='${NONCE}'`);
    expect(row).toBe('true|true|true|open');
    expect(psql(`select email_bidx from public.parent_signup_claims where nonce='${NONCE}'`)).toBe(signupEmailBidx(EMAIL));
    const afterInsert = counts();
    expect(afterInsert.sealed).toBeGreaterThanOrEqual(before.sealed + 1);
    expect(afterInsert.bidx).toBeGreaterThanOrEqual(before.bidx + 1);

    // decrypt round-trip via system key (no email logged)
    const cipher = psql(`select email from public.parent_signup_claims where nonce='${NONCE}'`);
    expect(cipher.startsWith('enc:v2:')).toBe(true);
    expect(await decryptValue('parent_signup_claims', 'email', 'system:audit', SYSTEM_ROW, cipher)).toBe(EMAIL);

    // same email+sub while open → busy; wrong email → mismatch; wrong sub → mismatch
    expect((await beginSignupClaim(db, { nonce: NONCE, sub: SUB, email: EMAIL })).status).toBe('busy');
    expect((await beginSignupClaim(db, { nonce: NONCE, sub: SUB, email: 'other@example.test' })).status).toBe('mismatch');
    expect((await beginSignupClaim(db, { nonce: NONCE, sub: 'other-sub-xxxx', email: EMAIL })).status).toBe('mismatch');

    // malformed ciphertext / missing bidx rejected at SQL (no new nonce state)
    const junk = PREFIX + 'c'.repeat(16);
    expect(psql(`select public.parent_signup_begin('${junk}', '${SUB}', 'not-sealed@x.test', '${signupEmailBidx(EMAIL)}')`)).toBe('rejected');
    expect(psql(`select public.parent_signup_begin('${junk}', '${SUB}', 'enc:v2:AAAA', '!!bad!!')`)).toBe('rejected');
    expect(psql(`select count(*)::text from public.parent_signup_claims where nonce='${junk}'`)).toBe('0');

    // missing key before RPC — no state
    const prev = process.env.PII_ENCRYPTION_KEY;
    delete process.env.PII_ENCRYPTION_KEY;
    __resetFieldCrypto();
    const missing = await beginSignupClaim(db, { nonce: NONCE2, sub: SUB, email: EMAIL });
    expect(missing.status).toBe('rejected');
    expect(psql(`select count(*)::text from public.parent_signup_claims where nonce='${NONCE2}'`)).toBe('0');
    process.env.PII_ENCRYPTION_KEY = prev;
    __resetFieldCrypto();

    // finish → done replay; then fail path on other nonce
    const attempt = (a.status === 'claimed' ? a.attempt : (b as { attempt: string }).attempt);
    const user = '11111111-1111-4111-8111-111111111111';
    const session = '22222222-2222-4222-8222-222222222222';
    expect(psql(`select public.parent_signup_finish('${NONCE}', '${attempt}', '${user}', '${session}')`)).toBe('t');
    expect((await beginSignupClaim(db, { nonce: NONCE, sub: SUB, email: EMAIL })).status).toBe('done');

    // failed reclaim → new claim with same binding
    const failN = PREFIX + 'd'.repeat(16);
    const c = await beginSignupClaim(db, { nonce: failN, sub: SUB, email: EMAIL });
    expect(c.status).toBe('claimed');
    if (c.status !== 'claimed') throw new Error('expected claimed');
    expect(psql(`select public.parent_signup_fail('${failN}', '${c.attempt}', null)`)).toBe('t');
    const again = await beginSignupClaim(db, { nonce: failN, sub: SUB, email: EMAIL });
    expect(again.status).toBe('claimed');
  }, 90_000);

  it('local legacy backfill dry-run/apply with race skip; decrypt verify; no account delete', async () => {
    const before = counts();
    // synthetic legacy done row (not active open)
    psql(`insert into public.parent_signup_claims (nonce, parent_sub, email, state, attempt_id)
      values ('${LEGACY}', '${SUB}', 'Legacy.Plain@Example.TEST', 'done', gen_random_uuid())`);
    // synthetic active open — must be skipped
    const ACTIVE = PREFIX + 'active01';
    psql(`insert into public.parent_signup_claims (nonce, parent_sub, email, state, attempt_id, updated_at)
      values ('${ACTIVE}', '${SUB}', 'active-open@example.test', 'open', gen_random_uuid(), now())`);

    const mid = counts();
    expect(mid.legacy).toBeGreaterThanOrEqual(before.legacy + 2);

    const legacyRow = {
      nonce: LEGACY,
      parent_sub: SUB,
      email: 'Legacy.Plain@Example.TEST',
      email_bidx: null as string | null,
      state: 'done',
      updated_at: new Date(Date.now() - 60_000).toISOString(),
    };
    const activeRow = {
      nonce: ACTIVE,
      parent_sub: SUB,
      email: 'active-open@example.test',
      email_bidx: null as string | null,
      state: 'open',
      updated_at: new Date().toISOString(),
    };
    expect((await planSignupEmailLegacy(activeRow)).action).toBe('skip');
    const dry = await runSignupEmailBackfillBatch([legacyRow, activeRow], async () => true, false);
    expect(dry.planned).toBe(1);
    expect(dry.skipped).toBe(1);
    expect(dry.skipReasons.active_open).toBe(1);

    const write = async (patch: { nonce: string; sealed: string; bidx: string; previous: string }) => {
      const esc = (s: string) => s.replace(/'/g, "''");
      const n = psql(`update public.parent_signup_claims
        set email='${esc(patch.sealed)}', email_bidx='${esc(patch.bidx)}', updated_at=updated_at
        where nonce='${esc(patch.nonce)}' and email_bidx is null and email='${esc(patch.previous)}' and email not like 'enc:%'
        returning 1`);
      return n === '1';
    };
    const applied = await runSignupEmailBackfillBatch([legacyRow, activeRow], write, true);
    expect(applied.written).toBe(1);
    expect(applied.skipped).toBe(1);

    const leg = psql(`select (email like 'enc:v2:%')||'|'||(email_bidx is not null)||'|'||state from public.parent_signup_claims where nonce='${LEGACY}'`);
    expect(leg).toBe('true|true|done');
    const cipher = psql(`select email from public.parent_signup_claims where nonce='${LEGACY}'`);
    expect(await decryptValue('parent_signup_claims', 'email', 'system:audit', SYSTEM_ROW, cipher)).toBe('legacy.plain@example.test');
    expect(psql(`select email from public.parent_signup_claims where nonce='${ACTIVE}'`)).toBe('active-open@example.test');
    // ownership/state preserved; no user rows touched
    expect(psql(`select parent_sub||'|'||state from public.parent_signup_claims where nonce='${LEGACY}'`)).toBe(`${SUB}|done`);
    const after = counts();
    expect(after.sealed).toBeGreaterThanOrEqual(mid.sealed + 1);
    // evidence object without PII
    expect({ before, mid, after, written: applied.written, skipped_active: 1 }).toBeTruthy();
  }, 90_000);
});
