import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

/**
 * Gideon → Or (developer bot) pipeline. A finding becomes a GitHub issue labeled `from-gideon`
 * in DEV_FORWARD_REPO, only after Daniel's one-tap approval (it's a write tool, see tools.ts).
 * No PII leaves: names/emails/phones/ids are scrubbed before the issue is written.
 */
export const DEV_FORWARD_REPO = (process.env.GIDEON_GITHUB_REPO || 'danielsbhaucc-dot/NuraWell').trim();
export const DEV_FORWARD_LABEL = 'from-gideon';

export const forwardSchema = z.object({
  title: z.string().min(3).max(120),
  problem_he: z.string().min(3).max(2000),
  problem_en: z.string().min(3).max(2000),
  evidence: z.string().max(3000).default(''),
  suggested_fix: z.string().max(2000).default(''),
  forwardId: z.string().uuid().optional(),
});
export type ForwardArgs = z.infer<typeof forwardSchema>;

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE = /(?:\+?972|0)[\s-]?5\d(?:[\s-]?\d){7}/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const HANDLE = /(^|\s)@[A-Za-z0-9_]{3,}/g;

/** Remove identifying data. `names` = known user names (full + first) → "משתמש A/B/…". */
export function scrubPii(text: string, names: string[] = []): string {
  let out = text.replace(EMAIL, '[email]').replace(PHONE, '[phone]').replace(UUID, '[id]').replace(HANDLE, '$1[handle]');
  const uniq = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 2))].sort((a, b) => b.length - a.length);
  const alias = new Map<string, string>();
  for (const n of uniq) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^\\p{L}])${esc}(?=$|[^\\p{L}])`, 'gu');
    if (!re.test(out)) continue;
    const a = alias.get(n) ?? `משתמש ${String.fromCharCode(65 + alias.size)}`;
    alias.set(n, a);
    out = out.replace(new RegExp(`(^|[^\\p{L}])${esc}(?=$|[^\\p{L}])`, 'gu'), `$1${a}`);
  }
  return out;
}

async function knownNames(db: SupabaseClient): Promise<string[]> {
  const { data } = await db.from('profiles').select('full_name').not('full_name', 'is', null).limit(5000);
  return (data ?? []).flatMap((p: { full_name: string | null }) => {
    const f = p.full_name?.trim() ?? '';
    return f ? [f, f.split(/\s+/)[0]] : [];
  });
}

export function issueBody(a: ForwardArgs): string {
  return [
    '> Forwarded by **Gideon** (AI CEO) after Daniel approved it in Telegram. User data is anonymized.',
    '',
    '## הבעיה',
    a.problem_he,
    '',
    '## Problem',
    a.problem_en,
    a.evidence ? `\n## Evidence (anonymized)\n${a.evidence}` : '',
    a.suggested_fix ? `\n## Suggested fix\n${a.suggested_fix}` : '',
  ].join('\n');
}

/** Executes after approval. Throws a Hebrew message so Daniel sees exactly what's missing. */
export async function createDevIssue(db: SupabaseClient, raw: ForwardArgs, deps: { fetch?: typeof fetch } = {}) {
  const token = process.env.GIDEON_GITHUB_TOKEN?.trim();
  const names = await knownNames(db);
  const a: ForwardArgs = {
    ...raw,
    title: scrubPii(raw.title, names),
    problem_he: scrubPii(raw.problem_he, names),
    problem_en: scrubPii(raw.problem_en, names),
    evidence: scrubPii(raw.evidence ?? '', names),
    suggested_fix: scrubPii(raw.suggested_fix ?? '', names),
  };
  const body = issueBody(a);
  const rowId = raw.forwardId;
  const save = async (patch: Record<string, unknown>) => {
    if (rowId) await db.from('ceo_dev_forwards').update(patch).eq('id', rowId);
    else await db.from('ceo_dev_forwards').insert({ source: 'chat', ...patch });
  };
  if (!token) {
    await save({ title: a.title, body, status: 'failed', error: 'GIDEON_GITHUB_TOKEN missing' });
    throw new Error('חסר חיבור ל-GitHub (GIDEON_GITHUB_TOKEN), אז לא נפתחה משימה לאור. הממצא נשמר בלוח הבקרה.');
  }
  const res = await (deps.fetch ?? fetch)(`https://api.github.com/repos/${DEV_FORWARD_REPO}/issues`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: `[Gideon] ${a.title}`, body, labels: [DEV_FORWARD_LABEL] }),
  });
  if (!res.ok) {
    const err = `github ${res.status}`;
    await save({ title: a.title, body, status: 'failed', error: err });
    throw new Error(`GitHub סירב לפתוח את המשימה (${res.status}). הממצא נשמר בלוח הבקרה.`);
  }
  const j = (await res.json()) as { number: number; html_url: string };
  await save({ title: a.title, body, status: 'created', issue_number: j.number, issue_url: j.html_url, error: null });
  return { issue_number: j.number, link: j.html_url };
}

/** Save a digest so its "🛠️ העבר לאור" button can reference it. Returns the draft id. */
export async function saveDigestDraft(db: SupabaseClient, text: string): Promise<string | null> {
  const { data } = await db.from('ceo_dev_forwards').insert({ source: 'digest', source_text: text.slice(0, 20000), status: 'draft' }).select('id').single();
  return (data as { id: string } | null)?.id ?? null;
}

export const FORWARD_BUTTON_TEXT = '🛠️ העבר לאור';
export const forwardButton = (id: string) => ({ text: FORWARD_BUTTON_TEXT, data: `ceo:fd:${id}` });

/** Button press: turn the saved digest into a finding (one LLM call) and propose the action for approval. */
export async function proposeForwardFromDraft(
  db: SupabaseClient,
  draftId: string,
  deps: { extract: (text: string) => Promise<Omit<ForwardArgs, 'forwardId'> | null> },
) {
  const { data } = await db.from('ceo_dev_forwards').select('id, source_text, status').eq('id', draftId).maybeSingle();
  const row = data as { id: string; source_text: string | null; status: string } | null;
  if (!row?.source_text) return null;
  if (row.status === 'created') return { already: true as const };
  const names = await knownNames(db);
  const finding = await deps.extract(scrubPii(row.source_text, names));
  if (!finding) return { none: true as const };
  const { proposeAction } = await import('./actions');
  const a = await proposeAction(db, 'forward_to_developer', { ...finding, forwardId: row.id });
  await db.from('ceo_dev_forwards').update({ status: 'proposed', action_id: a.id, title: finding.title }).eq('id', row.id);
  return { action: a };
}

/** One model call: pick the technical/quality findings from a summary and write the issue fields. */
export async function extractFinding(text: string): Promise<Omit<ForwardArgs, 'forwardId'> | null> {
  const { complete } = await import('./llm');
  const { message } = await complete({
    sensitivity: 'sensitive',
    messages: [
      {
        role: 'system',
        content:
          'You turn a CEO summary into ONE developer issue for the NuraWell codebase. Keep only technical/quality findings (bugs, AI coach phrasing/quality, content gaps the code must handle, errors). Ignore pure business commentary. Never include names, emails, phones or ids; refer to people as "משתמש A". Return strict JSON: {"title": short English+Hebrew title, "problem_he": Hebrew, "problem_en": English, "evidence": quoted anonymized examples, "suggested_fix": concrete fix}. If there is nothing technical, return {"none": true}.',
      },
      { role: 'user', content: text.slice(0, 12000) },
    ],
  });
  const raw = (message.content ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    if (j.none) return null;
    const p = forwardSchema.omit({ forwardId: true }).safeParse(j);
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}
