import { NextResponse } from 'next/server';
import { deepseek } from '../../../../../../lib/ai/client';
import { getDeepseekAnalysisModel } from '../../../../../../lib/ai/deepseek-model';
import {
  buildCronOpsNotification,
  daysSinceIso,
  decideStaleProfileAction,
  nudgeThresholdDays,
  type CronOpsAction,
} from '../../../../../../lib/ai/cron-ops-action';
import {
  cronOpsNotificationTitle,
  generateCronOpsNotificationBody,
} from '../../../../../../lib/ai/send-cron-ops-notification';
import { buildCrisisCooldownPatch, isAvoidPushActive } from '../../../../../../lib/ai/avoid-push';
import {
  cronOpsShouldUseLlm,
  fetchGhostingSignals,
  type HabitGapSignal,
} from '../../../../../../lib/ai/roller-coaster';
import { type AiUserContext } from '../../../../../../lib/ai/memory';
import { ANALYSIS_PROMPT } from '../../../../../../lib/ai/prompts';
import { authorizeCronRequest } from '../../../../../../lib/api/authorize-cron';
import { createAdminClient } from '../../../../../../lib/supabase/admin';

/** Batch ארוך + קריאות מודלים מרובות — Node לזמן הרצה ארוך יותר מבשרת Vercel Edge */
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Service-role Supabase client; tables like `ai_interactions` may be absent from generated `Database` types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = any;
const DAY_MS = 24 * 60 * 60 * 1000;

/** ברירת מחדל: תבניות קבועות. LLM רק כש-cronOpsShouldUseLlm מאשר (בעיקר כשיש notes ב-ai_context). ALMOG_CRON_USE_LLM=0 — אפס טוקנים לנודנ׳ים. */
function cronOpsUseLlm(): boolean {
  const v = process.env.ALMOG_CRON_USE_LLM?.trim().toLowerCase();
  return v !== '0' && v !== 'false';
}

async function resolveCronOpsBody(
  admin: AdminDb,
  params: {
    userId: string;
    action: Exclude<CronOpsAction, 'silent'>;
    reason: string;
    daysSinceActive: number;
    daysSinceLastWeight: number | null;
    streakDays: number | null;
    aiContext: Record<string, unknown>;
    fullName: string | null;
    urgency: 'low' | 'medium' | 'high';
    habitGap?: HabitGapSignal | null;
  }
): Promise<{ title: string; body: string; template: boolean }> {
  const useLlm =
    cronOpsUseLlm() &&
    cronOpsShouldUseLlm(params.action, params.urgency, params.aiContext, params.reason);

  if (!useLlm) {
    const draft = buildCronOpsNotification(
      params.action,
      params.fullName,
      params.streakDays,
      params.reason,
      params.daysSinceActive
    );
    if (!draft) throw new Error('no_template');
    return { title: draft.title, body: draft.body, template: true };
  }
  try {
    const body = await generateCronOpsNotificationBody(admin, {
      userId: params.userId,
      action: params.action,
      reason: params.reason,
      daysSinceActive: params.daysSinceActive,
      daysSinceLastWeight: params.daysSinceLastWeight,
      streakDays: params.streakDays,
      aiContext: params.aiContext,
      habitGap: params.habitGap ?? null,
    });
    return {
      title: cronOpsNotificationTitle(params.action, params.fullName),
      body,
      template: false,
    };
  } catch (e) {
    const draft = buildCronOpsNotification(
      params.action,
      params.fullName,
      params.streakDays,
      params.reason,
      params.daysSinceActive
    );
    if (!draft) throw e;
    console.warn('[cron/master] LLM notify fallback to template', {
      userId: params.userId,
      action: params.action,
      error: e instanceof Error ? e.message : String(e),
    });
    return { title: draft.title, body: draft.body, template: true };
  }
}

const ALLOWED_CONTEXT_PATCH_KEYS = new Set([
  'weakness_pattern',
  'engagement_pattern',
  'tone_notes',
  'commitment_status',
  'fatigue_signal',
  'dropout_risk',
  'current_mood_signal',
  'notes',
]);

async function daysSinceLastWeightKg(admin: AdminDb, userId: string): Promise<number | null> {
  const { data, error } = await admin
    .from('user_measurements')
    .select('measured_at')
    .eq('user_id', userId)
    .order('measured_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.measured_at) return null;
  return daysSinceIso(data.measured_at as string);
}

function parseAnalysisJson(raw: string): Partial<AiUserContext> {
  let t = raw.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  }
  const parsed = JSON.parse(t) as Record<string, unknown>;
  const out: Partial<AiUserContext> = {};
  for (const key of ALLOWED_CONTEXT_PATCH_KEYS) {
    const v = parsed[key];
    if (typeof v === 'string' && v.trim()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[key] = v.trim();
      continue;
    }
    if (typeof v === 'boolean') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[key] = v;
    }
  }
  return out;
}

async function runMasterCron() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing' }, { status: 500 });
  }

  const admin: AdminDb = createAdminClient();

  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const maxAnalysis = Math.min(100, Math.max(1, Number(process.env.CRON_MAX_ANALYSIS_USERS) || 20));
  const maxNudge = Math.min(100, Math.max(1, Number(process.env.CRON_MAX_NUDGE_USERS) || 20));
  const nudgeCooldownHours = Math.max(12, Number(process.env.CRON_NUDGE_COOLDOWN_HOURS) || 48);
  const cooldownIso = new Date(Date.now() - nudgeCooldownHours * 60 * 60 * 1000).toISOString();

  const errors: string[] = [];
  let analyzed = 0;
  let celebrated = 0;
  let churnNotificationsSent = 0;
  const actionCounts: Record<CronOpsAction, number> = {
    silent: 0,
    celebrate: 0,
    micro_win: 0,
    check_in: 0,
    re_engage: 0,
    crisis_reconnect: 0,
  };
  let analysisSkipped = 0;
  let nudgeSkipped = 0;

  // --- 1) Distinct users with ai_interactions in the last 24h → DeepSeek analysis → merge ai_context
  const { data: interactionRows, error: intErr } = await admin
    .from('ai_interactions')
    .select('user_id')
    .gte('created_at', sinceIso);

  if (intErr) {
    errors.push(`ai_interactions: ${intErr.message}`);
  } else {
    const userIds = [
      ...new Set((interactionRows as { user_id: string }[] | null)?.map((r) => r.user_id) ?? []),
    ].slice(0, maxAnalysis);

    for (const userId of userIds) {
      try {
        const { data: lines, error: linesErr } = await admin
          .from('ai_interactions')
          .select('role, content, context_type, created_at')
          .eq('user_id', userId)
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(40);

        if (linesErr) throw new Error(linesErr.message);
        const rows = (lines ?? []) as { role: string; content: string; context_type: string | null }[];
        if (rows.length === 0) {
          analysisSkipped++;
          continue;
        }

        const transcript = rows
          .reverse()
          .map((r) => `[${r.role}${r.context_type ? `/${r.context_type}` : ''}] ${r.content}`)
          .join('\n');

        const analysisModel = getDeepseekAnalysisModel();
        const completion = await deepseek.chat.completions.create({
          model: analysisModel,
          temperature: 0.2,
          messages: [
            { role: 'system', content: ANALYSIS_PROMPT },
            { role: 'user', content: `תמליל אינטראקציות (24 שעות אחרונות):\n\n${transcript}` },
          ],
        });

        const raw = completion.choices[0]?.message?.content?.trim();
        if (!raw) throw new Error('Empty analysis model output');

        let patch: Partial<AiUserContext>;
        try {
          patch = parseAnalysisJson(raw);
        } catch {
          throw new Error('Invalid JSON from analysis model');
        }

        if (Object.keys(patch).length === 0) {
          analysisSkipped++;
          continue;
        }

        const { data: prof, error: profErr } = await admin
          .from('profiles')
          .select('ai_context')
          .eq('id', userId)
          .single();

        if (profErr) throw new Error(profErr.message);

        const current = ((prof as { ai_context: AiUserContext | null } | null)?.ai_context ??
          {}) as AiUserContext;
        const merged = { ...current, ...patch };

        const { error: upErr } = await admin.from('profiles').update({ ai_context: merged }).eq('id', userId);
        if (upErr) throw new Error(upErr.message);
        analyzed++;
      } catch (e) {
        errors.push(`analysis ${userId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const maxCelebrate = Math.min(30, Math.max(1, Number(process.env.CRON_MAX_CELEBRATE_USERS) || 8));
  const threeDaysAgoIso = new Date(Date.now() - 3 * DAY_MS).toISOString();

  // --- 2a) רצף גבוה + פעילות אחרונה — חגיגה (בלי LLM)
  const { data: celebrateRows, error: celErr } = await admin
    .from('profiles')
    .select('id, full_name, last_active_at, ai_context, streak_days')
    .gte('streak_days', 7)
    .gte('last_active_at', threeDaysAgoIso)
    .limit(maxCelebrate);

  if (celErr) {
    errors.push(`profiles celebrate: ${celErr.message}`);
  } else {
    const celebrateProfiles = (celebrateRows ?? []) as {
      id: string;
      full_name: string | null;
      last_active_at: string | null;
      ai_context: Record<string, unknown> | null;
      streak_days: number | null;
    }[];

    for (const profile of celebrateProfiles) {
      const userId = profile.id;
      try {
        if (isAvoidPushActive(profile.ai_context ?? {})) {
          nudgeSkipped++;
          continue;
        }

        const { data: recentNudge } = await admin
          .from('notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('type', 'ai_message')
          .gte('created_at', cooldownIso)
          .limit(1);

        if (recentNudge && (recentNudge as unknown[]).length > 0) {
          nudgeSkipped++;
          continue;
        }

        const daysSinceActive = daysSinceIso(profile.last_active_at) ?? 0;
        const weightDays = await daysSinceLastWeightKg(admin, userId);
        const resolved = await resolveCronOpsBody(admin, {
          userId,
          action: 'celebrate',
          reason: 'streak_active_user',
          daysSinceActive,
          daysSinceLastWeight: weightDays,
          streakDays: profile.streak_days,
          aiContext: profile.ai_context ?? {},
          fullName: profile.full_name,
          urgency: 'low',
        });

        const { error: insErr } = await admin.from('notifications').insert({
          user_id: userId,
          type: 'ai_message',
          title: resolved.title,
          body: resolved.body,
          icon_emoji: '🌿',
          action_url: '/journey',
          is_read: false,
          is_sent: false,
          send_at: new Date().toISOString(),
          metadata: {
            source: 'cron_ops',
            action: 'celebrate' satisfies CronOpsAction,
            reason: 'streak_active_user',
            urgency: 'low',
            template: resolved.template,
          },
        });

        if (insErr) throw new Error(insErr.message);
        const { afterAlmogInAppNotification } = await import(
          '../../../../../../lib/notifications/after-almog-insert'
        );
        afterAlmogInAppNotification(userId, resolved.title, resolved.body);
        celebrated++;
        actionCounts.celebrate++;
      } catch (e) {
        errors.push(`celebrate ${userId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // --- 2b) נידג' לפי החלטת קצין מבצעים — LLM מותאם (fallback לתבנית)
  const twoDaysAgoIso = new Date(Date.now() - 2 * DAY_MS).toISOString();
  const { data: churnRows, error: stErr } = await admin
    .from('profiles')
    .select('id, full_name, last_active_at, ai_context, streak_days')
    .not('last_active_at', 'is', null)
    .lt('last_active_at', twoDaysAgoIso)
    .order('last_active_at', { ascending: false })
    .limit(maxNudge);

  if (stErr) {
    errors.push(`profiles churn: ${stErr.message}`);
  } else {
    const churnProfiles = (churnRows ?? []) as {
      id: string;
      full_name: string | null;
      last_active_at: string | null;
      ai_context: Record<string, unknown> | null;
      streak_days: number | null;
    }[];

    for (const profile of churnProfiles) {
      const userId = profile.id;
      try {
        const daysSinceActive = daysSinceIso(profile.last_active_at) ?? 999;
        const weightDays = await daysSinceLastWeightKg(admin, userId);
        const nudgeAfter = nudgeThresholdDays(profile.ai_context ?? {});
        const ghosting = await fetchGhostingSignals(admin, userId, {
          needUnanswered: daysSinceActive >= 2,
          needHabitGap: daysSinceActive <= 14,
        });
        const decision = decideStaleProfileAction({
          daysSinceActive,
          aiContext: profile.ai_context ?? {},
          daysSinceLastWeight: weightDays,
          nudgeAfterDays: nudgeAfter,
          ghosting,
        });

        if (decision.action === 'silent') {
          actionCounts.silent++;
          nudgeSkipped++;
          continue;
        }

        const { data: recentNudge } = await admin
          .from('notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('type', 'ai_message')
          .gte('created_at', cooldownIso)
          .limit(1);

        if (recentNudge && (recentNudge as unknown[]).length > 0) {
          nudgeSkipped++;
          continue;
        }

        let resolved: { title: string; body: string; template: boolean };
        try {
          resolved = await resolveCronOpsBody(admin, {
            userId,
            action: decision.action,
            reason: decision.reason,
            daysSinceActive,
            daysSinceLastWeight: weightDays,
            streakDays: profile.streak_days,
            aiContext: profile.ai_context ?? {},
            fullName: profile.full_name,
            urgency: decision.urgency,
            habitGap: ghosting.habitGap,
          });
        } catch {
          nudgeSkipped++;
          continue;
        }

        const { error: insErr } = await admin.from('notifications').insert({
          user_id: userId,
          type: 'ai_message',
          title: resolved.title,
          body: resolved.body,
          icon_emoji: '🌿',
          action_url: '/journey',
          is_read: false,
          is_sent: false,
          send_at: new Date().toISOString(),
          metadata: {
            source: 'cron_ops',
            action: decision.action,
            reason: decision.reason,
            urgency: decision.urgency,
            template: resolved.template,
          },
        });

        if (insErr) throw new Error(insErr.message);
        const { afterAlmogInAppNotification: afterNudge } = await import(
          '../../../../../../lib/notifications/after-almog-insert'
        );
        afterNudge(userId, resolved.title, resolved.body);

        if (decision.action === 'crisis_reconnect') {
          const ctx = (profile.ai_context ?? {}) as Record<string, unknown>;
          const merged = { ...ctx, ...buildCrisisCooldownPatch() };
          const { error: coolErr } = await admin
            .from('profiles')
            .update({ ai_context: merged })
            .eq('id', userId);
          if (coolErr) {
            errors.push(`crisis_cooldown ${userId}: ${coolErr.message}`);
          }
        }

        actionCounts[decision.action]++;
        churnNotificationsSent++;
      } catch (e) {
        errors.push(`cron_ops ${userId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  let journeyCompanionSent = 0;
  const maxJourneyCompanion = Math.min(
    25,
    Math.max(1, Number(process.env.CRON_MAX_JOURNEY_COMPANION) || 12)
  );
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const checkpointDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

  const { data: journeyCandidateRows, error: jErr } = await admin
    .from('profiles')
    .select('id, full_name, ai_context, last_active_at, created_at')
    .eq('onboarding_completed', true)
    .gte('last_active_at', thirtyDaysAgoIso)
    .limit(maxJourneyCompanion * 4);

  if (jErr) {
    errors.push(`journey_companion profiles: ${jErr.message}`);
  } else {
    const {
      fetchJourneyCompanionContext,
      gateJourneyCompanionNotify,
      shouldNudgeJourneyCompanion,
    } = await import('../../../../../../lib/workflows/journey-companion');
    const { sendJourneyCompanionNudge } = await import(
      '../../../../../../lib/workflows/send-journey-companion-nudge'
    );
    const { isAvoidPushActive: avoidPush } = await import('../../../../../../lib/ai/avoid-push');

    for (const profile of (journeyCandidateRows ?? []) as {
      id: string;
      full_name: string | null;
      ai_context: Record<string, unknown> | null;
      last_active_at: string | null;
      created_at: string;
    }[]) {
      if (journeyCompanionSent >= maxJourneyCompanion) break;
      const userId = profile.id;
      try {
        if (avoidPush(profile.ai_context ?? {})) continue;

        const companion = await fetchJourneyCompanionContext(admin, userId);
        if (!companion || !shouldNudgeJourneyCompanion(companion)) continue;

        const gate = await gateJourneyCompanionNotify(admin, userId, checkpointDate, {
          promiseDue: companion.followUpDue,
        });
        if (!gate.ok) continue;

        const result = await sendJourneyCompanionNudge(admin, userId, companion);
        if (!result?.inserted) continue;

        if (companion.followUpDue) {
          const { clearJourneyFollowUp } = await import(
            '../../../../../../lib/ai/journey-follow-up-promise'
          );
          await clearJourneyFollowUp(admin, userId);
        }

        const { afterAlmogInAppNotification } = await import(
          '../../../../../../lib/notifications/after-almog-insert'
        );
        const first =
          profile.full_name?.trim().split(/\s+/)[0]?.trim() || 'שם';
        afterAlmogInAppNotification(userId, `${first} 🌿`, result.body);
        journeyCompanionSent++;
      } catch (e) {
        errors.push(
          `journey_companion ${userId}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    window_hours: 24,
    analyzed,
    analysis_skipped: analysisSkipped,
    celebrated,
    journey_companion_sent: journeyCompanionSent,
    notifications_sent: celebrated + churnNotificationsSent + journeyCompanionSent,
    action_counts: actionCounts,
    nudge_skipped: nudgeSkipped,
    errors: errors.length ? errors : undefined,
  });
}

/**
 * POST בלבד.
 * GET נסגר במכוון: הוא יכול להתבצע מ-prefetch של דפדפן, CDN warmup, monitoring,
 * או ניווט שגוי, ולגרום לכתיבת אלפי notifications + קריאת DeepSeek בעלות.
 * Upstash QStash Schedules ממילא שולח POST (ראו docs/CRON_SCHEDULES_SETUP.md).
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Method Not Allowed — POST only' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}

export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  return runMasterCron();
}
