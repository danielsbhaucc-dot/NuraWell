/**
 * Upstash Workflow — מנוע ההתראות החכם של NuraWell.
 *
 * טריגר: 3 קרונים יומיים מ-QStash (08:00 / 13:00 / 20:00 IL).
 * Payload: `{ timeOfDay: "morning" | "noon" | "evening" }`.
 *
 * הזרימה:
 *   Step A — `fetch-candidates`  : שולף מ-Supabase את כל המשתמשים שצריכים
 *                                  התראה ב-slot הזה (כבר אחרי סינון
 *                                  "השלים היום?" + חישוב NotificationState).
 *   Step B — `dispatch-<userId>` : לכל מועמד — קריאה ל-OpenAI gpt-4o-mini
 *                                  + רישום ב-notification_logs (UNIQUE
 *                                  guard נגד שליחה כפולה לאותו slot).
 *
 * Idempotency: ה-UNIQUE (user_id, date_key, time_of_day) ב-notification_logs
 * מבטיח שגם אם QStash מבצע retry — לא תהיה שליחה כפולה.
 *
 * Performance: כל משתמש רץ ב-`context.run` נפרד כדי לאפשר ל-Workflow
 * checkpoint + retry פר-משתמש בלי לקרוס על שגיאה ספציפית.
 */

import { serve } from '@upstash/workflow/nextjs';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { israelDateKey } from '../../../../lib/ai/onboarding-check-in-time';
import { getUsersForNotification } from '../../../../lib/notifications/engine/get-users-for-notification';
import { generateNotificationText } from '../../../../lib/notifications/engine/generate-notification-text';
import { logNotification } from '../../../../lib/notifications/engine/log-notification';
import { buildTimeAgoTextHe } from '../../../../lib/notifications/engine/derive-urgency-level';
import {
  parseNotificationsEnginePayload,
  type NotificationsEnginePayload,
} from '../../../../lib/workflows/notifications-engine-payload';
import type {
  NotificationCandidate,
  NotificationDispatchResult,
} from '../../../../lib/types/notification-state';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export const { POST } = serve<NotificationsEnginePayload>(async (context) => {
  const payload = parseNotificationsEnginePayload(context.requestPayload);
  const today = payload.todayOverride ?? israelDateKey();

  // ---------- Step A: fetch candidates ----------
  const candidates = await context.run<NotificationCandidate[]>(
    `fetch-candidates-${payload.timeOfDay}`,
    async () => {
      const admin = createAdminClient();
      return getUsersForNotification(admin, payload.timeOfDay, {
        todayOverride: today,
        maxUsers: payload.maxUsers,
      });
    }
  );

  if (candidates.length === 0) {
    return {
      ok: true as const,
      timeOfDay: payload.timeOfDay,
      date: today,
      total: 0,
      sent: 0,
      results: [] as NotificationDispatchResult[],
    };
  }

  // ---------- Step B: dispatch per user (parallel-friendly checkpoints) ----------
  const results: NotificationDispatchResult[] = [];
  for (const candidate of candidates) {
    const result = await context.run<NotificationDispatchResult>(
      `dispatch-${candidate.userId}`,
      async () => dispatchOne(candidate, today, payload.aiModel)
    );
    results.push(result);
  }

  const sent = results.filter((r) => r.status === 'sent').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  return {
    ok: true as const,
    timeOfDay: payload.timeOfDay,
    date: today,
    total: candidates.length,
    sent,
    skipped,
    failed,
    results,
  };
});

/** קריאה ל-LLM + רישום + טיפול בכפילויות, ברמת משתמש בודד. */
async function dispatchOne(
  candidate: NotificationCandidate,
  today: string,
  modelOverride: string | undefined
): Promise<NotificationDispatchResult> {
  try {
    // 2D context matrix שעובר ל-LLM — snake_case לפי המפרט. notificationState
    // *לא* נשלח ל-LLM; הוא נשמר רק פנימית ב-notification_logs ו-fallbackState.
    // Phase 3: אם getUsersForNotification צירף לזה זיכרון ארוך-טווח
    // (latest weekly/monthly insights), אנחנו מעבירים אותו אל ה-LLM.
    // Phase 4 (Claude merge): מוסיפים urgency_level, time_ago_text,
    // notification_count, hours_since_last_response — מודולציית טון עדינה
    // מעל ה-state בלי לשנות את ה-cadence הקיים.
    const { body, model, usedFallback, attempts, errors } = await generateNotificationText(
      {
        user_first_name: candidate.firstName,
        task_name: candidate.taskName,
        time_of_day: candidate.timeOfDay,
        consecutive_missed_days: candidate.consecutiveMissedDays,
        // תמיד false ב-runtime — סוננו ב-getUsersForNotification. נשלח להגנה.
        has_completed_today: false,
        urgency_level: candidate.urgencyLevel,
        time_ago_text: buildTimeAgoTextHe(candidate.consecutiveMissedDays),
        ...(typeof candidate.notificationCount === 'number'
          ? { notification_count: candidate.notificationCount }
          : {}),
        ...(typeof candidate.hoursSinceLastResponse === 'number'
          ? { hours_since_last_response: candidate.hoursSinceLastResponse }
          : {}),
        ...(typeof candidate.notificationsTodaySent === 'number' &&
          candidate.notificationsTodaySent > 0
          ? { notifications_today_sent: candidate.notificationsTodaySent }
          : {}),
        ...(candidate.aiMemory ? { ai_memory: candidate.aiMemory } : {}),
      },
      {
        ...(modelOverride ? { model: modelOverride } : {}),
        fallbackState: candidate.notificationState,
      }
    );

    const admin = createAdminClient();
    const logResult = await logNotification(admin, {
      userId: candidate.userId,
      timeOfDay: candidate.timeOfDay,
      notificationState: candidate.notificationState,
      taskName: candidate.taskName,
      body,
      dateKey: today,
      aiModel: model,
      metadata: {
        consecutiveMissedDays: candidate.consecutiveMissedDays,
        urgencyLevel: candidate.urgencyLevel,
        usedFallback,
        llmAttempts: attempts,
        // רישום כשלים רק אם היו (חוסך מקום ב-DB)
        ...(errors.length > 0 ? { llmErrors: errors } : {}),
        // Phase 3: רישום שהוזרק זיכרון (אם הוזרק) — לדאשבורד אדמין
        // ולוודא שהפיצ'ר רץ. רושמים רק את ה-period_keys, לא את הטקסט עצמו.
        ...(candidate.aiMemory
          ? {
              aiMemory: {
                weekly: candidate.aiMemory.latest_weekly_period ?? null,
                monthly: candidate.aiMemory.latest_monthly_period ?? null,
              },
            }
          : {}),
        // Phase 4 (Claude merge): מעקב אחר response-aware context
        ...(typeof candidate.notificationCount === 'number'
          ? { notificationCount: candidate.notificationCount }
          : {}),
        ...(typeof candidate.hoursSinceLastResponse === 'number'
          ? { hoursSinceLastResponse: candidate.hoursSinceLastResponse }
          : {}),
        ...(typeof candidate.notificationsTodaySent === 'number'
          ? { notificationsTodaySent: candidate.notificationsTodaySent }
          : {}),
      },
    });

    if (!logResult.ok) {
      return {
        userId: candidate.userId,
        status: 'failed',
        error: logResult.error,
      };
    }

    if (logResult.alreadyExisted) {
      return {
        userId: candidate.userId,
        status: 'skipped',
        reason: 'already_sent_today_for_slot',
      };
    }

    return {
      userId: candidate.userId,
      status: 'sent',
      notificationState: candidate.notificationState,
      body,
    };
  } catch (err) {
    return {
      userId: candidate.userId,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
