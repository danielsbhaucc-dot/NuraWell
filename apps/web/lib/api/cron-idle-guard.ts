import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Early exit ל-cron routes כשאין עבודה רלוונטית — חוסך Fluid CPU ב-pre-launch.
 * כשיש משתמשים/תורים/לוגים — ה-cron רץ במלואו (כולל כל 30 דק' לדיוק check-in).
 *
 * CRON_IDLE_SKIP=0 — מבטל את האופטימיזציה (תמיד ריצה מלאה).
 * ?force=1 / dryRun=1 — עוקפים idle skip לבדיקות.
 */

export type CronIdleProfile =
  | 'onboarding-check-ins'
  | 'habit-checkpoints'
  | 'master'
  | 'memory-consolidation'
  | 'auto-close-chat-sessions'
  | 'habit-target-tune'
  | 'passive-presence'
  | 'almog-reminders';

export type CronIdleSkipPayload = {
  ok: true;
  skipped: 'idle';
  profile: CronIdleProfile;
  counts: Record<string, number>;
  hint_he: string;
};

type CountQuery = ReturnType<ReturnType<SupabaseClient['from']>['select']>;

function isIdleWhenEmpty(...values: number[]): boolean {
  return values.every((n) => n !== -1 && n === 0);
}

async function countExact(
  admin: SupabaseClient,
  table: string,
  filters?: (query: CountQuery) => CountQuery
): Promise<number> {
  const baseQuery = admin.from(table).select('*', { count: 'exact', head: true });
  const query = filters ? filters(baseQuery) : baseQuery;
  const { count, error } = await query;
  if (error) {
    console.warn(`[cron-idle-guard] count ${table} failed`, error.message);
    return -1;
  }
  return count ?? 0;
}

export function isCronIdleSkipEnabled(): boolean {
  const env = process.env.CRON_IDLE_SKIP?.trim().toLowerCase();
  return env !== '0' && env !== 'false' && env !== 'off';
}

export function shouldBypassCronIdleSkip(request: Request): boolean {
  const url = new URL(request.url);
  const force = url.searchParams.get('force');
  if (force === '1' || force === 'true') return true;

  const dryRun = url.searchParams.get('dryRun') ?? url.searchParams.get('dry_run');
  if (dryRun === '1' || dryRun === 'true') return true;

  return !isCronIdleSkipEnabled();
}

export async function evaluateCronIdleSkip(
  admin: SupabaseClient,
  profile: CronIdleProfile
): Promise<{ idle: boolean; counts: Record<string, number> }> {
  const counts: Record<string, number> = {};

  const onboarded = await countExact(admin, 'profiles', (q) =>
    q.eq('onboarding_completed', true)
  );
  counts.onboarded_profiles = onboarded;

  switch (profile) {
    case 'onboarding-check-ins':
    case 'almog-reminders': {
      const pendingReminders = await countExact(admin, 'scheduled_reminders', (q) =>
        q.eq('status', 'pending')
      );
      counts.pending_reminders = pendingReminders;
      return { idle: isIdleWhenEmpty(onboarded, pendingReminders), counts };
    }

    case 'habit-checkpoints': {
      const progress = await countExact(admin, 'journey_progress');
      counts.journey_progress = progress;
      return { idle: isIdleWhenEmpty(onboarded, progress), counts };
    }

    case 'master': {
      const totalProfiles = await countExact(admin, 'profiles');
      counts.profiles = totalProfiles;
      const pendingLogs = await countExact(admin, 'pending_chat_logs', (q) =>
        q.eq('processed', false)
      );
      counts.pending_chat_logs = pendingLogs;
      return { idle: isIdleWhenEmpty(totalProfiles, pendingLogs), counts };
    }

    case 'memory-consolidation': {
      const pendingLogs = await countExact(admin, 'pending_chat_logs', (q) =>
        q.eq('processed', false)
      );
      counts.pending_chat_logs = pendingLogs;
      return { idle: isIdleWhenEmpty(pendingLogs), counts };
    }

    case 'auto-close-chat-sessions': {
      const openSessions = await countExact(admin, 'chat_sessions', (q) =>
        q.eq('status', 'open')
      );
      counts.open_chat_sessions = openSessions;
      return { idle: isIdleWhenEmpty(openSessions), counts };
    }

    case 'habit-target-tune':
      return { idle: isIdleWhenEmpty(onboarded), counts };

    case 'passive-presence': {
      const churned = await countExact(admin, 'profiles', (q) =>
        q.eq('engagement_status', 'churned')
      );
      counts.churned_profiles = churned;
      return { idle: isIdleWhenEmpty(churned), counts };
    }

    default:
      return { idle: false, counts };
  }
}

export function buildCronIdleSkipResponse(
  profile: CronIdleProfile,
  counts: Record<string, number>
): NextResponse {
  const payload: CronIdleSkipPayload = {
    ok: true,
    skipped: 'idle',
    profile,
    counts,
    hint_he:
      'אין עבודה רלוונטית — דילגנו על cron כדי לחסוך CPU. כשיש משתמשים ה-cron רץ במלואו (כולל כל 30 דק׳ לדיוק). ?force=1 לבדיקה מלאה; CRON_IDLE_SKIP=0 מבטל idle skip.',
  };
  return NextResponse.json(payload);
}

export async function maybeReturnCronIdleSkip(
  request: Request,
  admin: SupabaseClient,
  profile: CronIdleProfile
): Promise<NextResponse | null> {
  if (shouldBypassCronIdleSkip(request)) return null;

  const { idle, counts } = await evaluateCronIdleSkip(admin, profile);
  if (!idle) return null;

  return buildCronIdleSkipResponse(profile, counts);
}
