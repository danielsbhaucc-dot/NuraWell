import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mig = (n: string) => readFileSync(new URL(`../../../supabase/migrations/${n}`, import.meta.url), 'utf8');

describe('000259/000260 pii_access_log one-time reseal', () => {
  const open = mig('000259_pii_access_log_reseal.sql');
  const close = mig('000260_pii_access_log_reseal_close.sql');

  it('only a GUC-scoped plaintext -> enc:v2 change of one registered column passes the guard', () => {
    expect(open).toMatch(/current_setting\('pii\.reseal', true\)/);
    expect(open).toMatch(/must become enc:v2/);
    expect(open).toMatch(/changed = 1 and \(nj - array\['country', 'resource'\]\) = \(oj - array\['country', 'resource'\]\)/);
    expect(open).toMatch(/raise exception 'pii_access_log is append-only'/);
    // DELETE never passes: the exception branch is only for UPDATE
    expect(open).toMatch(/if tg_op = 'UPDATE' and/);
  });

  it('records the original hash before each swap and is service_role only', () => {
    const insertAt = open.indexOf('insert into public.legal_reseal_checkpoint');
    const updateAt = open.indexOf("execute format('update public.pii_access_log");
    expect(insertAt).toBeGreaterThan(0);
    expect(updateAt).toBeGreaterThan(insertAt);
    expect(open).toMatch(/revoke all on function public\.pii_reseal_apply\(jsonb\) from public, anon, authenticated/);
    expect(open).toMatch(/grant execute on function public\.pii_reseal_apply\(jsonb\) to service_role/);
    expect(open).not.toMatch(/update public\.field_enc_enforcement/);
  });

  it('000260 restores the hard append-only trigger and removes the apply path', () => {
    expect(close).toMatch(/execute function public\.pii_access_log_immutable\(\)/);
    expect(close).toMatch(/drop function if exists public\.pii_reseal_apply\(jsonb\)/);
    expect(close).toMatch(/drop function if exists public\.pii_access_log_guard\(\)/);
  });
});
