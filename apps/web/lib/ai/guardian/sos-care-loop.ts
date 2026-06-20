/**
 * לולאת "דאגה אנושית" אחרי SOS — הקפאת רעש, מעקב מתוזמן, ביטול כשבסדר.
 * לא מעקב רציף — נקודות מגע מעטות בשעות/ימים, עם בדיקה לפני שליחה.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { israelDayOffsetToUtcIso } from '../almog-commitments/time';
import type { SosFocusTask } from './sos-memory';

export type SosCareUrgency = 'normal' | 'still_hard';

type FollowUpPhase = 1 | 2 | 3;

const PHASE_COPY: Record<
  FollowUpPhase,
  { title: string; body: (taskLabel: string) => string }
> = {
  1: {
    title: 'איך היה אחרי הרגע? 🌿',
    body: (task) =>
      `לפני רגע לחצת "רגע… קשה לי" על ${task}. עבר? עדיין קשה? אני פה — בלי לחץ.`,
  },
  2: {
    title: 'חושב עליך 🌿',
    body: (task) =>
      `עדיין במחשבות על ${task}. הכל בסדר? אם קשה — אפשר לדבר, או שוב "רגע… קשה לי".`,
  },
  3: {
    title: 'אני כאן אם תרצה 💚',
    body: (task) =>
      `אתמול היה רגע קשה עם ${task}. לא שכחתי. אם תרצה — אני פה, בקצב שלך.`,
  },
};

function taskLabel(focusTask: SosFocusTask | null): string {
  return focusTask?.title ? `"${focusTask.title.slice(0, 48)}"` : 'הרגע הקשה';
}

function phaseDelayMs(phase: FollowUpPhase, urgency: SosCareUrgency, now: Date): number {
  if (phase === 1) return urgency === 'still_hard' ? 2 * 60 * 60_000 : 60 * 60_000;
  if (phase === 2) return urgency === 'still_hard' ? 6 * 60 * 60_000 : 8 * 60 * 60_000;
  const nextMorning = israelDayOffsetToUtcIso(now, 1, 10, 0);
  const ms = new Date(nextMorning).getTime() - now.getTime();
  return Math.max(12 * 60 * 60_000, ms);
}

export async function getSosEventOutcome(
  admin: SupabaseClient,
  eventId: string | null
): Promise<string | null> {
  if (!eventId) return null;
  const { data } = await admin
    .from('guardian_sos_events')
    .select('outcome')
    .eq('id', eventId)
    .maybeSingle();
  return (data as { outcome?: string } | null)?.outcome ?? null;
}

/** האם עדיין צריך לשלוח follow-up (רק כש-outcome unknown). */
export async function shouldDeliverSosFollowUp(
  admin: SupabaseClient,
  metadata: Record<string, unknown> | null | undefined
): Promise<boolean> {
  const eventId = typeof metadata?.event_id === 'string' ? metadata.event_id : null;
  if (!eventId) return true;
  const outcome = await getSosEventOutcome(admin, eventId);
  return outcome === 'unknown' || outcome === 'fell';
}

export async function cancelPendingSosFollowUps(
  admin: SupabaseClient,
  userId: string,
  eventId: string | null
): Promise<void> {
  if (!eventId) return;
  const { data: rows } = await admin
    .from('scheduled_reminders')
    .select('id, metadata')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .limit(30);

  const ids = ((rows ?? []) as Array<{ id: string; metadata: Record<string, unknown> | null }>)
    .filter(
      (r) =>
        r.metadata?.source === 'sos_followup' &&
        r.metadata?.event_id === eventId
    )
    .map((r) => r.id);

  if (!ids.length) return;
  await admin.from('scheduled_reminders').update({ status: 'cancelled' }).in('id', ids);
}

async function insertSosFollowUpReminder(params: {
  admin: SupabaseClient;
  userId: string;
  focusTask: SosFocusTask | null;
  eventId: string | null;
  blockerId: string | null;
  phase: FollowUpPhase;
  fireAtIso: string;
}): Promise<boolean> {
  if (!params.eventId) return false;
  const remKey = `sos-followup|${params.eventId}|p${params.phase}`;
  const { data: existing } = await params.admin
    .from('scheduled_reminders')
    .select('id')
    .eq('user_id', params.userId)
    .eq('dedupe_key', remKey)
    .maybeSingle();
  if (existing) return false;

  const label = taskLabel(params.focusTask);
  const copy = PHASE_COPY[params.phase];

  const { error } = await params.admin.from('scheduled_reminders').insert({
    user_id: params.userId,
    fire_at: params.fireAtIso,
    kind: 'followup',
    title: copy.title,
    body: copy.body(label),
    blocker_id: params.blockerId,
    status: 'pending',
    dedupe_key: remKey,
    metadata: {
      source: 'sos_followup',
      phase: params.phase,
      event_id: params.eventId,
      focus_task_id: params.focusTask?.id ?? null,
      focus_task_title: params.focusTask?.title ?? null,
    },
  });

  if (error) {
    console.error('[sos-care] follow-up schedule failed', { phase: params.phase, error });
    return false;
  }
  return true;
}

/** שלוש נקודות מגע — מבוטלות אוטומטית ברגע שיש משוב passed/fell. */
export async function scheduleSosFollowUpChain(params: {
  admin: SupabaseClient;
  userId: string;
  focusTask: SosFocusTask | null;
  eventId: string | null;
  blockerId: string | null;
  urgency?: SosCareUrgency;
  now?: Date;
}): Promise<{ scheduled: boolean; phases: number }> {
  if (!params.eventId) return { scheduled: false, phases: 0 };
  const now = params.now ?? new Date();
  const urgency = params.urgency ?? 'normal';

  await cancelPendingSosFollowUps(params.admin, params.userId, params.eventId);

  let phases = 0;
  for (const phase of [1, 2, 3] as FollowUpPhase[]) {
    const fireAt = new Date(now.getTime() + phaseDelayMs(phase, urgency, now)).toISOString();
    const ok = await insertSosFollowUpReminder({
      admin: params.admin,
      userId: params.userId,
      focusTask: params.focusTask,
      eventId: params.eventId,
      blockerId: params.blockerId,
      phase,
      fireAtIso: fireAt,
    });
    if (ok) phases += 1;
  }

  return { scheduled: phases > 0, phases };
}

/** מקפיא תזכורות משימות רגילות — "רק הרגע הזה". */
export async function activateSosFocusPeriod(params: {
  admin: SupabaseClient;
  userId: string;
  focusTask: SosFocusTask | null;
  eventId: string | null;
  blockerId: string | null;
  stillHard?: boolean;
  now?: Date;
}): Promise<{ activated: boolean }> {
  const now = params.now ?? new Date();
  const nowIso = now.toISOString();
  const hours = params.stillHard ? 48 : 24;
  const endsAt = new Date(now.getTime() + hours * 3_600_000).toISOString();

  const taskTitle = params.focusTask?.title;
  const reason = taskTitle
    ? `רגע קשה — נתמקד ב"${taskTitle}" בלי לחץ משימות אחרות`
    : 'רגע קשה — מורידים רעש, רק להיות איתך';

  const metadata = {
    source: 'sos_moment',
    event_id: params.eventId,
    blocker_id: params.blockerId,
    focus_task_id: params.focusTask?.id ?? null,
    focus_task_title: taskTitle ?? null,
  };

  const payload = {
    status: 'active' as const,
    reason,
    paused_scope: 'reminders' as const,
    started_at: nowIso,
    ends_at: endsAt,
    user_confirmed: true,
    metadata,
  };

  const { data: live } = await params.admin
    .from('almog_focus_periods')
    .select('id, metadata')
    .eq('user_id', params.userId)
    .in('status', ['proposed', 'active'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (live) {
    const liveMeta = (live as { metadata?: Record<string, unknown> }).metadata;
    const isSosFocus = liveMeta?.source === 'sos_moment';
    if (isSosFocus || params.stillHard) {
      await params.admin
        .from('almog_focus_periods')
        .update(payload)
        .eq('id', (live as { id: string }).id);
      return { activated: true };
    }
    return { activated: false };
  }

  const { error } = await params.admin.from('almog_focus_periods').insert({
    user_id: params.userId,
    ...payload,
  });

  if (error) {
    console.error('[sos-care] focus activate failed', error);
    return { activated: false };
  }
  return { activated: true };
}

export async function endSosFocusPeriod(
  admin: SupabaseClient,
  userId: string,
  now?: Date
): Promise<void> {
  const nowIso = (now ?? new Date()).toISOString();
  const { data: rows } = await admin
    .from('almog_focus_periods')
    .select('id, metadata')
    .eq('user_id', userId)
    .eq('status', 'active');

  for (const row of (rows ?? []) as Array<{ id: string; metadata: Record<string, unknown> | null }>) {
    if (row.metadata?.source !== 'sos_moment') continue;
    await admin
      .from('almog_focus_periods')
      .update({ status: 'ended', ends_at: nowIso })
      .eq('id', row.id);
  }
}

/** אחרי SOS מוצלח — פוקוס + שרשרת מעקב. */
export async function beginSosCareAfterSos(params: {
  admin: SupabaseClient;
  userId: string;
  focusTask: SosFocusTask | null;
  eventId: string | null;
  blockerId: string | null;
  now?: Date;
}): Promise<{ focus: boolean; followUp: boolean }> {
  const [focusRes, followRes] = await Promise.all([
    activateSosFocusPeriod({
      admin: params.admin,
      userId: params.userId,
      focusTask: params.focusTask,
      eventId: params.eventId,
      blockerId: params.blockerId,
      now: params.now,
    }),
    scheduleSosFollowUpChain({
      admin: params.admin,
      userId: params.userId,
      focusTask: params.focusTask,
      eventId: params.eventId,
      blockerId: params.blockerId,
      urgency: 'normal',
      now: params.now,
    }),
  ]);
  return { focus: focusRes.activated, followUp: followRes.scheduled };
}

/** אחרי משוב מהמשתמש — עדכון מעקב ופוקוס. */
export async function handleSosOutcomeCare(params: {
  admin: SupabaseClient;
  userId: string;
  eventId: string;
  focusTask: SosFocusTask | null;
  blockerId: string | null;
  guardianOutcome: 'passed' | 'fell';
  helped: boolean;
  pivotExhausted?: boolean;
  now?: Date;
}): Promise<void> {
  if (params.guardianOutcome === 'passed' || params.helped) {
    await cancelPendingSosFollowUps(params.admin, params.userId, params.eventId);
    await endSosFocusPeriod(params.admin, params.userId, params.now);
    return;
  }

  await activateSosFocusPeriod({
    admin: params.admin,
    userId: params.userId,
    focusTask: params.focusTask,
    eventId: params.eventId,
    blockerId: params.blockerId,
    stillHard: true,
    now: params.now,
  });

  if (params.pivotExhausted) {
    await scheduleSosFollowUpChain({
      admin: params.admin,
      userId: params.userId,
      focusTask: params.focusTask,
      eventId: params.eventId,
      blockerId: params.blockerId,
      urgency: 'still_hard',
      now: params.now,
    });
  }
}

/** לפני שליחה — אם כבר יש משוב, מבטלים את שאר התור. */
export async function skipSosFollowUpIfResolved(
  admin: SupabaseClient,
  userId: string,
  reminderId: string,
  metadata: Record<string, unknown> | null | undefined
): Promise<boolean> {
  const shouldSend = await shouldDeliverSosFollowUp(admin, metadata);
  if (shouldSend) return true;

  const eventId = typeof metadata?.event_id === 'string' ? metadata.event_id : null;
  await admin
    .from('scheduled_reminders')
    .update({ status: 'cancelled' })
    .eq('id', reminderId);
  if (eventId) {
    await cancelPendingSosFollowUps(admin, userId, eventId);
  }
  return false;
}
