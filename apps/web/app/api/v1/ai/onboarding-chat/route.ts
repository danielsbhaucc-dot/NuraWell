import { NextResponse } from 'next/server';
import { z } from 'zod';

import { readJsonBody } from '../../../../../lib/api/json-request';
import { requireApiSession } from '../../../../../lib/api/route-guards';
import {
  runOnboardingChatTurn,
  type OnboardingChatTurn,
  type OnboardingExtracted,
} from '../../../../../lib/ai/onboarding-chat-llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const bodySchema = z.object({
  user_id: z.string().uuid().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(40),
  /** אם true — לשמור את השדות שחולצו לפרופיל (אחרי אישור המשתמש) */
  persist: z.boolean().optional(),
});

/** מיפוי השדות שחולצו לעמודות profiles. */
function extractedToProfilePatch(e: OnboardingExtracted): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (e.full_name) patch.full_name = e.full_name;
  if (e.gender) patch.gender = e.gender;
  if (e.main_goal) patch.main_goal = e.main_goal;
  if (typeof e.current_weight_kg === 'number') patch.current_weight_kg = e.current_weight_kg;
  if (typeof e.goal_weight_kg === 'number') patch.goal_weight_kg = e.goal_weight_kg;
  if (e.weakest_time_of_day) patch.weakest_time_of_day = e.weakest_time_of_day;
  if (e.main_obstacle) patch.main_obstacle = e.main_obstacle;
  if (e.main_obstacle_detail) patch.main_obstacle_detail = e.main_obstacle_detail;
  if (e.wake_up_time) patch.wake_up_time = e.wake_up_time;
  if (e.sleep_time) patch.sleep_time = e.sleep_time;
  return patch;
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const raw = await readJsonBody(request);
    if (!raw.ok) return raw.response;

    const parsed = bodySchema.safeParse(raw.value);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { supabase, user } = auth;
    if (parsed.data.user_id && parsed.data.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await runOnboardingChatTurn(parsed.data.messages as OnboardingChatTurn[]);

    let persisted = false;
    if (parsed.data.persist) {
      const patch = extractedToProfilePatch(result.extracted);
      if (Object.keys(patch).length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('profiles')
          .update(patch)
          .eq('id', user.id);
        persisted = !error;
      }
    }

    return NextResponse.json({
      reply: result.reply,
      extracted: result.extracted,
      ready_for_summary: result.ready_for_summary,
      summary: result.summary,
      persisted,
      used_fallback: result.used_fallback,
      model: result.model,
    });
  } catch (error) {
    console.error('[API /v1/ai/onboarding-chat POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
