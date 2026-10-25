import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addMonths, buildUpdate, completeTask, dueState, dueTasks, nextDueAfter, parsePatch, todayIL } from '@/lib/legal/compliance-tasks';

describe('compliance task dates', () => {
  it('adds months and clamps month ends', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2027-11-30', 3)).toBe('2028-02-29');
    expect(addMonths('2026-10-25', 12)).toBe('2027-10-25');
  });
  it('rolls recurring tasks forward and leaves one-time without next due', () => {
    expect(nextDueAfter('monthly', '2026-10-25')).toBe('2026-11-25');
    expect(nextDueAfter('quarterly', '2026-10-25')).toBe('2027-01-25');
    expect(nextDueAfter('yearly', '2026-10-25')).toBe('2027-10-25');
    expect(nextDueAfter('one_time', '2026-10-25')).toBeNull();
    expect(completeTask({ recurrence: 'quarterly' }, '2026-11-15')).toEqual({ status: 'done', last_done: '2026-11-15', next_due: '2027-02-15' });
  });
  it('todayIL is Jerusalem date', () => {
    expect(todayIL(new Date('2026-10-25T22:30:00Z'))).toBe('2026-10-26');
  });
});

describe('due state', () => {
  const today = '2026-10-25';
  it('classifies overdue, soon, scheduled', () => {
    expect(dueState({ status: 'open', recurrence: 'one_time', next_due: '2026-10-01' }, today)).toBe('overdue');
    expect(dueState({ status: 'in_progress', recurrence: 'yearly', next_due: '2026-11-01' }, today)).toBe('due_soon');
    expect(dueState({ status: 'open', recurrence: 'yearly', next_due: '2027-01-01' }, today)).toBe('scheduled');
  });
  it('done one-time never comes back; done recurring returns when due; not relevant is ignored', () => {
    expect(dueState({ status: 'done', recurrence: 'one_time', next_due: '2026-01-01' }, today)).toBe('done');
    expect(dueState({ status: 'done', recurrence: 'quarterly', next_due: '2027-01-25' }, today)).toBe('done');
    expect(dueState({ status: 'done', recurrence: 'quarterly', next_due: '2026-10-20' }, today)).toBe('overdue');
    expect(dueState({ status: 'not_relevant', recurrence: 'monthly', next_due: '2026-01-01' }, today)).toBe('not_relevant');
  });
  it('dueTasks returns only actionable, sorted by date', () => {
    const r = dueTasks([
      { id: 'b', status: 'open', recurrence: 'one_time', next_due: '2026-11-01' },
      { id: 'a', status: 'open', recurrence: 'one_time', next_due: '2026-10-01' },
      { id: 'c', status: 'open', recurrence: 'one_time', next_due: '2027-06-01' },
    ] as never[], today) as Array<{ id: string }>;
    expect(r.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('patch validation', () => {
  it('accepts allowed fields only', () => {
    expect(parsePatch({ complete: true })).toEqual({ ok: true, patch: { complete: true } });
    expect(parsePatch({ status: 'in_progress', evidence: '  link ' })).toEqual({ ok: true, patch: { status: 'in_progress', evidence: 'link' } });
    expect(parsePatch({ status: 'hacked' }).ok).toBe(false);
    expect(parsePatch({ next_due: '25/10/2026' }).ok).toBe(false);
    expect(parsePatch({ title: 'x' }).ok).toBe(false);
    expect(parsePatch({ evidence: 'x'.repeat(2001) }).ok).toBe(false);
    expect(parsePatch(null).ok).toBe(false);
  });
  it('status done behaves like complete', () => {
    const u = buildUpdate({ recurrence: 'yearly' }, { status: 'done' }, '2026-10-25', 'u1');
    expect(u).toMatchObject({ status: 'done', last_done: '2026-10-25', next_due: '2027-10-25', updated_by: 'u1' });
  });
});

describe('migration 000180', () => {
  const sql = readFileSync(join(__dirname, '../../../supabase/migrations/000180_compliance_tasks.sql'), 'utf8');
  it('is admin-only with RLS', () => {
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/revoke all on public\.compliance_tasks from public, anon/);
    expect(sql).toMatch(/using \(public\.is_admin\(\)\)/);
    expect(sql).toMatch(/revoke all on function public\.compliance_tasks_due\(int\) from public, anon, authenticated/);
    expect(sql).not.toMatch(/for (insert|delete|all) to authenticated/);
  });
  it('seeds the agreed tasks and labels every price as an estimate', () => {
    for (const slug of ['dpo-appoint', 'privacy-lawyer-opinion', 'pentest-external', 'cyber-insurance', 'backup-restore-test', 'access-review', 'data-map-review', 'security-procedure-review', 'incident-drill', 'retention-purge-check', 'privacy-policy-review', 'key-backup-drill']) {
      expect(sql).toContain(`('${slug}'`);
    }
    const prices = sql.match(/'[^']*₪[^']*'/g) ?? [];
    expect(prices.length).toBeGreaterThanOrEqual(4);
    for (const p of prices) expect(p).toMatch(/^'הערכת שוק/);
  });
  it('the due endpoint is machine-guarded and the UI uses no native dialogs', () => {
    const due = readFileSync(join(__dirname, '../app/api/v1/ops/legal/compliance-tasks/due/route.ts'), 'utf8');
    expect(due).toMatch(/authorizeCronRequest\(request\)/);
    const ui = readFileSync(join(__dirname, '../components/admin/hub/ComplianceTasks.tsx'), 'utf8');
    expect(ui).not.toMatch(/\b(alert|confirm|prompt)\(/);
  });
});
