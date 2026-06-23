import { NextResponse } from 'next/server';

import { normalizeFrictionCategory, normalizeStrategyType } from '../../../../../lib/ai/almog-commitments/friction';
import {
  executeSosFlow,
  fetchSosContext,
  markInterventionNotHelped,
  recordSosOutcome,
  type SosFocusTask,
} from '../../../../../lib/ai/guardian/sos-memory';
import { beginSosCareAfterSos } from '../../../../../lib/ai/guardian/sos-care-loop';
import {
  filterRelevantSosEvents,
  saveSosCoachOnBlocker,
} from '../../../../../lib/ai/guardian/sos-ease-assignment';
import {
  buildDeterministicSosFallback,
  buildSosSlowDownMessage,
  normalizeSosTrigger,
  SOS_DAILY_SOFT_LIMIT,
  SOS_TIMEZONE,
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
  mode: 'intervention' | 'escalation' | 'slow_down' | 'pivot';
  intervention: SosIntervention;
  sos_count_today: number;
  event_id: string | null;
  intervention_id: string | null;
  blocker_id: string | null;
  context: {
    focus_task_title: string | null;
    focus_task_emoji: string | null;
    step_title: string | null;
    focus_task_id: string | null;
    step_id: string | null;
  };
  memory_hint: string | null;
  follow_up_scheduled: boolean;
  care_focus_active: boolean;
  pivot_attempt: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanText(value: unknown, max = 600): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function parseFocusTask(raw: unknown): SosFocusTask | null {
  const row = asRecord(raw);
  const id = cleanText(row.id, 120);
  const title = cleanText(row.title, 160);
  if (!title) return null;
  const pendingSlots = Array.isArray(row.pendingSlots)
    ? row.pendingSlots.filter((s): s is string => typeof s === 'string').slice(0, 4)
    : Array.isArray(row.pending_slots)
      ? row.pending_slots.filter((s): s is string => typeof s === 'string').slice(0, 4)
      : undefined;
  return {
    id: id || title,
    title,
    emoji: cleanText(row.emoji, 8) || undefined,
    stepTitle: cleanText(row.stepTitle ?? row.step_title, 120) || undefined,
    stepId: cleanText(row.stepId ?? row.step_id, 80) || undefined,
    pendingSlots,
  };
}

function parseFailedStrategyTypes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === 'string').slice(0, 6);
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

function buildContextPayload(focusTask: SosFocusTask | null) {
  return {
    focus_task_title: focusTask?.title ?? null,
    focus_task_emoji: focusTask?.emoji ?? null,
    step_title: focusTask?.stepTitle ?? null,
    focus_task_id: focusTask?.id ?? null,
    step_id: focusTask?.stepId ?? null,
  };
}

export async function GET(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const memoryLimit = Number(url.searchParams.get('memory_limit'));
    const eventsLimit = Number(url.searchParams.get('events_limit'));

    const admin = createAdminClient();
    const ctx = await fetchSosContext(admin, auth.user.id, {
      ...(Number.isFinite(memoryLimit) && memoryLimit > 0 ? { memoryLimit } : {}),
      ...(Number.isFinite(eventsLimit) && eventsLimit > 0 ? { eventsLimit } : {}),
    });
    return NextResponse.json({
      ok: true,
      ...ctx,
      recent_events: filterRelevantSosEvents(ctx.recent_events),
    });
  } catch (error) {
    console.error('[API /v1/ai/sos GET]', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const raw = await readJsonBody(request);
    if (!raw.ok) return raw.response;

    const body = asRecord(raw.value);
    const eventId = cleanText(body.event_id, 80);
    const interventionId = cleanText(body.intervention_id, 80) || null;
    const guardianOutcome = body.guardian_outcome === 'passed' ? 'passed' : 'fell';
    const helped = body.helped === true;

    if (!eventId) {
      return NextResponse.json({ ok: false, error: 'Missing event_id' }, { status: 400 });
    }

    const admin = createAdminClient();
    const ok = await recordSosOutcome({
      admin,
      userId: auth.user.id,
      eventId,
      interventionId,
      guardianOutcome,
      helped,
    });

    if (!ok) {
      return NextResponse.json({ ok: false, error: 'Failed to record outcome' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[API /v1/ai/sos PATCH]', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const raw = await readJsonBody(request);
    if (!raw.ok) return raw.response;

    const body = asRecord(raw.value);
    const action = cleanText(body.action, 20) || 'intervene';
    const note = cleanText(body.note);
    const trigger = normalizeSosTrigger(body.trigger);
    const focusTask = parseFocusTask(body.focus_task);
    const category = normalizeFrictionCategory(trigger);
    const admin = createAdminClient();
    const countToday = await countSosToday(admin, auth.user.id);
    const crisis = detectCrisisSignals(note);
    const nowIso = new Date().toISOString();
    const contextPayload = buildContextPayload(focusTask);
    const pivotAttempt = typeof body.pivot_attempt === 'number' ? body.pivot_attempt : 0;

    if (action === 'pivot') {
      const prevInterventionId = cleanText(body.intervention_id, 80) || null;
      const pivotFromLabel = cleanText(body.pivot_from_label, 120) || null;
      const failedTypes = parseFailedStrategyTypes(body.failed_strategy_types).map(normalizeStrategyType);

      await markInterventionNotHelped(admin, auth.user.id, prevInterventionId);

      const flow = await executeSosFlow({
        admin,
        userId: auth.user.id,
        trigger: category,
        focusTask,
        note,
        nowIso,
        failedStrategyTypes: failedTypes,
        attemptCount: pivotAttempt + 1,
        pivotFromLabel,
      });

      const eventId = await insertSosEvent(admin, {
        userId: auth.user.id,
        trigger,
        intervention: flow.intervention,
        outcome: 'unknown',
        redFlag: false,
        metadata: {
          source: 'almog_sos',
          pivot: true,
          pivot_attempt: pivotAttempt + 1,
          intervention_id: flow.interventionId,
          blocker_id: flow.blockerId,
          ...contextPayload,
        },
      });

      const care = eventId
        ? await beginSosCareAfterSos({
            admin,
            userId: auth.user.id,
            focusTask,
            eventId,
            blockerId: flow.blockerId,
          })
        : { focus: false, followUp: false };

      return NextResponse.json({
        ok: true,
        mode: 'pivot',
        intervention: flow.intervention,
        sos_count_today: countToday,
        event_id: eventId,
        intervention_id: flow.interventionId,
        blocker_id: flow.blockerId,
        context: contextPayload,
        memory_hint: flow.memoryHint,
        follow_up_scheduled: care.followUp,
        care_focus_active: care.focus,
        pivot_attempt: pivotAttempt + 1,
      } satisfies SosResponse);
    }

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
          ...contextPayload,
        },
      });

      return NextResponse.json({
        ok: true,
        mode: 'escalation',
        intervention: escalation,
        sos_count_today: countToday + 1,
        event_id: eventId,
        intervention_id: null,
        blocker_id: null,
        context: contextPayload,
        memory_hint: null,
        follow_up_scheduled: false,
        care_focus_active: false,
        pivot_attempt: 0,
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
          ...contextPayload,
        },
      });

      return NextResponse.json({
        ok: true,
        mode: 'slow_down',
        intervention,
        sos_count_today: countToday + 1,
        event_id: eventId,
        intervention_id: null,
        blocker_id: null,
        context: contextPayload,
        memory_hint: null,
        follow_up_scheduled: false,
        care_focus_active: false,
        pivot_attempt: 0,
      } satisfies SosResponse);
    }

    const flow = await executeSosFlow({
      admin,
      userId: auth.user.id,
      trigger: category,
      focusTask,
      note,
      nowIso,
    });

    if (flow.blockerId) {
      await saveSosCoachOnBlocker({
        admin,
        userId: auth.user.id,
        blockerId: flow.blockerId,
        intervention: flow.intervention,
        focusTask,
        nowIso,
      }).catch((err) => console.error('[sos] coach save failed', err));
    }

    const eventId = await insertSosEvent(admin, {
      userId: auth.user.id,
      trigger,
      intervention: flow.intervention,
      outcome: 'unknown',
      redFlag: false,
      metadata: {
        source: 'almog_sos',
        note_present: Boolean(note),
        note: note || null,
        used_fallback: flow.usedFallback,
        intervention_id: flow.interventionId,
        blocker_id: flow.blockerId,
        ...contextPayload,
      },
    });

    const care = eventId
      ? await beginSosCareAfterSos({
          admin,
          userId: auth.user.id,
          focusTask,
          eventId,
          blockerId: flow.blockerId,
        })
      : { focus: false, followUp: false };

    return NextResponse.json({
      ok: true,
      mode: 'intervention',
      intervention: flow.intervention,
      sos_count_today: countToday + 1,
      event_id: eventId,
      intervention_id: flow.interventionId,
      blocker_id: flow.blockerId,
      context: contextPayload,
      memory_hint: flow.memoryHint,
      follow_up_scheduled: care.followUp,
      care_focus_active: care.focus,
      pivot_attempt: 0,
    } satisfies SosResponse);
  } catch (error) {
    console.error('[API /v1/ai/sos POST]', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
