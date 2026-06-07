import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '../../../../../../lib/api/authorize-cron';
import { createAdminClient } from '../../../../../../lib/supabase/admin';
import { isAvoidPushActive } from '../../../../../../lib/ai/avoid-push';
import { isPassivePresenceEnabled } from '../../../../../../lib/churn/feature-flags';
import {
  buildPassiveBody,
  passivePresenceAllowed,
  planPassiveTouchForUser,
} from '../../../../../../lib/churn/passive-presence-batch';
import { patchPassiveTouch } from '../../../../../../lib/churn/patch-reengagement-context';
import { fetchNotifyUserProfile } from '../../../../../../lib/ai/notify-user-profile';
import { afterAlmogInAppNotification } from '../../../../../../lib/notifications/after-almog-insert';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Passive Presence cron (מערכת הנטישה, פרק 8). רץ פעם ביום; שולח לכל היותר
 * touch פסיבי אחד למשתמש churned, עם gate קשיח של הודעה אחת ל-7 ימים.
 *
 * הפעלה רק כש-CHURN_PASSIVE_PRESENCE_ENABLED=1. POST בלבד (Upstash Schedules).
 */
async function runPassivePresenceCron(request: Request) {
  const url = new URL(request.url);
  const dryRunRaw = url.searchParams.get('dryRun') ?? url.searchParams.get('dry_run');
  const isDryRun = dryRunRaw === '1' || dryRunRaw === 'true';

  if (!isPassivePresenceEnabled()) {
    return NextResponse.json({
      ok: true,
      skipped: 'feature_disabled',
      hint_he: 'הפעל CHURN_PASSIVE_PRESENCE_ENABLED=1 כדי להריץ.',
    });
  }

  const now = new Date();
  const admin = createAdminClient();

  const maxSends = Math.min(
    500,
    Math.max(1, Number(process.env.CRON_MAX_PASSIVE_PRESENCE_SENDS) || 200)
  );

  /** churned בלבד (14+ ימים). אינדקס idx_profiles_engagement_status תומך בשאילתה. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (admin as any)
    .from('profiles')
    .select('id, ai_context')
    .eq('engagement_status', 'churned')
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const profiles = (rows ?? []) as Array<{
    id: string;
    ai_context?: Record<string, unknown> | null;
  }>;

  let sent = 0;
  let skippedGate = 0;
  let skippedAvoid = 0;
  const errors: string[] = [];
  const sampleBodies: string[] = [];

  for (const profile of profiles) {
    if (sent >= maxSends) break;
    const userId = profile.id;
    try {
      if (isAvoidPushActive(profile.ai_context)) {
        skippedAvoid++;
        continue;
      }

      const allowed = await passivePresenceAllowed(admin, userId, now);
      if (!allowed) {
        skippedGate++;
        continue;
      }

      const plan = planPassiveTouchForUser({ now, aiContext: profile.ai_context });
      if (!plan) continue;

      const body = buildPassiveBody({ kind: plan.kind, trigger: plan.trigger, now });

      if (isDryRun) {
        if (sampleBodies.length < 5) sampleBodies.push(`${plan.kind}: ${body}`);
        sent++;
        continue;
      }

      const { firstName } = await fetchNotifyUserProfile(admin, userId);
      const title = `${firstName} 🌿`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insErr } = await (admin as any).from('notifications').insert({
        user_id: userId,
        type: 'ai_message',
        title,
        body,
        icon_emoji: '🌿',
        action_url: '/journey',
        is_read: false,
        is_sent: false,
        send_at: now.toISOString(),
        metadata: {
          source: 'almog_passive_presence',
          expects_reply: false,
          passive_kind: plan.kind,
          passive_trigger: plan.trigger ?? null,
          template: true,
          recipient_first_name: firstName,
        },
      });

      if (insErr) {
        errors.push(`${userId}: ${insErr.message}`);
        continue;
      }

      await patchPassiveTouch(admin, userId, plan.kind, now);
      afterAlmogInAppNotification(userId, title, body);
      sent++;
    } catch (e) {
      errors.push(`${userId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const summary = {
    ok: true,
    mode: isDryRun ? 'dry_run' : 'live',
    churned_candidates: profiles.length,
    sent,
    skipped_gate: skippedGate,
    skipped_avoid_push: skippedAvoid,
    errors_count: errors.length,
    ...(isDryRun ? { sample_bodies: sampleBodies } : {}),
  };

  console.log('[passive-presence CRON]', JSON.stringify(summary));
  if (errors.length > 0) {
    console.error('[passive-presence CRON errors]', JSON.stringify(errors));
  }

  return NextResponse.json({ ...summary, errors: errors.length ? errors : undefined });
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method Not Allowed — POST only' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}

export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  return runPassivePresenceCron(request);
}
