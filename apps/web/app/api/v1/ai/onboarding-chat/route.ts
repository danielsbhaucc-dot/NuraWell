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
import { buildPrivacySafeProfileSummary } from '../../../../../lib/ai/onboarding-privacy-summary';
import { createProfileUpdateSession } from '../../../../../lib/ai/chat-sessions/create-profile-update-session';
import {
  buildFieldFlags,
  redactExtractedForClient,
  type ProfileFieldFlags,
} from '../../../../../lib/profile/extracted-field-flags';
import {
  buildFlagsFromProfileRow,
  buildPublicExtractedFromProfileRow,
  mergeProfileFlags,
} from '../../../../../lib/profile/profile-chat-bootstrap';
import { firstNameFrom } from '../../../../../lib/profile/personalized-copy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const fieldFlagsSchema = z.object({
  has_full_name: z.boolean().optional(),
  has_gender: z.boolean().optional(),
  has_main_goal: z.boolean().optional(),
  has_current_weight: z.boolean().optional(),
  has_goal_weight: z.boolean().optional(),
  has_weakest_time: z.boolean().optional(),
  has_main_obstacle: z.boolean().optional(),
  has_wake_time: z.boolean().optional(),
  has_sleep_time: z.boolean().optional(),
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
  extracted_public: z.record(z.unknown()).optional(),
  field_flags: fieldFlagsSchema.optional(),
  persist: z.boolean().optional(),
});

function mergeExtracted(
  base: OnboardingExtracted,
  patch: OnboardingExtracted
): OnboardingExtracted {
  return { ...base, ...patch };
}

function publicExtractedToProfilePatch(e: OnboardingExtracted): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (e.gender) patch.gender = e.gender;
  if (e.main_goal) patch.main_goal = e.main_goal;
  if (e.weakest_time_of_day) patch.weakest_time_of_day = e.weakest_time_of_day;
  if (e.main_obstacle) patch.main_obstacle = e.main_obstacle;
  if (e.main_obstacle_detail) patch.main_obstacle_detail = e.main_obstacle_detail;
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

    const publicExtracted = (parsed.data.extracted_public ?? {}) as OnboardingExtracted;
    const fieldFlags = (parsed.data.field_flags ?? {}) as ProfileFieldFlags;
    const path = (parsed.data.path ?? null) as OnboardingPath | null;

    const { data: profileRow } = await supabase
      .from('profiles')
      .select(
        'gender, full_name, main_goal, current_weight_kg, goal_weight_kg, weakest_time_of_day, main_obstacle, main_obstacle_detail, wake_up_time, sleep_time'
      )
      .eq('id', user.id)
      .maybeSingle();

    const dbFlags = buildFlagsFromProfileRow(profileRow);
    const dbPublic = buildPublicExtractedFromProfileRow(profileRow);
    const knownExtracted = mergeExtracted(dbPublic, publicExtracted);

    const gender =
      profileRow?.gender === 'male' || profileRow?.gender === 'female'
        ? profileRow.gender
        : knownExtracted.gender ?? null;

    const resolvedFlags = mergeProfileFlags(fieldFlags, dbFlags);

    const messages = (parsed.data.messages ?? []) as OnboardingChatTurn[];
    if (!parsed.data.is_opening && messages.length === 0 && !parsed.data.persist) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 });
    }

    let result = {
      reply: '',
      extracted: {} as OnboardingExtracted,
      request_discrete_field: null as import('../../../../../lib/ai/onboarding-discrete-fields').DiscreteFieldKey | null,
      ready_for_summary: false,
      summary: null as string | null,
      used_fallback: false,
      model: null as string | null,
    };

    if (!parsed.data.persist) {
      result = await runOnboardingChatTurn({
        messages,
        path,
        knownExtracted,
        fieldFlags: resolvedFlags,
        isOpening: parsed.data.is_opening,
        firstNameHint: firstNameFrom(profileRow?.full_name ?? null, ''),
        profileGender: gender,
      });
    }

    const mergedPublic = mergeExtracted(knownExtracted, result.extracted);

    let persisted = false;
    let profile_session_id: string | null = null;

    if (parsed.data.persist) {
      const patch = publicExtractedToProfilePatch(mergedPublic);
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
        persisted = !error;
      } else {
        persisted = true;
      }

      if (persisted) {
        const summaryExtracted: OnboardingExtracted = {
          ...mergedPublic,
          full_name: profileRow?.full_name ?? undefined,
          current_weight_kg: profileRow?.current_weight_kg ?? undefined,
          goal_weight_kg: profileRow?.goal_weight_kg ?? undefined,
          wake_up_time: profileRow?.wake_up_time?.slice(0, 5) ?? undefined,
          sleep_time: profileRow?.sleep_time?.slice(0, 5) ?? undefined,
        };
        const summary = buildPrivacySafeProfileSummary(summaryExtracted, gender);
        const session = await createProfileUpdateSession(supabase, {
          userId: user.id,
          summary,
        });
        profile_session_id = session.id;
      }
    }

    const responseFlags = buildFieldFlags({
      ...mergedPublic,
      full_name: profileRow?.full_name ?? undefined,
      current_weight_kg: profileRow?.current_weight_kg ?? undefined,
      goal_weight_kg: profileRow?.goal_weight_kg ?? undefined,
      wake_up_time: profileRow?.wake_up_time?.slice(0, 5) ?? undefined,
      sleep_time: profileRow?.sleep_time?.slice(0, 5) ?? undefined,
    });

    return NextResponse.json({
      reply: parsed.data.persist
        ? '✦ נשמר! תיעוד סגור נוסף להיסטוריה — בלי פרטים אישיים.'
        : result.reply,
      extracted_public: redactExtractedForClient(mergedPublic),
      field_flags: responseFlags,
      request_discrete_field: result.request_discrete_field,
      ready_for_summary: parsed.data.persist
        ? false
        : result.ready_for_summary ||
          (responseFlags.has_full_name &&
            responseFlags.has_main_goal &&
            (responseFlags.has_main_obstacle || responseFlags.has_weakest_time)),
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
