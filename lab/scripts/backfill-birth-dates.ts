/**
 * המרת תאריכי לידה גלויים ל-enc:v2, במנות של 25, לדמה מקומית בלבד.
 *
 * בלי BIRTH_BACKFILL=local-dummy וכתובת לולאה חוזרת — לא מתחבר ולא כותב.
 * בלי --apply רק מתכנן. לא מדפיס ערכים, לא מוחק מקורות או גיבויים,
 * לא מכבה RLS, ולא דורס ערך שכבר enc:v2.
 *
 *   cd apps/web && BIRTH_BACKFILL=local-dummy DATABASE_URL=postgresql://...@127.0.0.1/... \
 *     npx jiti scripts/backfill-birth-dates.ts [--apply]
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
  if (process.env.BIRTH_BACKFILL !== 'local-dummy') refuse('hosted databases are not a target');
  const url = process.env.DATABASE_URL ?? '';
  if (!LOOPBACK.test(url)) refuse('database host is not loopback');
  const apply = process.argv.includes('--apply');
  const { BIRTH_BATCH, BIRTH_COLUMNS, runBirthBatch } = await import('../lib/privacy/birth-date-backfill');
  type BirthRow = { id: string; date_of_birth?: unknown; birth_date?: unknown };
  type BirthWrite = { id: string; column: 'date_of_birth' | 'birth_date'; ciphertext: string };
  const cols = BIRTH_COLUMNS.join(', ');
  const raw = psql(url, `select id, ${cols} from public.profiles order by id limit ${BIRTH_BATCH + 1}`);
  const rows: BirthRow[] = raw.split('\n').filter(Boolean).map((line) => {
    const [id, date_of_birth, birth_date] = line.split('|');
    return { id: id ?? '', date_of_birth: date_of_birth || null, birth_date: birth_date || null };
  });
  const result = await runBirthBatch(rows, async (patch: BirthWrite) => {
    const lit = patch.ciphertext.replace(/'/g, "''");
    psql(url, `update public.profiles set ${patch.column} = '${lit}' where id = '${patch.id.replace(/'/g, "''")}' and ${patch.column} !~ '^enc:v2:'`);
  }, apply);
  process.stdout.write(`${JSON.stringify({ apply, ...result })}\n`);
}

main().catch(() => {
  process.stdout.write(`${JSON.stringify({ refused: 'local batch failed closed' })}\n`);
  process.exit(1);
});
