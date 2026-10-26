import { notFound } from 'next/navigation';
import { createHash } from 'node:crypto';
import type { Metadata } from 'next';
import { checkEnrollment, wellFormedToken } from '@platform/access';
import { createAdminClient } from '@/lib/supabase/admin';
import { EnrollClient } from '@/components/ops/access/EnrollClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };

/** Hidden enrollment entry. Unknown/used/expired link → the same 404 as any other path. The claim happens on POST (link previews can't burn it). */
export default async function EnrollPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!wellFormedToken(token)) notFound();
  const { data } = await createAdminClient().from('ops_device_enrollments').select('id, token_hash, expires_at, used_at, revoked_at')
    .eq('token_hash', createHash('sha256').update(token).digest('hex')).maybeSingle();
  const r = data as { id: string; token_hash: string; expires_at: string; used_at: string | null; revoked_at: string | null } | null;
  const ok = checkEnrollment(r && { id: r.id, tokenHash: r.token_hash, expiresAt: Date.parse(r.expires_at), usedAt: r.used_at ? Date.parse(r.used_at) : null, revokedAt: r.revoked_at ? Date.parse(r.revoked_at) : null }, Date.now());
  if (!ok.ok) notFound();
  return <EnrollClient token={token} />;
}
