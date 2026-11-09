/**
 * LOCAL lab only: dry-run (default) or --apply legacy parent_signup_claims.email → enc:v2 + email_bidx.
 * No hosted writes. Never prints email/keys. Preserves backups elsewhere untouched.
 *
 *   cd apps/web && npx tsx scripts/backfill-parent-signup-email-local.ts
 *   cd apps/web && npx tsx scripts/backfill-parent-signup-email-local.ts --apply
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { __resetFieldCrypto, setDekStoreForTests } from '@/lib/security/field-crypto';
import {
  runSignupEmailBackfillBatch,
  type SignupEmailLegacyRow,
  type SignupEmailWrite,
} from '@/lib/privacy/parent-signup-email-backfill';

const DB = 'nurawell_stack_chain';
const apply = process.argv.includes('--apply');

function loadEnv() {
  for (const line of readFileSync('/workspace/local-lab-paired/secrets/next-a.env', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]] = m[2];
  }
}
function psql(sql: string): string {
  return execFileSync('psql', ['-h', '127.0.0.1', '-U', 'postgres', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-Atq'], {
    encoding: 'utf8', input: sql,
  }).trim();
}
function counts() {
  const line = psql(`select count(*)||'|'||count(*) filter (where email like 'enc:v2:%')||'|'||count(*) filter (where email not like 'enc:%')||'|'||count(*) filter (where email_bidx is not null) from public.parent_signup_claims`);
  const [total, sealed, legacy, bidx] = line.split('|');
  return { total: +total, sealed: +sealed, legacy: +legacy, bidx: +bidx };
}

loadEnv();
__resetFieldCrypto();
setDekStoreForTests(null);

const before = counts();
const raw = psql(`select nonce||E'\\t'||parent_sub||E'\\t'||email||E'\\t'||coalesce(email_bidx,'')||E'\\t'||state||E'\\t'||updated_at::text
  from public.parent_signup_claims
  where email_bidx is null and email not like 'enc:%'
  order by updated_at asc
  limit 25`);
const rows: SignupEmailLegacyRow[] = raw
  ? raw.split('\n').filter(Boolean).map((line) => {
      const [nonce, parent_sub, email, email_bidx, state, updated_at] = line.split('\t');
      return { nonce, parent_sub, email, email_bidx: email_bidx || null, state, updated_at };
    })
  : [];

const write = async (patch: SignupEmailWrite): Promise<boolean> => {
  // Conditional: only if still the same plaintext and no bidx (race-safe).
  const esc = (s: string) => s.replace(/'/g, "''");
  const n = psql(`update public.parent_signup_claims
    set email = '${esc(patch.sealed)}', email_bidx = '${esc(patch.bidx)}', updated_at = updated_at
    where nonce = '${esc(patch.nonce)}'
      and email_bidx is null
      and email = '${esc(patch.previous)}'
      and email not like 'enc:%'
    returning 1`);
  return n === '1';
};

async function main() {
  const result = await runSignupEmailBackfillBatch(rows, write, apply);
  const after = counts();
  // Evidence without PII
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    before, after,
    examined: result.examined,
    skipped: result.skipped,
    planned: result.planned,
    written: result.written,
    failed: result.failed,
    aborted: result.aborted,
    skipReasons: result.skipReasons,
    legacy_gate: after.legacy === 0 ? 'closed_local' : 'open_legacy_remain',
  }, null, 2));
  process.exit(result.failed > 0 || (result.aborted && apply) ? 1 : 0);
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
