import { execFileSync } from 'node:child_process';
import { vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetFieldCrypto, decryptValue, setDekStoreForTests, type DekStore } from '@/lib/security/field-crypto';
import type { WrappedDek } from '@/lib/security/field-envelope';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { planAuditSummary, runAuditSummaryBatch } from '@/lib/privacy/audit-summary-backfill';
import { planGrantReason, runGrantReasonBatch } from '@/lib/privacy/pii-grant-reason-backfill';
import { validateBirthDate } from '@/lib/privacy/age-validation';
import { runAccessAudit } from '@/lib/platform/access/audit-job';
import { fakeDb } from './helpers/access-fake-db';

/**
 * One local database, nurawell_stack_chain, after migrations 000001–000239
 * (000233 and 000234 from the birth-date branch, 000239 from the identity branch).
 * Prints no dates, summaries, or ciphertext.
 */
const DB = 'nurawell_stack_chain';
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const ACTOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const SUBJECT = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const WITHIN = 'א'.repeat(400);
const OVER = 'ב'.repeat(401);
const REASON = 'בדיקת תלונה על חיוב כפול בחשבון';
const NOW = new Date('2026-11-08T00:00:00Z');

function psql(sql: string): { ok: boolean; out: string; err: string } {
  const run = execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-Atq'], {
    encoding: 'utf8',
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return { ok: true, out: run, err: '' };
}

function psqlAllowFail(sql: string): { ok: boolean; out: string; err: string } {
  try {
    const out = execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-Atq'], {
      encoding: 'utf8',
      input: sql,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, out, err: '' };
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string };
    return { ok: false, out: failed.stdout ?? '', err: failed.stderr ?? '' };
  }
}

function memStore(): DekStore {
  const rows = new Map<string, WrappedDek>();
  return {
    async get(u) { return rows.get(u) ?? null; },
    async putIfAbsent(u, w) { if (!rows.has(u)) rows.set(u, w); return rows.get(u)!; },
  };
}

let prevKey: string | undefined;
beforeEach(() => {
  prevKey = process.env.PII_ENCRYPTION_KEY;
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  __resetFieldCrypto();
  setDekStoreForTests(memStore());
});
afterEach(() => { process.env.PII_ENCRYPTION_KEY = prevKey; });

describe('migrations 233 through 239 on one database', () => {
  it('keeps birth-date save, read and age, and seals the audit columns', async () => {
    expect(psql('select 1').out.trim()).toBe('1');
    psql(`
      delete from auth.users where id in ('${USER}', '${ACTOR}', '${SUBJECT}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      insert into auth.users (id, is_sso_user, is_anonymous) values
        ('${USER}', false, false), ('${ACTOR}', false, false), ('${SUBJECT}', false, false);
    `);
    const types = psql(`select column_name || '=' || data_type from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name in ('date_of_birth', 'birth_date') order by 1`).out.trim().split('\n');
    expect(types).toEqual(['birth_date=text', 'date_of_birth=text']);
    psql(`update public.profiles set date_of_birth = '1990-01-15', birth_date = '1990-01-15' where id = '${USER}'`);
    const saved = psql(`select (date_of_birth = birth_date) and char_length(date_of_birth) = 10 from public.profiles where id = '${USER}'`).out.trim();
    expect(saved).toBe('t');
    const raw = psql(`select date_of_birth from public.profiles where id = '${USER}'`).out.trim();
    const age = validateBirthDate(raw, NOW);
    expect(age).toEqual({ ok: true, age: 36 });

    const trigger = psql(`
      select (position('date_of_birth' in pg_get_triggerdef(t.oid)) > 0)::text
        || ' ' || (position('birth_date' in pg_get_triggerdef(t.oid)) > 0)::text
        || ' ' || (position('full_name' in pg_get_triggerdef(t.oid)) > 0)::text
      from pg_trigger t
      where t.tgname = 'zz_enc_reject_plaintext' and t.tgrelid = 'public.profiles'::regclass and not t.tgisinternal
    `).out.trim();
    expect(trigger).toBe('false false true');
    const flags = psql(`select table_name || '=' || active::text from public.field_enc_enforcement where table_name in ('profiles', 'pii_access_grants', 'access_audit_findings') order by 1`).out.trim().split('\n');
    expect(flags).toEqual(['access_audit_findings=false', 'pii_access_grants=false', 'profiles=false']);

    const enforced = psql(`
      begin;
      update public.field_enc_enforcement set active = true where table_name = 'profiles';
      do $$
      declare name_rejected boolean := false; dob_saved boolean := false; name_err text := '';
      begin
        begin
          update public.profiles set full_name = 'גלם גלוי' where id = '${USER}';
        exception when others then
          name_rejected := true;
          name_err := sqlerrm;
        end;
        update public.profiles set date_of_birth = '1991-06-15' where id = '${USER}';
        dob_saved := true;
        if not name_rejected or not dob_saved or position('גלם' in name_err) > 0 then
          raise exception 'enforcement regression failed';
        end if;
      end $$;
      select 'rolled';
      rollback;
    `);
    expect(enforced.out).toContain('rolled');
    expect(psql(`select date_of_birth = '1990-01-15' and (select active from public.field_enc_enforcement where table_name = 'profiles') = false from public.profiles where id = '${USER}'`).out.trim()).toBe('t');

    const run = psql(`insert into public.access_audit_runs (window_from, window_to) values (now() - interval '1 day', now()) returning id`).out.trim();
    const plainFinding = psql(`insert into public.access_audit_findings (run_id, severity, summary, event_kind) values ('${run}', 'low', '${WITHIN}', 'pii_grant') returning id`).out.trim();
    expect(psql(`select char_length(summary)::text from public.access_audit_findings where id = '${plainFinding}'`).out.trim()).toBe('400');
    const rejected = psqlAllowFail(`insert into public.access_audit_findings (run_id, severity, summary, event_kind) values ('${run}', 'low', '${OVER}', 'pii_grant')`);
    expect(rejected.ok).toBe(false);
    expect(rejected.err).toMatch(/access_audit_findings_summary_check/);
    const engineDetailHasPrefix = rejected.err.includes('ב'.repeat(8));
    expect(psql(`select count(*)::text from public.access_audit_findings where char_length(summary) > 400 and summary not like 'enc:v2:%'`).out.trim()).toBe('0');
    const night = Date.parse('2026-10-25T00:30:00Z');
    const auditDb = fakeDb({ results: {
      pii_access_log: [[], []],
      pii_access_grants: [[
        { created_at: new Date(night).toISOString(), actor_id: ACTOR, subject_id: SUBJECT, reason: 'חיוב', ticket_ref: null, country: 'IL', device_id: null },
        { created_at: new Date(night).toISOString(), actor_id: ACTOR, subject_id: USER, reason: 'חיוב', ticket_ref: null, country: 'IL', device_id: null },
      ]],
      ops_probe_daily: [[]], ops_device_enrollments: [[]],
      access_audit_runs: [{ id: 'run' }],
      access_audit_findings: [null],
    } });
    const audited = await runAccessAudit(auditDb as never, {
      now: night + 3600_000,
      model: async () => [
        { ref: 'e1', severity: 'high', summary: WITHIN },
        { ref: 'e2', severity: 'medium', summary: OVER },
      ],
    });
    expect(audited.findings).toBe(1);
    const writerRows = JSON.stringify(auditDb.calls.filter((c) => c.table === 'access_audit_findings'));
    expect(writerRows.includes(OVER)).toBe(false);
    expect(writerRows.includes('ב'.repeat(8))).toBe(false);
    expect(JSON.stringify(auditDb.calls.find((c) => c.op === 'update')?.args[0])).toContain('summary_too_long');

    const summaryPlan = await planAuditSummary(WITHIN);
    expect(summaryPlan.action).toBe('write');
    if (summaryPlan.action !== 'write') return;
    const sealedFinding = psql(`insert into public.access_audit_findings (run_id, severity, summary, event_kind) values ('${run}', 'low', '${summaryPlan.ciphertext.replace(/'/g, "''")}', 'pii_grant') returning id`).out.trim();
    const storedSummary = psql(`select summary from public.access_audit_findings where id = '${sealedFinding}'`).out.trim();
    expect(storedSummary.startsWith('enc:v2:')).toBe(true);
    expect(storedSummary.includes(WITHIN)).toBe(false);
    expect([...storedSummary].length).toBeGreaterThan(400);
    expect([...storedSummary].length).toBeLessThanOrEqual(4000);
    expect(await decryptValue('access_audit_findings', 'summary', 'system:audit', SYSTEM_ROW, storedSummary)).toBe(WITHIN);
    const summaryBatch = await runAuditSummaryBatch(
      [{ id: plainFinding, summary: WITHIN }],
      async (patch) => {
        psql(`update public.access_audit_findings set summary = '${patch.ciphertext.replace(/'/g, "''")}' where id = '${patch.id}' and summary = '${patch.previous.replace(/'/g, "''")}' and summary !~ '^enc:v2:'`);
      },
      true,
    );
    expect(summaryBatch).toMatchObject({ written: 1, failed: 0 });
    const summaryAgain = await runAuditSummaryBatch(
      [{ id: plainFinding, summary: psql(`select summary from public.access_audit_findings where id = '${plainFinding}'`).out.trim() }],
      async () => { throw new Error('second write'); },
      true,
    );
    expect(summaryAgain).toMatchObject({ written: 0, failed: 0, skipped: 1 });

    const reasonPlan = await planGrantReason(REASON);
    expect(reasonPlan.action).toBe('write');
    if (reasonPlan.action !== 'write') return;
    const plainGrant = psql(`insert into public.pii_access_grants (actor_id, subject_id, reason, expires_at) values ('${ACTOR}', '${SUBJECT}', '${REASON}', now() + interval '30 minutes') returning id`).out.trim();
    const sealedGrant = psql(`insert into public.pii_access_grants (actor_id, subject_id, reason, expires_at) values ('${ACTOR}', '${SUBJECT}', '${reasonPlan.ciphertext.replace(/'/g, "''")}', now() + interval '30 minutes') returning id`).out.trim();
    const storedReason = psql(`select reason from public.pii_access_grants where id = '${sealedGrant}'`).out.trim();
    expect(storedReason.startsWith('enc:v2:')).toBe(true);
    expect(storedReason.includes(REASON)).toBe(false);
    expect(await decryptValue('pii_access_grants', 'reason', 'system:audit', SYSTEM_ROW, storedReason)).toBe(REASON);
    const reasonBatch = await runGrantReasonBatch(
      [{ id: plainGrant, reason: REASON }],
      async (patch) => {
        psql(`update public.pii_access_grants set reason = '${patch.ciphertext.replace(/'/g, "''")}' where id = '${patch.id}' and reason = '${patch.previous.replace(/'/g, "''")}' and reason !~ '^enc:v2:'`);
      },
      true,
    );
    expect(reasonBatch).toMatchObject({ written: 1, failed: 0 });
    const reasonAgain = await runGrantReasonBatch(
      [{ id: plainGrant, reason: psql(`select reason from public.pii_access_grants where id = '${plainGrant}'`).out.trim() }],
      async () => { throw new Error('second write'); },
      true,
    );
    expect(reasonAgain).toMatchObject({ written: 0, failed: 0, skipped: 1 });

    psql(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'stack_reader') then create role stack_reader nologin; end if; end $$`);
    psql(`grant usage on schema public to stack_reader; grant select on public.access_audit_findings, public.pii_access_grants to stack_reader`);
    const reader = psql(`set role stack_reader; select count(*)::text from public.access_audit_findings; select count(*)::text from public.pii_access_grants`).out.trim().split('\n');
    expect(reader).toEqual(['0', '0']);
    const denied = psqlAllowFail(`set role authenticated; select summary from public.access_audit_findings`);
    expect(denied.ok).toBe(false);
    expect(denied.err.includes(WITHIN)).toBe(false);
    expect(denied.err.includes(REASON)).toBe(false);
    const rls = psql(`select c.relname || ' ' || c.relrowsecurity::text || ' ' || c.relforcerowsecurity::text from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('access_audit_findings', 'pii_access_grants') order by 1`).out.trim().split('\n');
    expect(rls).toEqual(['access_audit_findings true false', 'pii_access_grants true false']);
    expect(psql(`select to_regprocedure('public.parent_signup_begin(text,text,text)') is not null`).out.trim()).toBe('t');

    const report = {
      database: DB,
      chain: '000001-000232 plus 000233-000234 from the birth-date branch, 000235-000238 from this branch, 000239 from the identity branch',
      platformShims: ['publication supabase_realtime', 'function public.rls_auto_enable', 'schema realtime', 'foundation station row named by 000105'],
      dobColumns: 'text',
      dobTrigger238IncludesBirthColumns: false,
      dobSaveRead: true,
      age: 36,
      enforcementOff: true,
      plaintextNameRejectedWhenProfilesFlagOn: true,
      plaintextDobStillWrittenWhenProfilesFlagOn: true,
      hebrew400Stored: true,
      hebrew401Rejected: true,
      writerStoresSummaryTooLongWithoutText: true,
      engineDetailIncludesShortPrefix: engineDetailHasPrefix,
      summarySealed: true,
      reasonSealed: true,
      backfillSecondWrite: 0,
      readerRows: 0,
      authenticatedDenied: true,
      claimFunctionPresent: true,
    };
    writeFileSync('/opt/cursor/artifacts/stack-233-239.json', `${JSON.stringify(report, null, 2)}\n`);
    psql(`delete from auth.users where id in ('${USER}', '${ACTOR}', '${SUBJECT}')`);
  });
});
