import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('auth_session_trail write-time seal', () => {
  it.each([
    'app/api/v1/auth/login-event/route.ts',
    'app/auth/callback/route.ts',
    'app/auth/ops-ingest/route.ts',
    'app/api/v1/auth/post-verify/route.ts',
    'lib/auth/issue-session.ts',
    'lib/demo-access/claim.ts',
  ])('%s seals the trail right after sign-in', (p) => {
    expect(read(p)).toMatch(/sealSessionTrailFor\(/);
  });

  it('backstop cron is daily (Vercel Hobby allows only daily crons)', () => {
    const v = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] };
    for (const c of v.crons) expect(c.schedule.split(' ').slice(0, 2).every((f) => /^\d+$/.test(f))).toBe(true);
    expect(v.crons.some((c) => c.path === '/api/v1/ai/cron/session-trail-seal')).toBe(true);
  });

  it('backfill supports a per-user scope', () => {
    expect(read('lib/security/field-backfill.ts')).toMatch(/if \(only\) q = q\.eq\(only\.col, only\.value\)/);
  });
});
