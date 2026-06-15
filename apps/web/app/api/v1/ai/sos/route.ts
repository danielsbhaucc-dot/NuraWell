import { NextResponse } from 'next/server';

import { generateBlockerPivot, fetchInterventionMemory } from '../../../../../lib/ai/almog-commitments/intervention-engine';
import {
  buildDeterministicSosFallback,
  buildSosInterventionFromPivot,
  buildSosSlowDownMessage,
  normalizeSosTrigger,
  SOS_DAILY_SOFT_LIMIT,
  SOS_TIMEZONE,
  withTimeout,
  type SosIntervention,
} from '../../../../../lib/ai/guardian/sos';
import { readJsonBody } from '../../../../../lib/api/json-request';
import { requireApiSession } from '../../../../../lib/api/route-guards';
import { detectCrisisSignals } from '../../../../../lib/safety/crisis-detector';
import { createAdminClient } from '../../../../../lib/supabase/admin';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

type SosResponse = {
  ok: true;
  mode: 'intervention' | 'escalation' | 'slow_down';
  intervention: SosIntervention;
  sos_count_today: number;
  event_id: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanText(value: unknown, max = 600): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function countSosToday(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<number> {
  const { data, error } = await admin.rpc('count_guardian_sos_events_for_local_date', {
    p_user_id: userId,
    p_timezone: SOS_TIMEZONE,
  });

  if (error) {
    console.error('[sos] daily count rpc failed', error);
    return 0;
  }

  return typeof data === 'number' && Number.isFinite(data) ? data : 0;
}

async function insertSosEvent(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    userId: string;
    trigger: string;
    intervention: SosIntervention;
    outcome: 'unknown' | 'escalated';
    redFlag: boolean;
    metadata: Record<string, unknown>;
  }
): Promise<string | null> {
  const { data, error } = await admin
    .from('guardian_sos_events')
    .insert({
      user_id: params.userId,
      trigger: params.trigger,
      strategy_offered: params.intervention.strategy_type,
      outcome: params.outcome,
      red_flag: params.redFlag,
      metadata: params.metadata,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[sos] insert failed', error);
    return null;
  }

  return (data as { id?: string } | null)?.id ?? null;
}

export async function POST(request: Request) {
  try {
    if (process.env.GUARDIAN_KILL_SWITCH === '1') {
      return NextResponse.json({ ok: false, error: 'Guardian is disabled' }, { status: 503 });
    }
    if (process.env.GUARDIAN_SOS_ENABLED !== '1') {
      return NextResponse.json({ ok: false, error: 'Guardian SOS is disabled' }, { status: 503 });
    }

    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const raw = await readJsonBody(request);
    if (!raw.ok) return raw.response;

    const body = asRecord(raw.value);
    const note = cleanText(body.note);
    const trigger = normalizeSosTrigger(body.trigger);
    const admin = createAdminClient();
    const countToday = await countSosToday(admin, auth.user.id);
    const crisis = detectCrisisSignals(note);

    if (crisis.redFlag) {
      const intervention = buildDeterministicSosFallback(trigger);
      const escalation: SosIntervention = {
        ...intervention,
        label: 'עזרה עכשיו',
        message: crisis.escalationMessage ?? intervention.message,
        micro_step: crisis.escalationMessage ?? intervention.micro_step,
        used_fallback: true,
      };
      const eventId = await insertSosEvent(admin, {
        userId: auth.user.id,
        trigger,
        intervention: escalation,
        outcome: 'escalated',
        redFlag: true,
        metadata: {
          source: 'almog_sos',
          crisis_category: crisis.category,
          matched_text: crisis.matchedText,
        },
      });

      return NextResponse.json({
        ok: true,
        mode: 'escalation',
        intervention: escalation,
        sos_count_today: countToday + 1,
        event_id: eventId,
      } satisfies SosResponse);
    }

    if (countToday >= SOS_DAILY_SOFT_LIMIT) {
      const intervention = buildSosSlowDownMessage();
      const eventId = await insertSosEvent(admin, {
        userId: auth.user.id,
        trigger,
        intervention,
        outcome: 'unknown',
        redFlag: false,
        metadata: {
          source: 'almog_sos',
          anti_obsession: true,
          count_before_request: countToday,
        },
      });

      return NextResponse.json({
        ok: true,
        mode: 'slow_down',
        intervention,
        sos_count_today: countToday + 1,
        event_id: eventId,
      } satisfies SosResponse);
    }

    const description =
      note ||
      `SOS בזמן אמת: המשתמש סימן שקשה לו עכשיו. טריגר פנימי: ${trigger}. צריך התערבות קצרה, לא טיפולית, בלי אשמה ובלי עידוד הגבלה.`;

    let intervention = buildDeterministicSosFallback(trigger);
    try {
      const memory = await fetchInterventionMemory(admin, auth.user.id, 6);
      const pivot = await withTimeout(
        generateBlockerPivot({
          description,
          category: trigger,
          currentStrategy: null,
          attemptCount: 0,
          memory,
        })
      );
      intervention = buildSosInterventionFromPivot(pivot);
    } catch (error) {
      if ((error as Error)?.message !== 'SOS_LLM_TIMEOUT') {
        console.error('[sos] intervention fallback used', error);
      }
      intervention = buildDeterministicSosFallback(trigger);
    }

    const eventId = await insertSosEvent(admin, {
      userId: auth.user.id,
      trigger,
      intervention,
      outcome: 'unknown',
      redFlag: false,
      metadata: {
        source: 'almog_sos',
        note_present: Boolean(note),
        timeout_ms: intervention.used_fallback ? 2000 : null,
      },
    });

    return NextResponse.json({
      ok: true,
      mode: 'intervention',
      intervention,
      sos_count_today: countToday + 1,
      event_id: eventId,
    } satisfies SosResponse);
  } catch (error) {
    console.error('[API /v1/ai/sos POST]', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
