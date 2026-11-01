import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Migrations before this number are grandfathered (already applied, including ones that
// predate the search_path and explicit-grant rules).
const HYGIENE_FROM = 227;
const DIR = join(__dirname, '../../../supabase/migrations');

function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/**
 * Hygiene for new migrations:
 * - every `create [or replace] function public.<name>` needs `set search_path` before `as $$`,
 *   or a later `alter function public.<name> ... set search_path` in the same file.
 * - every `create table [if not exists] public.<name>` needs, in the same file, an explicit
 *   grant to service_role and RLS.
 *   From 2026-10-30 Supabase stops auto-granting new public tables to anon/authenticated/service_role,
 *   so a table without explicit grants would 42501 for the server.
 */
function migrationIssues(sql: string): string[] {
  const src = stripSqlComments(sql);
  const issues: string[] = [];
  const fnRe = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = fnRe.exec(src))) {
    const name = m[1];
    const afterName = m.index + m[0].length;
    const body = /as\s+\$\$/i.exec(src.slice(afterName));
    const header = body ? src.slice(afterName, afterName + body.index) : '';
    const pinned = body != null && /set\s+search_path\b/i.test(header);
    const altered = new RegExp(`alter\\s+function\\s+public\\.${name}\\b[^;]*\\bset\\s+search_path\\b`, 'i').test(src.slice(m.index));
    if (!pinned && !altered) {
      issues.push(`public.${name}: create function is missing set search_path before as $$ and has no later alter function ... set search_path`);
    }
    if (body) {
      const openAt = afterName + body.index + body[0].length;
      const close = src.indexOf('$$', openAt);
      fnRe.lastIndex = close === -1 ? openAt : close + 2;
    }
  }
  const tableRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  while ((m = tableRe.exec(src))) {
    const name = m[1];
    const grant = new RegExp(`grant\\b[^;]*\\bon\\s+(?:table\\s+)?public\\.${name}\\b[^;]*\\bto\\b[^;]*\\bservice_role\\b`, 'i');
    const rls = new RegExp(`alter\\s+table\\s+public\\.${name}\\s+enable\\s+row\\s+level\\s+security\\b`, 'i');
    if (!grant.test(src)) issues.push(`public.${name}: create table is missing grant ... on public.${name} ... to service_role`);
    if (!rls.test(src)) issues.push(`public.${name}: create table is missing alter table public.${name} enable row level security`);
  }
  return issues;
}

function inScope(filename: string): boolean {
  const n = /^(\d+)_.*\.sql$/.exec(filename);
  return n != null && Number(n[1]) >= HYGIENE_FROM;
}

/**
 * Default privileges used to grant ALL on a new public table to authenticated, including
 * TRUNCATE, which row level security does not cover (000180 / 000228). A new table must
 * revoke that role in the same file before any narrower grant.
 */
const authenticatedRevokeIssues = (sql: string): string[] => {
  const src = stripSqlComments(sql);
  const issues: string[] = [];
  const tableRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  let found: RegExpExecArray | null;
  while ((found = tableRe.exec(src))) {
    const name = found[1];
    const revoke = new RegExp(`revoke\\s+all\\s+on\\s+(?:table\\s+)?(?:public\\.)?${name}\\s+from\\b[^;]*\\bauthenticated\\b`, 'i');
    if (!revoke.test(src)) {
      issues.push(`public.${name}: create table must revoke all on public.${name} from authenticated (TRUNCATE bypasses row level security)`);
    }
  }
  return issues;
};

describe('migration hygiene parser', () => {
  it('accepts set search_path before the body', () => {
    const sql = `create or replace function public.ok(p text) returns text language sql immutable set search_path = '' as $$ select p $$;`;
    expect(migrationIssues(sql)).toEqual([]);
  });

  it('accepts a later alter function ... set search_path in the same file', () => {
    const sql = [
      `create function public.legal_reseal_cols(p_table text) returns text[]`,
      `language sql immutable as $$`,
      `  select case p_table when 'a' then array['b'] end`,
      `$$;`,
      `alter function public.legal_reseal_cols(text) set search_path = '';`,
    ].join('\n');
    expect(migrationIssues(sql)).toEqual([]);
  });

  it('rejects a function with no search_path', () => {
    const sql = `create function public.bad() language sql as $$ select 1 $$;`;
    expect(migrationIssues(sql).join('\n')).toMatch(/public\.bad: create function/);
  });

  it('rejects set search_path that appears only inside the body', () => {
    const sql = `create function public.bad() language sql as $$\nselect 'set search_path = public'\n$$;`;
    expect(migrationIssues(sql).join('\n')).toMatch(/public\.bad/);
  });

  it('rejects set search_path that appears only after the body', () => {
    const sql = `create function public.late() language sql as $$ select 1 $$ set search_path = '';`;
    expect(migrationIssues(sql).join('\n')).toMatch(/public\.late/);
  });

  it('does not treat an alter of a different function as a pin', () => {
    const sql = [
      `create function public.bad() language sql as $$ select 1 $$;`,
      `alter function public.other() set search_path = '';`,
    ].join('\n');
    expect(migrationIssues(sql).join('\n')).toMatch(/public\.bad/);
    expect(migrationIssues(sql).join('\n')).not.toMatch(/public\.other/);
  });

  it('accepts a table with a multi-line service_role grant and RLS', () => {
    const sql = `
      create table if not exists public.widget (
        id int primary key
      );
      alter table public.widget enable row level security;
      grant select, insert
        on table public.widget
        to service_role;
    `;
    expect(migrationIssues(sql)).toEqual([]);
  });

  it('rejects a table with no service_role grant', () => {
    const sql = `
      create table public.widget (id int);
      alter table public.widget enable row level security;
      grant select on public.widget to authenticated;
    `;
    const issues = migrationIssues(sql).join('\n');
    expect(issues).toMatch(/public\.widget: create table is missing grant/);
    expect(issues).not.toMatch(/row level security/);
  });

  it('rejects a table with no row level security', () => {
    const sql = `
      create table if not exists public.widget (id int);
      grant all on public.widget to service_role;
    `;
    const issues = migrationIssues(sql).join('\n');
    expect(issues).toMatch(/enable row level security/);
    expect(issues).not.toMatch(/missing grant/);
  });

  it('does not count a grant on a different table', () => {
    const sql = `
      create table public.widget (id int);
      alter table public.widget enable row level security;
      grant all on public.other to service_role;
    `;
    expect(migrationIssues(sql).join('\n')).toMatch(/public\.widget: create table is missing grant/);
  });

  it('ignores create statements that live only in comments', () => {
    const sql = `-- create function public.bad() language sql as $$\n-- select 1\n-- $$;\n-- create table public.widget (id int);`;
    expect(migrationIssues(sql)).toEqual([]);
  });

  it('requires a revoke from authenticated on a new table', () => {
    const sql = `
      create table public.widget (id int);
      alter table public.widget enable row level security;
      grant all on public.widget to service_role;
      grant select on public.widget to authenticated;
    `;
    expect(authenticatedRevokeIssues(sql).join('\n')).toMatch(/public\.widget/);
  });

  it('accepts revoke all from anon, authenticated before a narrower grant', () => {
    const sql = `
      create table if not exists public.widget (id int);
      revoke all on table public.widget from public, anon, authenticated;
      grant select on public.widget to authenticated;
      grant all on public.widget to service_role;
      alter table public.widget enable row level security;
    `;
    expect(authenticatedRevokeIssues(sql)).toEqual([]);
  });

  it('grandfathered prefixes stay out of scope', () => {
    expect(inScope('000226_modules_wp_stage1.sql')).toBe(false);
    expect(inScope('000225_legal_evidence_reseal.sql')).toBe(false);
    expect(inScope('000227_legal_reseal_cols_search_path.sql')).toBe(true);
    expect(inScope('000228_future.sql')).toBe(true);
    expect(inScope('readme.md')).toBe(false);
  });
});

describe('migrations from 000227 onward', () => {
  const files = readdirSync(DIR).filter(inScope).sort();

  it('includes 000227 and nothing older', () => {
    expect(files).toContain('000227_legal_reseal_cols_search_path.sql');
    for (const f of files) expect(Number(f.slice(0, 6))).toBeGreaterThanOrEqual(HYGIENE_FROM);
  });

  it('000227 pins search_path and passes the guard', () => {
    const sql = readFileSync(join(DIR, '000227_legal_reseal_cols_search_path.sql'), 'utf8');
    expect(sql).toMatch(/alter function public\.legal_reseal_cols\(text\) set search_path = ''/i);
    expect(migrationIssues(sql)).toEqual([]);
  });

  it('every in-scope migration passes', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const sql = readFileSync(join(DIR, f), 'utf8');
      expect(migrationIssues(sql), f).toEqual([]);
      const prefix = /^(\d+)_/.exec(f);
      if (prefix && Number(prefix[1]) >= 228) expect(authenticatedRevokeIssues(sql), f).toEqual([]);
    }
  });

  it('000228 revokes the compliance_tasks leftover and tightens postgres defaults', () => {
    const sql = readFileSync(join(DIR, '000228_api_grant_defaults.sql'), 'utf8');
    expect(sql).toMatch(/revoke all on table public\.compliance_tasks from public, anon, authenticated/i);
    expect(sql).toMatch(/grant select, update on table public\.compliance_tasks to authenticated/i);
    expect(sql).toMatch(/revoke all on sequences from public, anon, authenticated/i);
    expect(sql).toMatch(/revoke all on tables from authenticated/i);
    expect(migrationIssues(sql)).toEqual([]);
    expect(authenticatedRevokeIssues(sql)).toEqual([]);
  });
});
