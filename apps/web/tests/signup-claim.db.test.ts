import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Two OS processes share only Postgres. The nonce row, not an email map, decides who may mint.
 * Email args are opaque sealed + keyed bidx (000251); SQL never sees plaintext.
 */
const DB = 'nurawell_signup_claim';
const migration = join(process.cwd(), '../../supabase/migrations/000239_parent_signup_claim.sql');
const attempt = join(process.cwd(), '../../supabase/migrations/000241_parent_signup_attempt.sql');
const emailEnc = join(process.cwd(), '../../supabase/migrations/000251_parent_signup_email_ciphertext.sql');
const NONCE = 'n'.repeat(32);
const OTHER = 'm'.repeat(32);
const SUB = 'parent-sub-a';
/** Opaque tokens — not real ciphertext; RPC stores/compares without decrypting. */
const SEALED = 'enc:v2:' + 'A'.repeat(40);
const BIDX = 'MMBchBF2H_UhFgfWScSAJQ'; // 22-char base64url shape
const BIDX_OTHER = 'xxxxxxxxxxxxxxxxxxxxxx';

function psql(database: string, sql: string): string {
  return execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], {
    encoding: 'utf8',
  }).trim().split('\n').pop() ?? '';
}

function psqlScript(database: string, sql: string): void {
  execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', database, '-v', 'ON_ERROR_STOP=1'], {
    encoding: 'utf8',
    input: sql,
  });
}

function beginInProcess(nonce: string, sub: string, sealed: string, bidx: string): Promise<string> {
  const sql = `select public.parent_signup_begin('${nonce}', '${sub}', '${sealed}', '${bidx}')`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', `
      const {execFileSync}=require('node:child_process');
      const out=execFileSync('sudo',['-n','-u','postgres','psql','-d','${DB}','-v','ON_ERROR_STOP=1','-At','-c',process.argv[1]],{encoding:'utf8'});
      process.stdout.write(out.trim().split('\\n').pop()||'');
    `, sql], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.on('exit', (code) => code === 0 ? resolve(out.trim()) : reject(new Error('worker failed')));
  });
}

function begin(nonce: string, sub: string, sealed = SEALED, bidx = BIDX) {
  return psql(DB, `select public.parent_signup_begin('${nonce}', '${sub}', '${sealed}', '${bidx}')`);
}

describe('parent signup claim across processes', () => {
  it('lets one nonce mint once, refuses the other caller, and allows a failed retry', async () => {
    psql('postgres', `DROP DATABASE IF EXISTS ${DB}`);
    psql('postgres', `CREATE DATABASE ${DB}`);
    psqlScript(DB, readFileSync(migration, 'utf8'));
    psqlScript(DB, readFileSync(attempt, 'utf8'));
    psqlScript(DB, readFileSync(emailEnc, 'utf8'));
    psql(DB, `create schema if not exists auth; create table if not exists auth.sessions (id uuid primary key, user_id uuid)`);
    const [first, second] = await Promise.all([
      beginInProcess(NONCE, SUB, SEALED, BIDX),
      beginInProcess(NONCE, SUB, SEALED, BIDX),
    ]);
    const winner = [first, second].find((word) => word.startsWith('claimed:'));
    const loser = [first, second].find((word) => word === 'busy');
    expect(loser).toBe('busy');
    const attemptA = winner?.slice('claimed:'.length) ?? '';
    expect(attemptA).toMatch(/^[0-9a-f-]{36}$/);
    expect(begin(OTHER, SUB)).toMatch(/^claimed:/);
    expect(begin(NONCE, 'other-sub')).toBe('mismatch');
    expect(begin(NONCE, SUB, SEALED, BIDX_OTHER)).toBe('mismatch');
    // missing/invalid seal or bidx → rejected (no state)
    expect(psql(DB, `select public.parent_signup_begin('${'z'.repeat(32)}', '${SUB}', 'plaintext@x.test', '${BIDX}')`)).toBe('rejected');
    const user = '11111111-1111-4111-8111-111111111111';
    const session = '22222222-2222-4222-8222-222222222222';
    const otherTab = '33333333-3333-4333-8333-333333333333';
    psql(DB, `insert into auth.sessions (id, user_id) values ('${session}', '${user}'), ('${otherTab}', '${user}')`);
    expect(psql(DB, `select public.parent_signup_finish('${NONCE}', '${attemptA}', '${user}', '${session}')`)).toBe('t');
    expect(begin(NONCE, SUB)).toBe('done');
    expect(psql(DB, `select session_id::text from public.parent_signup_claims where nonce = '${NONCE}'`)).toBe(session);
    // stored email is sealed, not plaintext
    expect(psql(DB, `select email like 'enc:v2:%' from public.parent_signup_claims where nonce = '${NONCE}'`)).toBe('t');
    expect(psql(DB, `select email_bidx from public.parent_signup_claims where nonce = '${NONCE}'`)).toBe(BIDX);
    psql(DB, `update public.parent_signup_claims set updated_at = now() - interval '3 minutes', state = 'open', session_id = null where nonce = '${NONCE}'`);
    const reclaimed = begin(NONCE, SUB);
    const attemptB = reclaimed.slice('claimed:'.length);
    expect(attemptB).toMatch(/^[0-9a-f-]{36}$/);
    expect(attemptB).not.toBe(attemptA);
    const sessionB = '44444444-4444-4444-8444-444444444444';
    psql(DB, `insert into auth.sessions (id, user_id) values ('${sessionB}', '${user}')`);
    expect(psql(DB, `select public.parent_signup_note_user('${NONCE}', '${attemptB}', '${user}')`)).toBe('t');
    expect(psql(DB, `select public.parent_signup_finish('${NONCE}', '${attemptB}', '${user}', '${sessionB}')`)).toBe('t');
    expect(psql(DB, `select public.parent_signup_finish('${NONCE}', '${attemptA}', '${user}', '${session}')`)).toBe('f');
    expect(psql(DB, `select public.parent_signup_fail('${NONCE}', '${attemptA}', '${session}')`)).toBe('f');
    expect(psql(DB, `select session_id::text from public.parent_signup_claims where nonce = '${NONCE}'`)).toBe(sessionB);
    expect(psql(DB, `select count(*)::text from auth.sessions where id in ('${sessionB}', '${otherTab}')`)).toBe('2');
    const clean = 'p'.repeat(32);
    const owned = begin(clean, SUB);
    expect(owned.startsWith('claimed:')).toBe(true);
    const attemptOwned = owned.slice('claimed:'.length);
    expect(psql(DB, `select public.parent_signup_note_user('${clean}', '${attemptOwned}', '${user}')`)).toBe('t');
    expect(psql(DB, `select public.parent_signup_fail('${clean}', '${attemptOwned}', '${session}')`)).toBe('t');
    expect(psql(DB, `select count(*)::text from auth.sessions where id = '${session}'`)).toBe('0');
    expect(psql(DB, `select count(*)::text from auth.sessions where id = '${otherTab}'`)).toBe('1');
    expect(psql(DB, `select has_function_privilege('anon', 'public.parent_signup_fail(text,uuid,uuid)', 'execute')`)).toBe('f');
    expect(psql(DB, `select has_function_privilege('authenticated', 'public.parent_signup_begin(text,text,text,text)', 'execute')`)).toBe('f');
    expect(psql(DB, `select has_function_privilege('service_role', 'public.parent_signup_finish(text,uuid,uuid,uuid)', 'execute')`)).toBe('t');
    expect(psql(DB, `select relrowsecurity::text from pg_class where relname = 'parent_signup_claims'`)).toBe('true');
    const denied = psql(DB, `do $$ begin begin execute 'set local role authenticated'; execute 'select 1 from public.parent_signup_claims'; raise exception 'opened'; exception when insufficient_privilege then null; end; end $$; select 'denied'`);
    expect(denied).toBe('denied');
    const grants = psql(DB, `select count(*)::text from pg_class where relname = 'parent_session_grants'`);
    expect(grants).toBe('0');
    psql('postgres', `DROP DATABASE IF EXISTS ${DB}`);
  });
});
