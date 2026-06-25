import { NextResponse } from 'next/server';
import { z } from 'zod';

import { readJsonBody } from '../../../../../lib/api/json-request';
import { requireApiSession } from '../../../../../lib/api/route-guards';
import {
  runOnboardingChatTurn,
  type OnboardingChatTurn,
  type OnboardingExtracted,
  type OnboardingPath,
} from '../../../../../lib/ai/onboarding-chat-llm';
import {
  applyDiscreteField,
  discreteFieldAck,
  type DiscreteFieldKey,
} from '../../../../../lib/ai/onboarding-discrete-fields';
import { buildPrivacySafeProfileSummary } from '../../../../../lib/ai/onboarding-privacy-summary';
import { createProfileUpdateSession } from '../../../../../lib/ai/chat-sessions/create-profile-update-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const discreteFieldSchema = z.object({
  key: z.enum(['full_name', 'current_weight_kg', 'goal_weight_kg', 'wake_up_time', 'sleep_time']),
  value: z.string().min(1).max(200),
});

const bodySchema = z.object({
  user_id: z.string().uuid().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      })
    )
    .max(40)
    .optional(),
  path: z.enum(['quick', 'fun']).optional(),
  is_opening: z.boolean().optional(),
  extracted: z.record(z.unknown()).optional(),
  discrete_field: discreteFieldSchema.optional(),
  persist: z.boolean().optional(),
});

function mergeExtracted(
  base: OnboardingExtracted,
  patch: OnboardingExtracted
): OnboardingExtracted {
  return { ...base, ...patch };
}

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

    let extracted = (parsed.data.extracted ?? {}) as OnboardingExtracted;
    const path = (parsed.data.path ?? null) as OnboardingPath | null;
    const gender = extracted.gender ?? null;

    if (parsed.data.discrete_field) {
      const { key, value } = parsed.data.discrete_field;
      const applied = applyDiscreteField(extracted, key as DiscreteFieldKey, value);
      if (!applied.ok) {
        return NextResponse.json({ error: applied.error }, { status: 400 });
      }
      extracted = applied.extracted;

      return NextResponse.json({
        reply: discreteFieldAck(key as DiscreteFieldKey, gender),
        extracted,
        request_discrete_field: null,
        ready_for_summary: false,
        summary: null,
        persisted: false,
        discrete_ack: true,
        used_fallback: false,
        model: null,
      });
    }

    const messages = (parsed.data.messages ?? []) as OnboardingChatTurn[];
    if (!parsed.data.is_opening && messages.length === 0) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 });
    }

    const result = await runOnboardingChatTurn({
      messages,
      path,
      knownExtracted: extracted,
      isOpening: parsed.data.is_opening,
    });

    extracted = mergeExtracted(extracted, result.extracted);

    let persisted = false;
    let profile_session_id: string | null = null;

    if (parsed.data.persist) {
      const patch = extractedToProfilePatch(extracted);
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
        persisted = !error;
      }

      if (persisted) {
        const summary = buildPrivacySafeProfileSummary(extracted, gender);
        const session = await createProfileUpdateSession(supabase, {
          userId: user.id,
          summary,
        });
        profile_session_id = session.id;
      }
    }

    return NextResponse.json({
      reply: result.reply,
      extracted,
      request_discrete_field: result.request_discrete_field,
      ready_for_summary: result.ready_for_summary,
      summary: result.summary,
      persisted,
      profile_session_id,
      used_fallback: result.used_fallback,
      model: result.model,
    });
  } catch (error) {
    console.error('[API /v1/ai/onboarding-chat POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
