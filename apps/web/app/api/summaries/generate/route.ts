/**
 * POST /api/summaries/generate — On-demand & cron entry-point
 * for the Periodic Summary Engine ("Memory Pyramid").
 *
 * Body:
 *   {
 *     "userId": "<uuid>",                  // לאיזה משתמש לייצר
 *     "type":   "daily" | "weekly" | "monthly" | "quarterly" | "semi_annual" | "annual",
 *     "periodKey": "2026-W22",             // פורמט קנוני לפי ה-type
 *     "dispatchNotification": false,       // אופציונלי. true = שולח "הסיכום שלך מוכן".
 *     "modelOverride": "openai/gpt-5"      // debug only
 *   }
 *
 * אימות (משתי האפשרויות אחת מספיקה):
 *   1. **Cron / system** — `Authorization: Bearer <CRON_SECRET>`  *או*
 *      חתימת `Upstash-Signature` תקינה. במצב הזה ה-route רץ עם
 *      Service-Role admin client (עוקף RLS), וה-userId יכול להיות כל אחד.
 *   2. **משתמש מחובר** — session SSR או `Authorization: Bearer <jwt>`
 *      ופונקציית supabase שמכבדת RLS. במצב הזה `userId` חייב להיות
 *      ה-id של ה-session או שהמשתמש הוא admin.
 *
 * תוצאה (200):
 *   { ok: true, summary: { type, periodKey, metrics, ai_insight, ai_model, ... } }
 *
 * הערה לגבי משך: ייצור Annual on-demand יכול לרוץ עד ~30s כי ה-cascade
 * עשוי להפיק מספר סיכומים פנימיים. לכן `maxDuration = 60`.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '../../../../lib/api/json-request';
import { authorizeCronRequest } from '../../../../lib/api/authorize-cron';
import {
  consumeMultiRateLimits,
  rateLimitResponse,
} from '../../../../lib/api/rate-limit';
import { requireApiSession } from '../../../../lib/api/route-guards';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { jsonZodError } from '../../../../lib/validation/zod-http';
import { israelDateKey } from '../../../../lib/ai/onboarding-check-in-time';
import {
  buildPeriodKey,
  dispatchSummaryReadyNotification,
  fromDateKey,
  generateAndStorePeriodicSummary,
  isValidPeriodKey,
  SUMMARY_TYPES,
  type SummaryType,
} from '../../../../lib/notifications/summaries';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * `periodKey` יכול להיות:
 *   • מפתח קנוני שתואם ל-`type` (e.g. "2026-W22" עבור weekly).
 *   • המחרוזת הקסם `"auto"` — תחושב "התקופה הנוכחית" (Israel) פר ה-`type`.
 *     שימושי לקרוני QStash סטטיים שלא יודעים מראש את ה-key.
 */
const bodySchema = z
  .object({
    userId: z.string().uuid(),
    type: z.enum(SUMMARY_TYPES as unknown as [SummaryType, ...SummaryType[]]),
    periodKey: z.string().min(3).max(20),
    dispatchNotification: z.boolean().optional(),
    modelOverride: z.string().min(1).max(100).optional(),
  })
  .refine((v) => v.periodKey === 'auto' || isValidPeriodKey(v.type, v.periodKey), {
    path: ['periodKey'],
    message: 'periodKey must be "auto" or match canonical format for the given type',
  });

/** ממיר `periodKey: "auto"` ל-key אמיתי לפי "עכשיו" בלוח ירושלים. */
function resolvePeriodKey(type: SummaryType, periodKey: string): string {
  if (periodKey !== 'auto') return periodKey;
  const today = fromDateKey(israelDateKey());
  return buildPeriodKey(type, today);
}

export async function POST(request: Request) {
  try {
    // ---------- 1. Parse body ----------
    const raw = await readJsonBody(request);
    if (!raw.ok) return raw.response;

    const parsed = bodySchema.safeParse(raw.value);
    if (!parsed.success) return jsonZodError(parsed.error, 'Invalid body');

    const { userId, type, dispatchNotification, modelOverride } = parsed.data;
    const periodKey = resolvePeriodKey(type, parsed.data.periodKey);

    // ---------- 2. Authorize ----------
    // נסה תחילה Cron/System Bearer (ל-Upstash Schedules / GitHub Actions / curl).
    const cronAuthFailure = await authorizeCronRequest(request);
    const cronAuthorized = cronAuthFailure === null;

    let firstName: string | null = null;
    let isAdminCaller = false;
    if (!cronAuthorized) {
      const session = await requireApiSession(request);
      if (!session.ok) return session.response;

      // משתמש רגיל יכול לייצר רק לעצמו; admin – יכול לכולם.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await (session.supabase as any)
        .from('profiles')
        .select('role, full_name')
        .eq('id', session.user.id)
        .single();

      isAdminCaller = profile?.role === 'admin';

      if (session.user.id !== userId) {
        if (!isAdminCaller) {
          return NextResponse.json(
            { error: 'Forbidden — can only generate summaries for yourself' },
            { status: 403 }
          );
        }
      } else {
        firstName = profile?.full_name ?? null;
      }

      /**
       * 🛡️ Rate limiting למשתמשים מחוברים: ייצור סיכום מפעיל LLM cascade,
       * שיכול להיות יקר במיוחד ל-quarterly/annual. cron לא נחנק כי הוא
       * מורשה דרך CRON_SECRET / QStash signature.
       */
      const rl = await consumeMultiRateLimits(
        session.user.id,
        'summaries-generate',
        [
          { limit: 5, windowSeconds: 60 },
          { limit: 30, windowSeconds: 3600 },
        ]
      );
      if (!rl.ok) {
        return rateLimitResponse(rl, 'יותר מדי בקשות לייצור סיכומים. נסו שוב מאוחר יותר.');
      }
    }

    /**
     * 🛡️ `modelOverride` הוא מנגנון debug שמרשה לבחור מודל ספציפי. בעבר
     * משתמש מחובר רגיל יכול היה להעביר אותו (= להזמין מודל יקר). מכאן
     * והלאה רק admin/cron יכולים לעקוף.
     */
    const effectiveModelOverride =
      cronAuthorized || isAdminCaller ? modelOverride : undefined;

    // ---------- 3. Generate (cascade) + UPSERT ----------
    // תמיד admin client: ה-engine קורא/כותב על-פני סיכומי ילדים שלא
    // בהכרח שייכים ל-session.user, ועובד גם תחת cron (אין session).
    const admin = createAdminClient();
    const summary = await generateAndStorePeriodicSummary(
      admin,
      {
        userId,
        type,
        periodKey,
        ...(effectiveModelOverride ? { modelOverride: effectiveModelOverride } : {}),
      },
      firstName
    );

    // ---------- 4. Optional: dispatch "summary ready" notification ----------
    let notificationDispatched: boolean | null = null;
    if (dispatchNotification === true) {
      const dispatch = await dispatchSummaryReadyNotification(admin, {
        userId,
        type,
        periodKey,
      });
      notificationDispatched = dispatch.ok;
    }

    return NextResponse.json({
      ok: true as const,
      summary: {
        userId: summary.userId,
        type: summary.type,
        periodKey: summary.periodKey,
        metrics: summary.metrics,
        ai_insight: summary.ai_insight,
        ai_model: summary.ai_model,
        used_fallback: summary.used_fallback,
        llm_attempts: summary.llm_attempts,
        ...(summary.llm_errors.length > 0 ? { llm_errors: summary.llm_errors } : {}),
      },
      ...(notificationDispatched !== null ? { notificationDispatched } : {}),
      authorizedAs: cronAuthorized ? 'cron' : 'user',
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[/api/summaries/generate] failed:', err);
    /**
     * אל תחזיר ללקוח את `err.message` — הוא יכול לחשוף פרטי schema/RPC.
     * ב-production מחזירים תגובה גנרית; ב-dev עדיין נראה את ה-stack בלוג Vercel.
     */
    return NextResponse.json(
      {
        error: 'Internal server error',
        ...(process.env.NODE_ENV !== 'production' && err instanceof Error
          ? { debug: { message: err.message, stack: err.stack } }
          : {}),
      },
      { status: 500 }
    );
  }
}

/** GET סגור במכוון — מונע הפעלה לא-מכוונת מ-browser address-bar / חיפוש. */
export async function GET() {
  return NextResponse.json(
    { error: 'Method Not Allowed — use POST' },
    { status: 405 }
  );
}
