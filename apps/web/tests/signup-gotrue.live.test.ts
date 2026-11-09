import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

/**
 * GoTrue v2 from the local binary, on its own database. Counts sessions only.
 * Separate from the Postgres claim test and from the full onboarding action.
 */
const DB = 'nurawell_gotrue_once';
const PORT = 9997;
const AUTH = '/tmp/local-auth/bin/auth';

function psql(database: string, sql: string): string {
  return execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], {
    encoding: 'utf8',
  }).trim().split('\n').pop() ?? '';
}

function jwt(secret: Buffer, role: string): string {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ role, iss: 'supabase', iat: now, exp: now + 600 });
  const sig = createHmac('sha256', secret.toString('hex')).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

describe('one GoTrue verify opens one session', () => {
  it('does not open a session on create or generate_link', async () => {
    psql('postgres', `DROP DATABASE IF EXISTS ${DB}`);
    psql('postgres', `CREATE DATABASE ${DB}`);
    psql(DB, 'create schema if not exists auth');
    psql('postgres', `alter database ${DB} set search_path to auth, public`);
    const secret = randomBytes(32);
    const authEnv = [
      'GOTRUE_DB_DRIVER=postgres',
      `GOTRUE_DB_DATABASE_URL=postgres://postgres@/${DB}?host=/var/run/postgresql`,
      `API_EXTERNAL_URL=http://127.0.0.1:${PORT}`,
      `GOTRUE_SITE_URL=http://127.0.0.1:${PORT}`,
      `GOTRUE_JWT_SECRET=${secret.toString('hex')}`,
      'GOTRUE_JWT_EXP=3600',
      'GOTRUE_MAILER_AUTOCONFIRM=true',
      'GOTRUE_EXTERNAL_EMAIL_ENABLED=true',
      'GOTRUE_API_HOST=127.0.0.1',
      `GOTRUE_API_PORT=${PORT}`,
    ];
    execFileSync('sudo', ['-n', '-u', 'postgres', 'env', ...authEnv, AUTH, 'migrate'], { encoding: 'utf8' });
    const serve = spawn('sudo', ['-n', '-u', 'postgres', 'env', ...authEnv, AUTH, 'serve'], { stdio: 'ignore' });
    const token = jwt(secret, 'service_role');
    const base = `http://127.0.0.1:${PORT}`;
    for (let i = 0; i < 20; i += 1) {
      try {
        const health = await fetch(`${base}/health`);
        if (health.ok) break;
      } catch { /* not up yet */ }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const email = `once-${Date.now()}@example.test`;
    const before = psql(DB, 'select count(*)::text from auth.sessions');
    const created = await fetch(`${base}/admin/users`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, apikey: token, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'Oncepass12345', email_confirm: true }),
    });
    const afterCreate = psql(DB, 'select count(*)::text from auth.sessions');
    const linkRes = await fetch(`${base}/admin/generate_link`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, apikey: token, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', email }),
    });
    const link = await linkRes.json() as { hashed_token?: string };
    const afterLink = psql(DB, 'select count(*)::text from auth.sessions');
    const verified = await fetch(`${base}/verify`, {
      method: 'POST',
      headers: { apikey: token, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }),
    });
    const afterVerify = psql(DB, 'select count(*)::text from auth.sessions');
    expect({
      create: created.status, link: linkRes.status, verify: verified.status, hasHash: Boolean(link.hashed_token),
      before, afterCreate, afterLink, afterVerify,
    }).toEqual({
      create: 200, link: 200, verify: 200, hasHash: true,
      before: '0', afterCreate: '0', afterLink: '0', afterVerify: '1',
    });
    serve.kill('SIGTERM');
    spawnSync('sudo', ['-n', 'pkill', '-f', `GOTRUE_API_PORT=${PORT}`]);
    psql('postgres', `DROP DATABASE IF EXISTS ${DB}`);
  }, 30_000);
});
