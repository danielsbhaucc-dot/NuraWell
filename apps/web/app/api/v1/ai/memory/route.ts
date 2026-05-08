import { createSupabaseForApiRoute } from '../../../../../lib/supabase/api-route-client';
import { getUserAiMemory } from '../../../../../lib/ai/user-memory';

export const runtime = 'edge';

export async function GET(request: Request) {
  try {
    const { supabase, user, authError } = await createSupabaseForApiRoute(request);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const memory = await getUserAiMemory(supabase, user.id);
    return new Response(JSON.stringify({ memory }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch user AI memory',
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
}

