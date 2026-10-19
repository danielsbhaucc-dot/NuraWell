import { describe, expect, it, vi } from 'vitest';
import { createDevIssue, issueBody, scrubPii, DEV_FORWARD_LABEL } from '@/lib/ceo/dev-forward';
import { TOOL_BY_NAME } from '@/lib/ceo/tools';

function fakeDb(names: string[] = []) {
  const updates: unknown[] = [];
  const db = {
    updates,
    from: (t: string) => ({
      select: () => ({ not: () => ({ limit: async () => ({ data: names.map((full_name) => ({ full_name })) }) }) }),
      update: (p: unknown) => ({ eq: async () => { updates.push({ t, p }); return {}; } }),
      insert: async (p: unknown) => { updates.push({ t, p }); return {}; },
    }),
  };
  return db as never as Parameters<typeof createDevIssue>[0] & { updates: unknown[] };
}
const args = { title: 'ניסוח לא טבעי אצל דנה כהן', problem_he: 'דנה כתבה ל dana@x.com', problem_en: 'phrasing', evidence: 'id 3f2b1c4d-1111-2222-3333-444455556666, 054-1234567', suggested_fix: 'fix prompt' };

describe('Gideon → Or forward', () => {
  it('scrubs names, emails, phones, ids', () => {
    const s = scrubPii(`${args.title} ${args.problem_he} ${args.evidence}`, ['דנה כהן', 'דנה']);
    expect(s).not.toMatch(/דנה|dana@|054-1234567|3f2b1c4d/);
    expect(s).toContain('משתמש A');
  });

  it('is a write tool (requires Daniel approval)', () => {
    expect(TOOL_BY_NAME.get('forward_to_developer')?.write).toBe(true);
  });

  it('fails with a clear Hebrew message when no token, and records it', async () => {
    delete process.env.GIDEON_GITHUB_TOKEN;
    const db = fakeDb();
    await expect(createDevIssue(db, args)).rejects.toThrow(/GIDEON_GITHUB_TOKEN/);
    expect(JSON.stringify(db.updates)).toContain('failed');
  });

  it('creates a labeled, anonymized issue and returns its link', async () => {
    process.env.GIDEON_GITHUB_TOKEN = 'test';
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body));
      expect(b.labels).toEqual([DEV_FORWARD_LABEL]);
      expect(b.body).not.toMatch(/דנה|dana@/);
      return new Response(JSON.stringify({ number: 7, html_url: 'https://github.com/o/r/issues/7' }), { status: 201 });
    });
    const r = await createDevIssue(fakeDb(['דנה כהן']), args, { fetch: f as never });
    expect(r).toEqual({ issue_number: 7, link: 'https://github.com/o/r/issues/7' });
    delete process.env.GIDEON_GITHUB_TOKEN;
  });

  it('issue body is bilingual', () => {
    const b = issueBody({ ...args, evidence: '', suggested_fix: '' });
    expect(b).toContain('## הבעיה');
    expect(b).toContain('## Problem');
  });
});
