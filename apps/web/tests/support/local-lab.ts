import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Gate for tests that need the local acceptance lab (local PostgreSQL 17, GoTrue binary, PostgREST behind a
 * proxy, lab-only keys). When a piece is missing the test is SKIPPED with the reason in its title instead of
 * failing, so a green run means something. Assertions are never changed.
 *
 * NW_REQUIRE_LAB=1 turns every missing piece into a hard failure (use it on the box where the lab is up).
 * Probes are read-only: `select 1`, a role count, a file check and an HTTP status. Nothing is printed except the reason.
 */
export type LabNeed =
  | { kind: 'pg-superuser' }
  | { kind: 'pg-tcp'; db: string }
  | { kind: 'file'; path: string }
  | { kind: 'http'; url: string };

export const LAB_ENV_FILE = '/workspace/local-lab-paired/secrets/next-a.env';
export const GOTRUE_BIN = '/tmp/local-auth/bin/auth';

const run = (cmd: string, args: string[]) =>
  spawnSync(cmd, args, { encoding: 'utf8', timeout: 5_000, env: { ...process.env, PGCONNECT_TIMEOUT: '2' } });

function missing(need: LabNeed): string | null {
  switch (need.kind) {
    case 'pg-superuser': {
      // Supabase-shaped local cluster: peer access as postgres and the anon/authenticated/service_role roles.
      const r = run('sudo', ['-n', '-u', 'postgres', 'psql', '-d', 'postgres', '-Atqc', "select count(*) from pg_roles where rolname in ('anon','authenticated','service_role')"]);
      return r.status === 0 && r.stdout.trim() === '3' ? null : 'local PostgreSQL with Supabase roles (sudo -u postgres)';
    }
    case 'pg-tcp': {
      const r = run('psql', ['-h', '127.0.0.1', '-U', 'postgres', '-d', need.db, '-Atqc', 'select 1']);
      return r.status === 0 && r.stdout.trim() === '1' ? null : `local database ${need.db} on 127.0.0.1:5432`;
    }
    case 'file':
      return existsSync(need.path) ? null : `lab file ${need.path}`;
    case 'http': {
      const r = run('curl', ['-s', '-o', '/dev/null', '-m', '2', '-w', '%{http_code}', need.url]);
      return r.status === 0 && /^[1-4]\d\d$/.test(r.stdout.trim()) ? null : `lab service ${need.url}`;
    }
  }
}

const cache = new Map<string, string | null>();

/** Null when every need is met; otherwise a short reason. Throws instead when NW_REQUIRE_LAB=1. */
export function labMissing(needs: LabNeed[]): string | null {
  const reasons: string[] = [];
  for (const n of needs) {
    const key = JSON.stringify(n);
    if (!cache.has(key)) cache.set(key, missing(n));
    const why = cache.get(key);
    if (why) reasons.push(why);
  }
  if (!reasons.length) return null;
  const why = `needs ${reasons.join(', ')}`;
  if (process.env.NW_REQUIRE_LAB === '1') throw new Error(`local lab required (NW_REQUIRE_LAB=1): ${why}`);
  return why;
}

/** Title suffix that makes a skip visible in the vitest report. */
export const labTitle = (title: string, why: string | null) => (why ? `${title} [skipped: ${why}]` : title);

/** The main lab: product DB nurawell_stack_chain over TCP, lab env file, PostgREST/GoTrue proxy on :5998. */
export const MAIN_LAB: LabNeed[] = [
  { kind: 'file', path: LAB_ENV_FILE },
  { kind: 'pg-tcp', db: 'nurawell_stack_chain' },
  { kind: 'http', url: 'http://127.0.0.1:5998/rest/v1/' },
];
