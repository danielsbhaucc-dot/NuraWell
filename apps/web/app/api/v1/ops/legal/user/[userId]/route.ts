import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { auditLegalAccess, decryptIp, loadUserEvidence } from '@/lib/legal/evidence-verify';
import { htmlToLines, referenceFor } from '@/lib/legal/evidence-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ userId: string }> }) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const { userId } = await ctx.params;
  if (!z.string().uuid().safeParse(userId).success) return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  const admin = createAdminClient();
  const { records, attestations } = await loadUserEvidence(admin, userId);
  const { data: prof } = await admin.from('profiles').select('full_name, gender').eq('id', userId).maybeSingle();
  const { data: au } = await admin.auth.admin.getUserById(userId);
  const { data: logs } = await admin.from('admin_audit_log').select('created_at, actor_id, path').eq('method', 'LEGAL').contains('detail', { user_id: userId }).order('created_at', { ascending: false }).limit(30);
  await auditLegalAccess(admin, auth.user.id, 'legal_view_timeline', { user_id: userId });
  return NextResponse.json(
    {
      user: { id: userId, name: (prof as { full_name?: string } | null)?.full_name ?? null, email: au.user?.email ?? null, created_at: au.user?.created_at ?? null },
      events: records.map((r) => {
        const atts = attestations.filter((a) => a.record_id === r.id);
        const tsa = atts.find((a) => a.kind === 'tsa');
        return {
          id: r.id,
          reference: referenceFor(r),
          created_at: r.created_at,
          action: r.action,
          source: r.source,
          text_version: r.text_version,
          typed_word: r.typed_word,
          checkbox: r.checkbox_checked,
          ip: decryptIp(r),
          user_agent: r.user_agent,
          record_hash: r.record_hash,
          has_screenshot: !!r.screenshot_sha256,
          text_lines: htmlToLines(r.rendered_html),
          tsa_time: (tsa?.payload.gen_time as string | undefined) ?? null,
          ots: (atts.find((a) => a.kind === 'ots')?.payload.proofs as unknown[] | undefined)?.length ?? 0,
          email_receipt: atts.some((a) => a.kind === 'email_receipt' && a.payload.ok === true),
        };
      }),
      access_log: logs ?? [],
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
