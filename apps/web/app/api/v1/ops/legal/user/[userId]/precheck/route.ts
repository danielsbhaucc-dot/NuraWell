import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { auditLegalAccess, loadUserEvidence } from '@/lib/legal/evidence-verify';
import { runPreExportCheck, type FixAction } from '@/lib/legal/preexport-check';
import { maybeAnchorChainHead, sendReceipt } from '@/lib/legal/record-evidence';
import { requestTimestamp } from '@/lib/legal/tsa';
import { otsStamp } from '@/lib/legal/ots';
import { runOtsUpgrade } from '@/lib/legal/ots-upgrade-job';
import { normalizeGender } from '@/lib/legal/consent-text';
import { referenceFor } from '@/lib/legal/evidence-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Pre-export checklist for one user's consent records (admin only, every run audited). */
export async function GET(request: Request, ctx: { params: Promise<{ userId: string }> }) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const { userId } = await ctx.params;
  if (!z.string().uuid().safeParse(userId).success) return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  const admin = createAdminClient();
  const pc = await runPreExportCheck(admin, userId);
  await auditLegalAccess(admin, auth.user.id, 'legal_precheck', { user_id: userId, critical: pc.critical, warn: pc.warn });
  return NextResponse.json(pc, { headers: { 'Cache-Control': 'no-store' } });
}

const Body = z.object({ action: z.enum(['retry_tsa', 'ots_stamp', 'ots_upgrade', 'resend_receipt', 'anchor_chain']), event_ids: z.array(z.string().uuid()).max(50).optional() });

/** Runs one automatic fix. Only additive: new attestations are appended, signed records are never changed. */
export async function POST(request: Request, ctx: { params: Promise<{ userId: string }> }) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const { userId } = await ctx.params;
  if (!z.string().uuid().safeParse(userId).success) return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  const b = Body.safeParse(await request.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  const action: FixAction = b.data.action;
  const admin = createAdminClient();
  const { records, attestations } = await loadUserEvidence(admin, userId);
  const targets = records.filter((r) => !b.data.event_ids || b.data.event_ids.includes(r.id));
  let done = 0;
  if (action === 'retry_tsa') {
    for (const r of targets) {
      const t = await requestTimestamp(r.record_hash);
      if (!t.ok) continue;
      await admin.from('consent_evidence_attestations').insert({ record_id: r.id, kind: 'tsa', digest: r.record_hash, payload: { url: t.url, token_b64: t.tokenB64, nonce: t.nonceHex, gen_time: t.genTime, late: true, requested_by: auth.user.id } });
      done++;
    }
  } else if (action === 'ots_stamp') {
    for (const r of targets) {
      const p = await otsStamp(r.record_hash);
      if (!p.length) continue;
      await admin.from('consent_evidence_attestations').insert({ record_id: r.id, kind: 'ots', digest: r.record_hash, payload: { proofs: p, late: true } });
      done++;
    }
  } else if (action === 'ots_upgrade') {
    done = (await runOtsUpgrade(admin, { limit: 300 })).completed;
  } else if (action === 'anchor_chain') {
    done = (await maybeAnchorChainHead(admin, true)).anchored ? 1 : 0;
  } else if (action === 'resend_receipt') {
    const { data: prof } = await admin.from('profiles').select('gender').eq('id', userId).maybeSingle();
    const g = normalizeGender((prof as { gender?: string } | null)?.gender);
    for (const r of targets.filter((t) => !attestations.some((a) => a.record_id === t.id && a.kind === 'email_receipt' && a.payload.ok === true))) {
      await sendReceipt(admin, userId, r.id, r.action, r.created_at, referenceFor(r), g, r.record_hash);
      done++;
    }
  }
  await auditLegalAccess(admin, auth.user.id, 'legal_precheck_fix', { user_id: userId, action, events: targets.map((t) => t.id), done });
  const pc = await runPreExportCheck(admin, userId);
  return NextResponse.json({ done, ...pc }, { headers: { 'Cache-Control': 'no-store' } });
}
