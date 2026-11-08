import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Two OS processes share only Postgres. The nonce row, not an email map, decides who may mint.
 */
const DB = 'nurawell_signup_claim';
const migration = join(process.cwd(), '../../supabase/migrations/000239_parent_signup_claim.sql');
const NONCE = 'n'.repeat(32);
const OTHER = 'm'.repeat(32);
const SUB = 'parent-sub-a';
const EMAIL = 'one@example.test';

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

function beginInProcess(nonce: string, sub: string, email: string): Promise<string> {
  const sql = `select public.parent_signup_begin('${nonce}', '${sub}', '${email}')`;
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

describe('parent signup claim across processes', () => {
  it('lets one nonce mint once, refuses the other caller, and allows a failed retry', async () => {
    psql('postgres', `DROP DATABASE IF EXISTS ${DB}`);
    psql('postgres', `CREATE DATABASE ${DB}`);
    psqlScript(DB, readFileSync(migration, 'utf8'));
    const [first, second] = await Promise.all([
      beginInProcess(NONCE, SUB, EMAIL),
      beginInProcess(NONCE, SUB, EMAIL),
    ]);
    expect([first, second].sort()).toEqual(['busy', 'claimed']);
    expect(psql(DB, `select public.parent_signup_begin('${OTHER}', '${SUB}', '${EMAIL}')`)).toBe('claimed');
    expect(psql(DB, `select public.parent_signup_begin('${NONCE}', 'other-sub', '${EMAIL}')`)).toBe('mismatch');
    const user = '11111111-1111-4111-8111-111111111111';
    const session = '22222222-2222-4222-8222-222222222222';
    expect(psql(DB, `select public.parent_signup_finish('${NONCE}', '${user}', '${session}')`)).toBe('t');
    expect(psql(DB, `select public.parent_signup_begin('${NONCE}', '${SUB}', '${EMAIL}')`)).toBe('done');
    expect(psql(DB, `select session_id::text from public.parent_signup_claims where nonce = '${NONCE}'`)).toBe(session);
    expect(psql(DB, `select public.parent_signup_abort('${OTHER}')`)).toBe('t');
    expect(psql(DB, `select public.parent_signup_begin('${OTHER}', '${SUB}', '${EMAIL}')`)).toBe('claimed');
    psql(DB, `update public.parent_signup_claims set updated_at = now() - interval '3 minutes' where nonce = '${OTHER}'`);
    expect(psql(DB, `select public.parent_signup_begin('${OTHER}', '${SUB}', '${EMAIL}')`)).toBe('claimed');
    const grants = psql(DB, `select count(*)::text from pg_class where relname = 'parent_session_grants'`);
    expect(grants).toBe('0');
    psql('postgres', `DROP DATABASE IF EXISTS ${DB}`);
  });
});
