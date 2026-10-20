import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { auditLegalAccess } from '@/lib/legal/evidence-verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Users with consent evidence (latest first), optional search by name/email. */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { data, error } = await admin.from('consent_evidence').select('user_id, action, created_at').order('created_at', { ascending: false }).limit(2000);
  if (error) return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  const by = new Map<string, { user_id: string; events: number; last_action: string; last_at: string }>();
  for (const r of (data ?? []) as Array<{ user_id: string; action: string; created_at: string }>) {
    const cur = by.get(r.user_id);
    if (cur) cur.events++;
    else by.set(r.user_id, { user_id: r.user_id, events: 1, last_action: r.action, last_at: r.created_at });
  }
  const ids = [...by.keys()];
  const { data: profs } = ids.length ? await admin.from('profiles').select('id, full_name').in('id', ids) : { data: [] };
  const names = new Map(((profs ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, p.full_name]));
  const users = await Promise.all(
    [...by.values()].map(async (u) => {
      const { data: au } = await admin.auth.admin.getUserById(u.user_id);
      return { ...u, name: names.get(u.user_id) ?? null, email: au.user?.email ?? null };
    })
  );
  const q = new URL(request.url).searchParams.get('q')?.trim().toLowerCase();
  await auditLegalAccess(admin, auth.user.id, 'legal_list_users', { count: users.length });
  return NextResponse.json(
    { users: q ? users.filter((u) => `${u.name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(q)) : users },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
