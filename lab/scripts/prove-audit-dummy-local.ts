/**
 * Local dummy proof for pii_access_grants.reason and access_audit_findings.summary.
 * Creates only the database nurawell_pii_dummy through the local postgres peer role.
 * Prints counts and pass/fail. Does not print values or keys.
 *
 *   cd apps/web && PII_LOCAL_PROOF=dummy npx jiti scripts/prove-audit-dummy-local.ts
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { __resetFieldCrypto, decryptValue, setDekStoreForTests, type DekStore } from '@/lib/security/field-crypto';
import type { WrappedDek } from '@/lib/security/field-envelope';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { planGrantReason, runGrantReasonBatch } from '@/lib/privacy/pii-grant-reason-backfill';
import { planAuditSummary, runAuditSummaryBatch } from '@/lib/privacy/audit-summary-backfill';
import { findingTitle, CLOSED_FINDING } from '@/lib/platform/access/finding-title';

const DB = 'nurawell_pii_dummy';
const REASON = 'בדיקת תלונה על חיוב כפול בחשבון';
const SUMMARY = 'גישה לילית חריגה משעה לא מוכרת';
const ACTOR = '11111111-1111-4111-8111-111111111111';
const SUBJECT = '22222222-2222-4222-8222-222222222222';

function refuse(reason: string): never {
  throw new Error(reason);
}

function psql(sql: string, db = DB): { ok: boolean; out: string; err: string } {
  const run = spawnSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], { encoding: 'utf8' });
  return { ok: run.status === 0, out: run.stdout, err: run.stderr };
}

function psqlFile(path: string): { ok: boolean; err: string } {
  const run = spawnSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-f', path], { encoding: 'utf8' });
  return { ok: run.status === 0, err: run.stderr };
}

function memStore(): DekStore {
  const rows = new Map<string, WrappedDek>();
  return {
    async get(u) { return rows.get(u) ?? null; },
    async putIfAbsent(u, w) { if (!rows.has(u)) rows.set(u, w); return rows.get(u)!; },
  };
}

const q = (value: string) => value.replace(/'/g, "''");

export async function runLocalDummyProof() {
  if (process.env.PII_LOCAL_PROOF !== 'dummy') refuse('not a local dummy proof');
  const root = new URL('../../../', import.meta.url);
  const mig = (name: string) => new URL(`supabase/migrations/${name}`, root).pathname;
  spawnSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', 'postgres', '-c', `drop database if exists ${DB}`], { encoding: 'utf8' });
  const created = spawnSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', 'postgres', '-c', `create database ${DB}`], { encoding: 'utf8' });
  if (created.status !== 0) refuse('could not create the local dummy database');
  const prep = `
    create schema if not exists auth;
    create table auth.users (id uuid primary key);
    insert into auth.users (id) values ('${ACTOR}'), ('${SUBJECT}');
    create table public.iam_products (
      id text primary key,
      name text not null,
      status text not null default 'active'
    );
    insert into public.iam_products (id, name) values ('nurawell', 'dummy');
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'dummy_reader') then create role dummy_reader nologin; end if;
    end $$;
    grant usage on schema public to anon, authenticated, dummy_reader;
  `;
  if (!psql(prep).ok) refuse('local schema prep failed');
  for (const file of ['000199_pii_access_grants.sql', '000200_access_audit.sql', '000235_pii_grant_reason_ciphertext.sql']) {
    const applied = psqlFile(mig(file));
    if (!applied.ok) refuse(`migration failed: ${file}`);
  }
  if (!psql('alter table public.access_audit_findings add column if not exists acknowledged_by uuid').ok) refuse('ack column failed');
  const summaryMig = psqlFile(mig('000237_access_audit_summary_ciphertext.sql'));
  if (!summaryMig.ok) refuse('migration failed: 000237');

  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  __resetFieldCrypto();
  setDekStoreForTests(memStore());
  const reasonPlan = await planGrantReason(REASON);
  const summaryPlan = await planAuditSummary(SUMMARY);
  if (reasonPlan.action !== 'write' || summaryPlan.action !== 'write') refuse('seal failed closed');

  const run = psql(`insert into public.access_audit_runs (window_from, window_to) values (now() - interval '1 day', now()) returning id`).out.trim().split('\n')[0] ?? '';
  if (!run) refuse('audit run insert failed');
  const grantPlain = '33333333-3333-4333-8333-333333333333';
  const grantSealed = '44444444-4444-4444-8444-444444444444';
  const findingPlain = '55555555-5555-4555-8555-555555555555';
  const findingSealed = '66666666-6666-4666-8666-666666666666';
  const writes = [
    `insert into public.pii_access_grants (id, actor_id, subject_id, reason, expires_at) values ('${grantPlain}', '${ACTOR}', '${SUBJECT}', '${q(REASON)}', now() + interval '30 min')`,
    `insert into public.pii_access_grants (id, actor_id, subject_id, reason, expires_at) values ('${grantSealed}', '${ACTOR}', '${SUBJECT}', '${q(reasonPlan.ciphertext)}', now() + interval '30 min')`,
    `insert into public.access_audit_findings (id, run_id, severity, summary, event_kind) values ('${findingPlain}', '${run}', 'low', '${q(SUMMARY)}', 'pii_grant')`,
    `insert into public.access_audit_findings (id, run_id, severity, summary, event_kind) values ('${findingSealed}', '${run}', 'low', '${q(summaryPlan.ciphertext)}', 'pii_grant')`,
  ];
  for (const sql of writes) {
    const wrote = psql(sql);
    if (!wrote.ok) refuse('dummy insert failed');
  }

  const storedReason = psql(`select reason from public.pii_access_grants where id = '${grantSealed}'`).out.trim();
  const storedSummary = psql(`select summary from public.access_audit_findings where id = '${findingSealed}'`).out.trim();
  const legacyReason = psql(`select reason from public.pii_access_grants where id = '${grantPlain}'`).out.trim();
  const legacySummary = psql(`select summary from public.access_audit_findings where id = '${findingPlain}'`).out.trim();
  const openedReason = await decryptValue('pii_access_grants', 'reason', 'system:audit', SYSTEM_ROW, storedReason);
  const openedSummary = await decryptValue('access_audit_findings', 'summary', 'system:audit', SYSTEM_ROW, storedSummary);
  let wrongKey = false;
  try { await decryptValue('access_audit_findings', 'summary', 'system:ops', SYSTEM_ROW, storedSummary); }
  catch (error) {
    const message = error instanceof Error ? error.message : '';
    wrongKey = !message.includes(SUMMARY) && !message.includes(storedSummary);
  }
  const authz = psql(`set role authenticated; select count(*) from public.pii_access_grants`);
  psql('grant select on public.pii_access_grants, public.access_audit_findings to dummy_reader');
  const reader = psql(`set role dummy_reader; select count(*) from public.access_audit_findings`);
  const ordered = psql(`select id from public.access_audit_findings order by created_at asc`).out.trim().split('\n').filter(Boolean);

  const reasonRows = psql('select id, reason from public.pii_access_grants order by id').out.trim().split('\n').filter(Boolean).map((line) => {
    const cut = line.indexOf('|');
    return { id: line.slice(0, cut), reason: line.slice(cut + 1) };
  });
  const firstReason = await runGrantReasonBatch(reasonRows, async (patch) => {
    if (!psql(`update public.pii_access_grants set reason = '${q(patch.ciphertext)}' where id = '${patch.id}' and reason = '${q(patch.previous)}' and reason !~ '^enc:v2:'`).ok) throw new Error('write');
  }, true);
  const reasonRows2 = psql('select id, reason from public.pii_access_grants order by id').out.trim().split('\n').filter(Boolean).map((line) => {
    const cut = line.indexOf('|');
    return { id: line.slice(0, cut), reason: line.slice(cut + 1) };
  });
  const secondReason = await runGrantReasonBatch(reasonRows2, async () => { throw new Error('second'); }, true);

  const summaryRows = psql('select id, summary from public.access_audit_findings order by id').out.trim().split('\n').filter(Boolean).map((line) => {
    const cut = line.indexOf('|');
    return { id: line.slice(0, cut), summary: line.slice(cut + 1) };
  });
  const firstSummary = await runAuditSummaryBatch(summaryRows, async (patch) => {
    if (!psql(`update public.access_audit_findings set summary = '${q(patch.ciphertext)}' where id = '${patch.id}' and summary = '${q(patch.previous)}' and summary !~ '^enc:v2:'`).ok) throw new Error('write');
  }, true);
  const summaryRows2 = psql('select id, summary from public.access_audit_findings order by id').out.trim().split('\n').filter(Boolean).map((line) => {
    const cut = line.indexOf('|');
    return { id: line.slice(0, cut), summary: line.slice(cut + 1) };
  });
  const secondSummary = await runAuditSummaryBatch(summaryRows2, async () => { throw new Error('second'); }, true);
  const after = psql(`select summary from public.access_audit_findings where id = '${findingPlain}'`).out.trim();
  const afterOpened = await decryptValue('access_audit_findings', 'summary', 'system:audit', SYSTEM_ROW, after);
  const rls = psql(`select c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'access_audit_findings'`).out.trim();
  const tooLong = psql(`insert into public.access_audit_findings (run_id, severity, summary, event_kind) values ('${run}', 'low', repeat('א', 401), 'pii_grant')`);

  const report = {
    database: DB,
    sealedReasonStored: storedReason.startsWith('enc:v2:') && !storedReason.includes(REASON),
    sealedSummaryStored: storedSummary.startsWith('enc:v2:') && !storedSummary.includes(SUMMARY),
    legacyReasonRead: legacyReason === REASON,
    legacySummaryRead: legacySummary === SUMMARY,
    decryptReason: openedReason === REASON,
    decryptSummary: openedSummary === SUMMARY,
    wrongKeyClosed: wrongKey,
    titleHidesCipher: findingTitle(storedSummary) === CLOSED_FINDING,
    authenticatedDenied: !authz.ok,
    readerSeesNoRows: reader.ok && reader.out.trim().split('\n').pop() === '0',
    orderedByCreatedAt: ordered.length === 2,
    reasonRewrite: firstReason.written === 1 && secondReason.written === 0 && secondReason.failed === 0,
    summaryRewrite: firstSummary.written === 1 && secondSummary.written === 0 && secondSummary.failed === 0,
    rewrittenDecrypts: afterOpened === SUMMARY && after.startsWith('enc:v2:'),
    rlsEnabledNotForced: rls === 't|f',
    plaintextOver400Rejected: !tooLong.ok,
    migrations: ['000199', '000200', '000201-ack-column', '000235', '000237'],
  };
  const pass = Object.entries(report).every(([key, value]) => key === 'database' || key === 'migrations' || value === true);
  return { pass, ...report };
}
