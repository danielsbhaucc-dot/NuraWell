/**
 * Proves migration 000241 on the dummy database the app servers use.
 * Does not apply 000239 and does not treat the unfenced functions as this proof.
 * Does not create a provision cookie or call the onboarding form.
 *
 *   node apps/web/tests/support/signup-attempt-241.mjs
 *
 * SIGNUP_DB defaults to nurawell_stack_chain. Evidence is written without secrets.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const db = process.env.SIGNUP_DB || 'nurawell_stack_chain';
const file241 = join(root, 'supabase/migrations/000241_parent_signup_attempt.sql');
const file239 = join(root, 'supabase/migrations/000239_parent_signup_claim.sql');
const file240 = join(root, 'supabase/migrations/000240_profile_birth_reject.sql');
const evidencePath = join(root, 'apps/web/tests/evidence/signup-attempt-241.json');

const EXPECTED = [
  'parent_signup_begin(p_nonce text, p_sub text, p_email text)',
  'parent_signup_fail(p_nonce text, p_attempt uuid, p_session uuid)',
  'parent_signup_finish(p_nonce text, p_attempt uuid, p_user uuid, p_session uuid)',
  'parent_signup_note_user(p_nonce text, p_attempt uuid, p_user uuid)',
  'parent_signup_user(p_nonce text, p_attempt uuid)',
];

function psql(sql) {
  return execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], {
    encoding: 'utf8',
  }).trim();
}

function psqlFile(path) {
  execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', db, '-v', 'ON_ERROR_STOP=1', '-f', path], {
    encoding: 'utf8',
  });
}

function size(path) {
  try {
    return readFileSync(path).length;
  } catch {
    return null;
  }
}

function signatures() {
  const raw = psql(`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'parent_signup%'
    order by 1`);
  return raw ? raw.split('\n').filter(Boolean) : [];
}

const sql241 = readFileSync(file241, 'utf8');
if (!sql241.includes('parent_signup_fail') || !sql241.includes('attempt_id')) {
  throw new Error('000241 file does not fence the attempt');
}
if (sql241.includes('signOut')) throw new Error('000241 must not sign out a browser');
if (!psql(`select to_regclass('public.parent_signup_claims')`) ) {
  throw new Error('parent_signup_claims is missing; 000239 has to be applied before 000241');
}

psqlFile(file241);
const found = signatures();
const missing = EXPECTED.filter((item) => !found.includes(item));
const stale = found.filter((item) => !EXPECTED.includes(item) || item.startsWith('parent_signup_abort'));
if (missing.length || found.some((item) => item.startsWith('parent_signup_abort')) || found.length !== EXPECTED.length) {
  throw new Error(`241 signatures mismatch: ${found.join(' | ')}`);
}

const definer = psql(`select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'parent_signup%'
    and p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')`);
const acl = {
  anonFail: psql(`select has_function_privilege('anon', 'public.parent_signup_fail(text,uuid,uuid)', 'execute')`),
  authenticatedBegin: psql(`select has_function_privilege('authenticated', 'public.parent_signup_begin(text,text,text)', 'execute')`),
  serviceFinish: psql(`select has_function_privilege('service_role', 'public.parent_signup_finish(text,uuid,uuid,uuid)', 'execute')`),
  rls: psql(`select relrowsecurity::text from pg_class where oid = 'public.parent_signup_claims'::regclass`),
  authenticatedRead: psql(`do $$ begin begin execute 'set local role authenticated'; execute 'select 1 from public.parent_signup_claims'; raise exception 'opened'; exception when insufficient_privilege then null; end; end $$; select 'denied'`).split('\n').pop(),
};
if (acl.authenticatedRead !== 'denied' || acl.anonFail !== 'f' || acl.authenticatedBegin !== 'f' || acl.serviceFinish !== 't' || acl.rls !== 'true') {
  throw new Error('241 privileges are not limited to service_role');
}
if (definer !== '5') throw new Error('241 functions are not all definer with a locked search_path');

const userId = randomUUID();
const sessionOwned = randomUUID();
const sessionOther = randomUUID();
const sessionWinner = randomUUID();
const nonce = randomBytes(16).toString('hex');
const email = `fence-${nonce.slice(0, 8)}@example.test`;
const sub = 'parent-sub-fence';
let attemptA = '';
let attemptB = '';

try {
  psql(`insert into auth.users (id, email, aud, role) values ('${userId}', '${email}', 'authenticated', 'authenticated')`);
  psql(`insert into auth.sessions (id, user_id) values ('${sessionOwned}', '${userId}'), ('${sessionOther}', '${userId}'), ('${sessionWinner}', '${userId}')`);
  psql(`insert into public.parent_session_grants (user_id, session_id, parent_sub, issued_at, expires_at)
    values ('${userId}', '${sessionOwned}', '${sub}', now(), now() + interval '20 minutes'),
           ('${userId}', '${sessionOther}', '${sub}', now(), now() + interval '20 minutes'),
           ('${userId}', '${sessionWinner}', '${sub}', now(), now() + interval '20 minutes')`);
  const claimed = psql(`select public.parent_signup_begin('${nonce}', '${sub}', '${email}')`);
  if (!claimed.startsWith('claimed:')) throw new Error(`begin did not return an attempt: ${claimed.split(':')[0]}`);
  attemptA = claimed.slice('claimed:'.length);
  if (psql(`select public.parent_signup_note_user('${nonce}', '${attemptA}', '${userId}')`) !== 't') throw new Error('note failed');
  if (psql(`select public.parent_signup_fail('${nonce}', '${attemptA}', '${sessionOwned}')`) !== 't') throw new Error('owned fail failed');
  if (psql(`select count(*)::text from auth.sessions where id = '${sessionOwned}'`) !== '0') throw new Error('owned session was not deleted');
  if (psql(`select count(*)::text from auth.sessions where id = '${sessionOther}'`) !== '1') throw new Error('other session was deleted');
  if (psql(`select revoked_at is not null from public.parent_session_grants where session_id = '${sessionOwned}'`) !== 't') throw new Error('owned grant was not revoked');
  if (psql(`select revoked_at is null from public.parent_session_grants where session_id = '${sessionOther}'`) !== 't') throw new Error('other grant was revoked');

  psql(`update public.parent_signup_claims set updated_at = now() - interval '3 minutes' where nonce = '${nonce}'`);
  const reclaimed = psql(`select public.parent_signup_begin('${nonce}', '${sub}', '${email}')`);
  if (!reclaimed.startsWith('claimed:')) throw new Error('reclaim did not return a new attempt');
  attemptB = reclaimed.slice('claimed:'.length);
  if (attemptB === attemptA) throw new Error('reclaim reused the old attempt');
  if (psql(`select public.parent_signup_note_user('${nonce}', '${attemptB}', '${userId}')`) !== 't') throw new Error('winner note failed');
  if (psql(`select public.parent_signup_finish('${nonce}', '${attemptB}', '${userId}', '${sessionWinner}')`) !== 't') throw new Error('winner finish failed');
  const staleFinish = psql(`select public.parent_signup_finish('${nonce}', '${attemptA}', '${userId}', '${sessionOwned}')`);
  const staleFail = psql(`select public.parent_signup_fail('${nonce}', '${attemptA}', '${sessionWinner}')`);
  if (staleFinish !== 'f' || staleFail !== 'f') throw new Error('stale worker was accepted');
  if (psql(`select session_id::text from public.parent_signup_claims where nonce = '${nonce}'`) !== sessionWinner) throw new Error('winner claim changed');
  if (psql(`select count(*)::text from auth.sessions where id = '${sessionWinner}'`) !== '1') throw new Error('winner session was deleted');
  if (psql(`select revoked_at is null from public.parent_session_grants where session_id = '${sessionWinner}'`) !== 't') throw new Error('winner grant was revoked');
  if (psql(`select public.parent_signup_begin('${nonce}', '${sub}', '${email}')`) !== 'done') throw new Error('finished claim was not done');

  const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const evidence = {
    provedAgainst: head,
    migration: '000241',
    database: db,
    form: 'not-run',
    order: {
      '000239': { bytes: size(file239), role: 'creates parent_signup_claims; already present, not re-applied as this proof' },
      '000240': { bytes: size(file240), role: 'not in this branch and not required by 000241' },
      '000241': { bytes: size(file241), role: 'adds attempt_id and replaces the claim functions; applied on the dummy database' },
    },
    signatures: found,
    staleSignaturesAbsent: stale.length === 0 && missing.length === 0,
    definerWithSearchPath: definer,
    acl,
    race: {
      ownedSessionDeleted: true,
      otherSessionKept: true,
      otherGrantKept: true,
      staleFinish: false,
      staleFail: false,
      winnerSessionKept: true,
      winnerGrantKept: true,
      doneWithoutSessionLeak: true,
    },
  };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`signup-attempt-241 ok ${db}\n`);
} finally {
  psql(`delete from public.parent_session_grants where user_id = '${userId}'`);
  psql(`delete from public.parent_signup_claims where nonce = '${nonce}'`);
  psql(`delete from auth.sessions where user_id = '${userId}'`);
  psql(`delete from auth.users where id = '${userId}'`);
}
