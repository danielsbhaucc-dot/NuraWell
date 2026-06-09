import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { scanResearchSource } from '@/lib/admin/research-scan';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const scanSchema = z.object({
  title: z.string().max(500).optional(),
  authors: z.string().max(500).optional(),
  year: z.string().max(32).optional(),
  journal: z.string().max(500).optional(),
  finding: z.string().max(8000).optional(),
  url: z.string().url().max(2000).nullable().optional(),
  sourceText: z.string().max(120000).optional(),
});

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = scanSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'נתונים לא תקינים', issues: parsed.error.flatten() }, { status: 400 });
  }

  const scan = await scanResearchSource(parsed.data);
  if (!scan.ok) {
    return NextResponse.json({ error: scan.error }, { status: scan.status });
  }

  return NextResponse.json({
    ok: true,
    sourceKind: scan.sourceKind,
    sourceText: scan.sourceText,
    model: scan.model,
    provider: scan.provider,
    ai_summary: scan.ai_summary,
    key_findings: scan.key_findings,
    practical_takeaway: scan.practical_takeaway,
    limitations: scan.limitations,
    evidence_level: scan.evidence_level,
    last_scanned_at: new Date().toISOString(),
    scan_status: 'ready',
  });
}
