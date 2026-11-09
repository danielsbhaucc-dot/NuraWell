/**
 * המרת נימוקי גישה גלויים ל-enc:v2, לדמה מקומית בלבד.
 * בלי BIRTH-style דגל מפורש וכתובת לולאה חוזרת — לא מתחבר.
 *
 *   cd apps/web && PII_GRANT_BACKFILL=local-dummy DATABASE_URL=postgresql://...@127.0.0.1/... \
 *     npx jiti scripts/backfill-pii-grant-reason.ts [--apply]
 */
import { spawnSync } from 'node:child_process';

const LOOPBACK = /^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost)(?::\d+)?\//;

function refuse(reason: string): never {
  process.stdout.write(`${JSON.stringify({ refused: reason })}\n`);
  process.exit(reason === 'hosted databases are not a target' ? 0 : 1);
}

function psql(url: string, sql: string): string {
  const out = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], { encoding: 'utf8' });
  if (out.status !== 0) throw new Error('local query failed');
  return out.stdout;
}

async function main() {
  if (process.env.PII_GRANT_BACKFILL !== 'local-dummy') refuse('hosted databases are not a target');
  const url = process.env.DATABASE_URL ?? '';
  if (!LOOPBACK.test(url)) refuse('database host is not loopback');
  const apply = process.argv.includes('--apply');
  const { GRANT_REASON_BATCH, runGrantReasonBatch } = await import('../lib/privacy/pii-grant-reason-backfill');
  const raw = psql(url, `select id, reason from public.pii_access_grants order by id limit ${GRANT_REASON_BATCH + 1}`);
  const rows = raw.split('\n').filter(Boolean).map((line) => {
    const cut = line.indexOf('|');
    return { id: line.slice(0, cut), reason: line.slice(cut + 1) };
  });
  const result = await runGrantReasonBatch(rows, async (patch) => {
    const lit = patch.ciphertext.replace(/'/g, "''");
    const prev = patch.previous.replace(/'/g, "''");
    psql(url, `update public.pii_access_grants set reason = '${lit}' where id = '${patch.id.replace(/'/g, "''")}' and reason = '${prev}' and reason !~ '^enc:v2:'`);
  }, apply);
  process.stdout.write(`${JSON.stringify({ apply, examined: result.examined, skipped: result.skipped, planned: result.planned, written: result.written, failed: result.failed, aborted: result.aborted })}\n`);
}

main().catch(() => {
  process.stdout.write(`${JSON.stringify({ refused: 'local batch failed closed' })}\n`);
  process.exit(1);
});
