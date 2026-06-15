import { NextResponse } from 'next/server';

import { buildGuardianTouch } from '../../../../../../lib/ai/guardian/build-guardian-touch';
import { evaluateGuardianGate } from '../../../../../../lib/ai/guardian/guardian-gates';
import type { GuardianTriggerPayload } from '../../../../../../lib/ai/guardian/qstash-scheduler';
import type { RiskWindow } from '../../../../../../lib/ai/risk-window';
import { authorizeCronRequest } from '../../../../../../lib/api/authorize-cron';
import { readJsonBody } from '../../../../../../lib/api/json-request';
import { afterAlmogInAppNotification } from '../../../../../../lib/notifications/after-almog-insert';
import { createAdminClient } from '../../../../../../lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const SOURCE = 'almog_pre_lapse_guardian';

type ProfileRow = {
  id: string;
  full_name: string | null;
  ai_context: Record<string, unknown> | null;
  engagement_status: string | null;
  last_responded_at: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseWindow(raw: unknown): RiskWindow | null {
  if (!isRecord(raw)) return null;
  const weekday = raw.weekday === null ? null : Number(raw.weekday);
  const start = typeof raw.start_hhmm === 'string' ? raw.start_hhmm : '';
  const trigger = typeof raw.trigger === 'string' ? raw.trigger : '';
  const duration = Number(raw.duration_min);
  const confidence = Number(raw.confidence);
  const sample = Number(raw.sample_size);
  const distinctDates = Number(raw.distinct_dates);
  const validTrigger = [
    'logistical',
    'physiological',
    'cognitive',
    'emotional',
    'social',
    'knowledge',
    'motivational',
  ].includes(trigger);

  if (
    !(weekday === null || (Number.isInteger(weekday) && weekday >= 0 && weekday <= 6)) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) ||
    !validTrigger ||
    !Number.isFinite(duration) ||
    !Number.isFinite(confidence) ||
    !Number.isFinite(sample) ||
    !Number.isFinite(distinctDates)
  ) {
    return null;
  }

  return {
    weekday,
    start_hhmm: start,
    duration_min: duration,
    trigger: trigger as RiskWindow['trigger'],
    confidence,
    sample_size: sample,
    distinct_dates: distinctDates,
  };
}

function parsePayload(raw: unknown): GuardianTriggerPayload | null {
  if (!isRecord(raw)) return null;
  const window = parseWindow(raw.window);
  const userId = typeof raw.userId === 'string' ? raw.userId : '';
  const windowStartIso = typeof raw.windowStartIso === 'string' ? raw.windowStartIso : '';
  const triggerAtIso = typeof raw.triggerAtIso === 'string' ? raw.triggerAtIso : '';
  const leadMin = Number(raw.leadMin);
  if (
    !userId ||
    !window ||
    !Number.isFinite(new Date(windowStartIso).getTime()) ||
    !Number.isFinite(new Date(triggerAtIso).getTime()) ||
    !Number.isFinite(leadMin)
  ) {
    return null;
  }
  return {
    userId,
    window,
    windowStartIso,
    triggerAtIso,
    leadMin,
    source: 'habit_checkpoints_morning',
  };
}

function israelLocalDateAtUtc(dateKey: string, hhmm: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);
  const guessUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const israelShown = new Date(guessUtc.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const utcShown = new Date(guessUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = israelShown.getTime() - utcShown.getTime();
  return new Date(guessUtc.getTime() - offsetMs);
}

function israelDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function startOfIsraelToday(now: Date): Date {
  return israelLocalDateAtUtc(israelDateKey(now), '00:00');
}

async function countGuardianTouches(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  now: Date
): Promise<{ today: number; week: number }> {
  const todayStart = startOfIsraelToday(now);
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const { data } = await admin
    .from('notifications')
    .select('created_at, metadata')
    .eq('user_id', userId)
    .eq('type', 'ai_message')
    .gte('created_at', weekStart.toISOString())
    .limit(50);

  let today = 0;
  let week = 0;
  for (const row of (data ?? []) as Array<{ created_at?: string; metadata?: Record<string, unknown> | null }>) {
    if (row.metadata?.source !== SOURCE) continue;
    week += 1;
    const createdAt = new Date(String(row.created_at));
    if (Number.isFinite(createdAt.getTime()) && createdAt >= todayStart) {
      today += 1;
    }
  }
  return { today, week };
}

async function userRecentlyActive(
  admin: ReturnType<typeof createAdminClient>,
  profile: ProfileRow,
  now: Date
): Promise<boolean> {
  const since = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const respondedMs = profile.last_responded_at ? new Date(profile.last_responded_at).getTime() : NaN;
  if (Number.isFinite(respondedMs) && respondedMs >= since.getTime()) return true;

  const { data } = await admin
    .from('ai_interactions')
    .select('created_at')
    .eq('user_id', profile.id)
    .eq('role', 'user')
    .gte('created_at', since.toISOString())
    .limit(1);

  return Array.isArray(data) && data.length > 0;
}

export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const payload = parsePayload(raw.value);
  if (!payload) return NextResponse.json({ ok: false, error: 'Invalid guardian payload' }, { status: 400 });

  const admin = createAdminClient();
  const now = new Date();

  const { data: profileData, error: profileError } = await admin
    .from('profiles')
    .select('id, full_name, ai_context, engagement_status, last_responded_at')
    .eq('id', payload.userId)
    .maybeSingle();
  if (profileError) return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
  if (!profileData) return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });

  const profile = profileData as ProfileRow;
  const { data: dossierData } = await admin
    .from('user_memory_dossier')
    .select('risk_signals')
    .eq('user_id', payload.userId)
    .maybeSingle();

  const riskSignals =
    dossierData && isRecord((dossierData as { risk_signals?: unknown }).risk_signals)
      ? ((dossierData as { risk_signals: Record<string, unknown> }).risk_signals)
      : {};
  const counts = await countGuardianTouches(admin, payload.userId, now);
  const recentlyActive = await userRecentlyActive(admin, profile, now);

  const gate = evaluateGuardianGate({
    aiContext: profile.ai_context,
    engagementStatus: profile.engagement_status,
    riskSignals,
    window: payload.window,
    touchesToday: counts.today,
    touchesThisWeek: counts.week,
    recentlyActive,
    killSwitch: process.env.GUARDIAN_KILL_SWITCH === '1',
  });

  if (!gate.allowed) {
    return NextResponse.json({
      ok: true,
      sent: false,
      blocked: gate.reason,
      user_id: payload.userId,
    });
  }

  const touch = buildGuardianTouch({
    fullName: profile.full_name,
    window: payload.window,
    leadMin: payload.leadMin,
  });

  const { data: inserted, error: insertError } = await admin
    .from('notifications')
    .insert({
      user_id: payload.userId,
      type: 'ai_message',
      title: touch.title,
      body: touch.body,
      icon_emoji: touch.iconEmoji,
      action_url: '/home',
      is_read: false,
      is_sent: false,
      send_at: now.toISOString(),
      metadata: {
        source: SOURCE,
        expects_reply: true,
        mentor: 'almog',
        guardian: {
          trigger: payload.window.trigger,
          confidence: payload.window.confidence,
          sample_size: payload.window.sample_size,
          distinct_dates: payload.window.distinct_dates,
          window_start_hhmm: payload.window.start_hhmm,
          window_start_iso: payload.windowStartIso,
          trigger_at_iso: payload.triggerAtIso,
          lead_min: payload.leadMin,
        },
      },
    })
    .select('id')
    .maybeSingle();

  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  afterAlmogInAppNotification(payload.userId, touch.title, touch.body);

  return NextResponse.json({
    ok: true,
    sent: true,
    notification_id: (inserted as { id?: string } | null)?.id ?? null,
    user_id: payload.userId,
  });
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method Not Allowed — POST only' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}
