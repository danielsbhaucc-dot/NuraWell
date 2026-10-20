import { NextResponse } from 'next/server';
import { strToU8 } from 'fflate';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { auditLegalAccess } from '@/lib/legal/evidence-verify';
import { sha256Hex } from '@/lib/legal/evidence-crypto';
import { fetchSupabaseLogs, fetchVercelContext } from '@/lib/legal/platform-logs';
import { buildLogsPdf } from '@/lib/legal/evidence-pdf';
import { verifyCode } from '@/lib/legal/verify-code';
import { contentDisposition, storeAndLogExport } from '@/lib/legal/export-store';
import { referenceFor } from '@/lib/legal/evidence-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * On demand only: provider-side logs for ONE consent event (no continuous copying). Delivered as an
 * AES-256 ZIP (raw JSON per provider + rendered PDF); the copy and its passphrase expire after 7 days,
 * the generation itself is logged permanently.
 */
export async function GET(request: Request, ctx: { params: Promise<{ userId: string }> }) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const { userId } = await ctx.params;
  const evidenceId = new URL(request.url).searchParams.get('evidence') ?? '';
  if (!z.string().uuid().safeParse(userId).success || !z.string().uuid().safeParse(evidenceId).success) return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  const admin = createAdminClient();
  const { data } = await admin.from('consent_evidence').select('id, user_id, created_at, record_hash, payload_json').eq('id', evidenceId).eq('user_id', userId).maybeSingle();
  const rec = data as { id: string; user_id: string; created_at: string; record_hash: string; payload_json: string } | null;
  if (!rec) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const requestId = (() => { try { const p = JSON.parse(rec.payload_json) as { request_id?: unknown }; return typeof p.request_id === 'string' ? p.request_id : null; } catch { return null; } })();
  await auditLegalAccess(admin, auth.user.id, 'legal_platform_logs_requested', { user_id: userId, evidence_id: rec.id });

  const [sb, vc] = await Promise.all([fetchSupabaseLogs(userId, rec.created_at, admin), fetchVercelContext(rec.created_at, requestId)]);
  const generatedAt = new Date().toISOString();
  const caseRef = `NW-LOGS-${generatedAt.slice(0, 10).replace(/-/g, '')}-${rec.record_hash.slice(0, 6).toUpperCase()}`;
  const files: Record<string, Uint8Array> = {};
  const providers = [sb, vc].map((p) => {
    const fileName = `${p.provider}-logs.json`;
    const bytes = strToU8(JSON.stringify({ provider: p.provider, source: p.source, status: p.status, note: p.note ?? null, fetched_at: generatedAt, evidence_id: rec.id, record_hash: rec.record_hash, request_id: requestId, rows: p.rows }, null, 2));
    files[fileName] = bytes;
    const sha = sha256Hex(bytes);
    return { ...p, fileName, sha256: sha, code: verifyCode(sha) };
  });
  const pdf = await buildLogsPdf({ caseRef, generatedAt, event: { reference: referenceFor(rec), createdAt: rec.created_at, recordHash: rec.record_hash, requestId }, providers });
  files['provider-logs.pdf'] = new Uint8Array(pdf);
  files['SHA256SUMS.txt'] = strToU8(Object.keys(files).sort().map((k) => `${sha256Hex(files[k]!)}  ${k}`).join('\n') + '\n');
  const { data: prof } = await admin.from('profiles').select('full_name').eq('id', userId).maybeSingle();
  const zipPlain = Buffer.from(JSON.stringify(Object.keys(files)));
  const logged = await storeAndLogExport(admin, { actorId: auth.user.id, kind: 'platform_logs', subject: userId, caseRef, format: 'zip', bytes: zipPlain, files, displayName: (prof as { full_name?: string } | null)?.full_name ?? null, recordHashes: [rec.record_hash], generatedAt });
  return new NextResponse(new Uint8Array(logged.bytes), {
    headers: { 'Content-Type': 'application/zip', 'Content-Disposition': contentDisposition(logged.fileName), 'Cache-Control': 'no-store', 'X-Export-SHA256': logged.sha, 'X-Export-Secret-Id': logged.secretId ?? '', 'X-Export-File': encodeURIComponent(logged.fileName), 'X-Content-Type-Options': 'nosniff' },
  });
}
