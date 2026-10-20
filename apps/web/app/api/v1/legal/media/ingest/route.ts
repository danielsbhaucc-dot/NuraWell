import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';
import { markAbsent, processEntry, type ManifestEntry } from '@/lib/legal/media/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const commit = z.object({ sha: z.string().regex(/^[0-9a-f]{40}$/), author: z.string().max(200), date: z.string().max(40), subject: z.string().max(300) }).nullable().optional();
const entry = z.object({
  asset_key: z.string().min(3).max(400).regex(/^(repo|inline|font|library):/),
  origin: z.enum(['repo', 'inline', 'font', 'library']),
  kind: z.enum(['image', 'illustration', 'icon', 'audio', 'video', 'font', 'file']),
  path: z.string().max(400).nullable().optional(),
  public_url: z.string().max(400).nullable().optional(),
  title: z.string().max(300).nullable().optional(),
  mime: z.string().max(120).nullable().optional(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable().optional(),
  content_b64: z.string().max(4_000_000).nullable().optional(),
  usages: z.array(z.string().max(300)).max(60).optional(),
  first_commit: commit, last_commit: commit, commits: z.number().int().min(0).optional(),
  font_family: z.string().max(80).nullable().optional(),
  library: z.object({ name: z.string().max(120), version: z.string().max(40), license: z.string().max(40) }).nullable().optional(),
}).strict();
const body = z.object({ entries: z.array(entry).max(200), complete: z.boolean().optional(), seen: z.array(z.string().max(400)).max(5000).optional(), force: z.boolean().optional() }).strict();

/** CI scanner (full git history) posts the repo media manifest here. Repo/inline/font/library assets only. */
export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_manifest', issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  const admin = createAdminClient();
  const out = { new: 0, changed: 0, unchanged: 0, error: 0, cost: 0, errors: [] as string[], absent: 0 };
  const list = parsed.data.entries as ManifestEntry[];
  for (let i = 0; i < list.length; i += 3) {
    const res = await Promise.all(list.slice(i, i + 3).map((e) => processEntry(admin, e, null, { force: parsed.data.force }).then((r) => ({ e, r }))));
    for (const { e, r } of res) { out[r.outcome] += 1; out.cost += r.cost ?? 0; if (r.error) out.errors.push(`${e.asset_key}: ${r.error}`.slice(0, 200)); }
  }
  if (parsed.data.complete && parsed.data.seen) out.absent = await markAbsent(admin, ['repo', 'inline', 'font', 'library'], parsed.data.seen);
  return NextResponse.json(out);
}
