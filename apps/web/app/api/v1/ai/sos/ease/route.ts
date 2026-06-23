import { NextResponse } from 'next/server';

import { normalizeFrictionCategory, normalizeStrategyType } from '../../../../../../lib/ai/almog-commitments/friction';
import { createSosEaseAssignment } from '../../../../../../lib/ai/guardian/sos-ease-assignment';
import type { SosIntervention } from '../../../../../../lib/ai/guardian/sos';
import type { SosFocusTask } from '../../../../../../lib/ai/guardian/sos-memory';
import { readJsonBody } from '../../../../../../lib/api/json-request';
import { requireApiSession } from '../../../../../../lib/api/route-guards';
import { createAdminClient } from '../../../../../../lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  return {
    id: id || title,
    title,
    emoji: cleanText(row.emoji, 8) || undefined,
    stepTitle: cleanText(row.stepTitle ?? row.step_title, 120) || undefined,
    stepId: cleanText(row.stepId ?? row.step_id, 80) || undefined,
  };
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const raw = await readJsonBody(request);
    if (!raw.ok) return raw.response;

    const body = asRecord(raw.value);
    const blockerId = cleanText(body.blocker_id, 80);
    const interventionRaw = asRecord(body.intervention);
    const focusTask = parseFocusTask(body.focus_task);

    if (!blockerId) {
      return NextResponse.json({ ok: false, error: 'Missing blocker_id' }, { status: 400 });
    }

    const intervention: SosIntervention = {
      message: cleanText(interventionRaw.message, 800) || '',
      label: cleanText(interventionRaw.label, 120) || 'צעד קטן',
      micro_step: cleanText(interventionRaw.micro_step, 400) || '',
      strategy_type: normalizeStrategyType(
        typeof interventionRaw.strategy_type === 'string' ? interventionRaw.strategy_type : undefined
      ),
      category: normalizeFrictionCategory(
        typeof interventionRaw.category === 'string' ? interventionRaw.category : undefined
      ),
      used_fallback: interventionRaw.used_fallback === true,
    };

    if (!intervention.micro_step) {
      return NextResponse.json({ ok: false, error: 'Missing intervention' }, { status: 400 });
    }

    const admin = createAdminClient();
    const result = await createSosEaseAssignment({
      admin,
      userId: auth.user.id,
      blockerId,
      intervention,
      focusTask,
      nowIso: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      assignment_id: result.assignment_id,
      frozen_journey_task: result.frozen_journey_task,
    });
  } catch (error) {
    console.error('[API /v1/ai/sos/ease POST]', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
