import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim().toLowerCase() ?? '';
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '40', 10) || 40));

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profiles, error } = await (admin as any)
    .from('profiles')
    .select(
      `id, full_name, role, gender, main_goal, onboarding_completed, created_at, last_active_at,
      current_weight_kg, goal_weight_kg`
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let rows = profiles ?? [];
  if (q) {
    rows = rows.filter((p: { full_name?: string | null; id: string }) => {
      const name = (p.full_name ?? '').toLowerCase();
      return name.includes(q) || p.id.toLowerCase().includes(q);
    });
  }

  const sliced = rows.slice(0, limit);

  const withEmail = await Promise.all(
    sliced.map(async (p: { id: string }) => {
      const { data: au } = await admin.auth.admin.getUserById(p.id);
      return {
        ...p,
        email: au?.user?.email ?? null,
        email_confirmed: Boolean(au?.user?.email_confirmed_at),
      };
    })
  );

  return NextResponse.json({ users: withEmail, total: rows.length });
}
