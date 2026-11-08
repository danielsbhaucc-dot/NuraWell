import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { packProvision, unpackProvision } from '../lib/central/parent-provision';

/**
 * Two OS processes, one Postgres, one GoTrue.
 * This is the signup mint itself, not the onboarding form and not a unit count.
 * An expired or altered provision cookie is rejected before any of this runs.
 */
const DB = 'nurawell_signup_once';
const PORT = 9996;
const AUTH = '/tmp/local-auth/bin/auth';
const WORKER = join(process.cwd(), 'tests/support/signup-once-worker.mjs');
const SUB = 'parent-sub-a';
const RACE_EMAIL = 'race-once@example.test';
const FAIL_EMAIL = 'fail-once@example.test';

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

function worker(secret: string, mode: string, nonce: string, sub: string, email: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER, mode, nonce, sub, email], {
      env: {
        PATH: process.env.PATH ?? '/usr/bin',
        HOME: '/tmp',
        SIGNUP_ONCE_DB: DB,
        SIGNUP_ONCE_PORT: String(PORT),
        SIGNUP_ONCE_JWT: secret,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('exit', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err || out || 'worker failed'))));
  });
}

describe('one verified signup mints one session', () => {
  it('keeps the session on that nonce across two processes and a lost later call', async () => {
    const cookieSecret = 'c'.repeat(32);
    const nonce = randomBytes(16).toString('hex');
    const expired = packProvision({
      product: 'nurawell', sub: SUB, lic: 'lic_abcd', email: RACE_EMAIL,
      exp: Math.floor(Date.now() / 1000) - 10, nonce, verified: true,
    }, cookieSecret);
    expect(expired).toBeTruthy();
    expect(unpackProvision(expired ?? '', cookieSecret)).toBeNull();
    const flipped = `${expired?.slice(0, -1)}${expired?.endsWith('a') ? 'b' : 'a'}`;
    expect(unpackProvision(flipped, cookieSecret)).toBeNull();

    spawnSync('sudo', ['-n', 'pkill', '-f', `GOTRUE_API_PORT=${PORT}`]);
    psql('postgres', `DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    psql('postgres', `CREATE DATABASE ${DB}`);
    psql(DB, 'create schema if not exists auth');
    psql('postgres', `alter database ${DB} set search_path to auth, public`);
    const secret = randomBytes(32).toString('hex');
    const authEnv = [
      'GOTRUE_DB_DRIVER=postgres',
      `GOTRUE_DB_DATABASE_URL=postgres://postgres@/${DB}?host=/var/run/postgresql`,
      `API_EXTERNAL_URL=http://127.0.0.1:${PORT}`,
      `GOTRUE_SITE_URL=http://127.0.0.1:${PORT}`,
      `GOTRUE_JWT_SECRET=${secret}`,
      'GOTRUE_JWT_EXP=3600',
      'GOTRUE_MAILER_AUTOCONFIRM=true',
      'GOTRUE_EXTERNAL_EMAIL_ENABLED=true',
      'GOTRUE_API_HOST=127.0.0.1',
      `GOTRUE_API_PORT=${PORT}`,
    ];
    execFileSync('sudo', ['-n', '-u', 'postgres', 'env', ...authEnv, AUTH, 'migrate'], { encoding: 'utf8' });
    const grants = readFileSync(join(process.cwd(), '../../supabase/migrations/000232_parent_session_grants.sql'), 'utf8');
    const grantFns = grants.slice(0, grants.indexOf('\n-- Boolean helpers.'));
    psqlScript(DB, readFileSync(join(process.cwd(), '../../supabase/migrations/000239_parent_signup_claim.sql'), 'utf8'));
    psqlScript(DB, grantFns);
    expect(psql(DB, 'select count(*)::text from public.parent_signup_claims')).toBe('0');

    const serve = spawn('sudo', ['-n', '-u', 'postgres', 'env', ...authEnv, AUTH, 'serve'], { stdio: 'ignore' });
    const base = `http://127.0.0.1:${PORT}`;
    let up = false;
    for (let i = 0; i < 30 && !up; i += 1) {
      try {
        up = (await fetch(`${base}/health`)).ok;
      } catch { /* not up yet */ }
      if (!up) await new Promise((resolve) => setTimeout(resolve, 150));
    }
    expect(up).toBe(true);

    const [first, second] = await Promise.all([
      worker(secret, 'race', nonce, SUB, RACE_EMAIL),
      worker(secret, 'race', nonce, SUB, RACE_EMAIL),
    ]);
    expect([first, second].sort()).toEqual(['busy', 'minted']);
    const raceUser = psql(DB, `select id::text from auth.users where email = '${RACE_EMAIL}'`);
    const raceSession = psql(DB, `select session_id::text from public.parent_signup_claims where nonce = '${nonce}'`);
    expect(psql(DB, `select state from public.parent_signup_claims where nonce = '${nonce}'`)).toBe('done');
    expect(psql(DB, `select count(*)::text from auth.sessions where user_id = '${raceUser}'`)).toBe('1');
    expect(psql(DB, `select count(*)::text from public.parent_session_grants where user_id = '${raceUser}' and revoked_at is null`)).toBe('1');
    expect(psql(DB, `select session_id::text from public.parent_session_grants where user_id = '${raceUser}' and revoked_at is null`)).toBe(raceSession);

    const late = await worker(secret, 'late', nonce, SUB, RACE_EMAIL);
    expect(late).toBe('done');
    expect(late).not.toBe(raceSession);
    expect(psql(DB, `select count(*)::text from auth.sessions where user_id = '${raceUser}'`)).toBe('1');
    expect(psql(DB, `select count(*)::text from public.parent_session_grants where user_id = '${raceUser}' and revoked_at is null`)).toBe('1');

    const changed = await worker(secret, 'mismatch', nonce, 'other-parent-sub', RACE_EMAIL);
    expect(changed).toBe('mismatch');
    const otherEmail = await worker(secret, 'mismatch', nonce, SUB, 'someone-else@example.test');
    expect(otherEmail).toBe('mismatch');
    expect(psql(DB, 'select count(*)::text from auth.sessions')).toBe('1');

    const foreignNonce = randomBytes(16).toString('hex');
    expect(await worker(secret, 'foreign', foreignNonce, SUB, RACE_EMAIL)).toBe('blocked');
    expect(psql(DB, `select state || coalesce(session_id::text, '') from public.parent_signup_claims where nonce = '${foreignNonce}'`)).toBe('failed');
    expect(psql(DB, 'select count(*)::text from auth.users')).toBe('1');
    expect(psql(DB, 'select count(*)::text from auth.sessions')).toBe('1');
    expect(psql(DB, `select count(*)::text from public.parent_session_grants where revoked_at is null`)).toBe('1');

    const failNonce = randomBytes(16).toString('hex');
    const failed = await worker(secret, 'fail', failNonce, SUB, FAIL_EMAIL);
    expect(failed.split(' ')[0]).toBe('aborted');
    expect(['200', '204']).toContain(failed.split(' ')[1]);
    expect(failed.split(' ')[2]).toBe('claimed');
    expect(failed.split(' ')[3]).toBe('retried');
    const failUser = psql(DB, `select id::text from auth.users where email = '${FAIL_EMAIL}'`);
    const failSession = psql(DB, `select session_id::text from public.parent_signup_claims where nonce = '${failNonce}'`);
    expect(psql(DB, `select state from public.parent_signup_claims where nonce = '${failNonce}'`)).toBe('done');
    expect(psql(DB, `select count(*)::text from auth.sessions where user_id = '${failUser}'`)).toBe('1');
    expect(psql(DB, `select count(*)::text from public.parent_session_grants where user_id = '${failUser}' and revoked_at is null`)).toBe('1');
    expect(psql(DB, `select count(*)::text from public.parent_session_grants where user_id = '${failUser}' and revoked_at is not null`)).toBe('1');
    expect(psql(DB, `select session_id::text from public.parent_session_grants where user_id = '${failUser}' and revoked_at is null`)).toBe(failSession);
    expect(failSession).not.toBe(raceSession);

    const abandoned = randomBytes(16).toString('hex');
    expect(psql(DB, `select public.parent_signup_begin('${abandoned}', '${SUB}', 'later@example.test')`)).toBe('claimed');
    psql(DB, `update public.parent_signup_claims set updated_at = now() - interval '3 minutes' where nonce = '${abandoned}'`);
    expect(psql(DB, `select public.parent_signup_begin('${abandoned}', '${SUB}', 'later@example.test')`)).toBe('claimed');
    expect(psql(DB, `select count(*)::text from public.parent_session_grants where revoked_at is null`)).toBe('2');

    serve.kill('SIGTERM');
    spawnSync('sudo', ['-n', 'pkill', '-f', `GOTRUE_API_PORT=${PORT}`]);
    psql('postgres', `DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  }, 90_000);
});
