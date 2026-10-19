import { describe, expect, it, vi } from 'vitest';
import { forwardToDeveloper, issueBody, notifyDoneForwards, scrubPii, DEV_FORWARD_LABEL } from '@/lib/ceo/dev-forward';
import { TOOL_BY_NAME } from '@/lib/ceo/tools';

function fakeDb(names: string[] = [], doneRows: { id: string; title: string; or_notes: string | null }[] = []) {
  const writes: { op: string; p: unknown }[] = [];
  const chain = (result: unknown, awaited: unknown = result) => {
    const c: Record<string, unknown> = {};
    for (const k of ['eq', 'is', 'not', 'select', 'limit', 'in']) c[k] = () => c;
    c.single = async () => result;
    c.maybeSingle = async () => result;
    c.then = (r: (v: unknown) => unknown) => Promise.resolve(awaited).then(r);
    return c;
  };
  const db = {
    writes,
    from: () => ({
      select: () => {
        const c = chain({ data: doneRows.length ? doneRows : names.map((full_name) => ({ full_name })) });
        return c;
      },
      update: (p: unknown) => { writes.push({ op: 'update', p }); return chain({ data: { id: 'f1' }, error: null }, { data: [{ id: 'f1' }], error: null }); },
      insert: (p: unknown) => { writes.push({ op: 'insert', p }); return chain({ data: { id: 'f1' }, error: null }); },
    }),
  };
  return db as never as Parameters<typeof forwardToDeveloper>[0] & { writes: typeof writes };
}
const args = { title: 'ניסוח לא טבעי אצל דנה כהן', problem_he: 'דנה כתבה ל dana@x.com', problem_en: 'phrasing', evidence: 'id 3f2b1c4d-1111-2222-3333-444455556666, 054-1234567', suggested_fix: 'fix prompt' };

describe('Gideon → Or forward', () => {
  it('scrubs names, emails, phones, ids', () => {
    const s = scrubPii(`${args.title} ${args.problem_he} ${args.evidence}`, ['דנה כהן', 'דנה']);
    expect(s).not.toMatch(/דנה|dana@|054-1234567|3f2b1c4d/);
    expect(s).toContain('משתמש A');
  });

  it('is automatic (no Daniel approval)', () => {
    expect(TOOL_BY_NAME.get('forward_to_developer')?.write).toBe(false);
  });

  it('succeeds without a GitHub token: row saved as new, anonymized', async () => {
    delete process.env.GIDEON_GITHUB_TOKEN;
    const db = fakeDb(['דנה כהן']);
    const r = await forwardToDeveloper(db, args);
    expect(r).toEqual({ forward_id: 'f1' });
    const w = JSON.stringify(db.writes);
    expect(w).toContain('"status":"new"');
    expect(w).not.toMatch(/דנה|dana@/);
  });

  it('also opens a labeled issue when a token exists; GitHub failure is non-fatal', async () => {
    process.env.GIDEON_GITHUB_TOKEN = 'test';
    const ok = vi.fn(async (_u: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body)).labels).toEqual([DEV_FORWARD_LABEL]);
      return new Response(JSON.stringify({ number: 7, html_url: 'https://github.com/o/r/issues/7' }), { status: 201 });
    });
    expect(await forwardToDeveloper(fakeDb(), args, { fetch: ok as never })).toMatchObject({ forward_id: 'f1', issue_number: 7 });
    const bad = vi.fn(async () => new Response('no', { status: 403 }));
    expect(await forwardToDeveloper(fakeDb(), args, { fetch: bad as never })).toEqual({ forward_id: 'f1' });
    delete process.env.GIDEON_GITHUB_TOKEN;
  });

  it('batches finished items into one morning message', async () => {
    const sent: string[] = [];
    const n = await notifyDoneForwards(fakeDb([], [{ id: 'f1', title: 'ניסוח', or_notes: 'תוקן ב-PR', status: 'done', kind: 'finding' } as never]), async (t) => { sent.push(t); });
    expect(n).toBe(1);
    expect(sent[0]).toContain('עדכון בוקר מאור');
  });

  it('issue body is bilingual', () => {
    const b = issueBody({ ...args, evidence: '', suggested_fix: '' });
    expect(b).toContain('## הבעיה');
    expect(b).toContain('## Problem');
  });
});
