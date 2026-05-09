import { createSupabaseForApiRoute } from '../../../../../lib/supabase/api-route-client';
import { getUserAiMemory, upsertUserAiMemory } from '../../../../../lib/ai/user-memory';

export const runtime = 'edge';

const DUMMY_MEMORY = {
  commitments: ['לשתות מים בבוקר'],
  weaknesses: ['קשה לי בסופשים'],
  victories: ['סיימתי צום ארוך'],
  notes: [],
  habits_memory: [],
  tasks_memory: [],
  task_commitment_state: {},
  already_suggested: [],
  failure_patterns: [],
  personal_timeline: [],
};

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

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return new Response(JSON.stringify({ error: 'Not available in production' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    const { supabase, user, authError } = await createSupabaseForApiRoute(request);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    await upsertUserAiMemory(supabase, user.id, DUMMY_MEMORY, { replace: true });
    const memory = await getUserAiMemory(supabase, user.id);

    return new Response(JSON.stringify({ ok: true, memory }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to update user AI memory',
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
}

