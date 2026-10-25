import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasSensitiveStepUp } from '@/lib/ops/sensitive-stepup';

/** Every bulk/evidence export needs a fresh step-up. Returns a 403 to send, or null when allowed. Fails closed. */
export async function exportStepUpRefusal(supabase: SupabaseClient, userId: string, req: Request): Promise<NextResponse | null> {
  let ok = false;
  try {
    const { data } = await supabase.auth.getSession();
    ok = await hasSensitiveStepUp({ accessToken: data.session?.access_token, userId, req });
  } catch { ok = false; }
  return ok ? null : NextResponse.json({ error: 'נדרש אימות נוסף לפני ייצוא.', stepUp: true, code: 'stepup_required' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
}
