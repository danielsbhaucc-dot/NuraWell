import { NextResponse } from 'next/server';
import { requireApiAdmin } from '../../../../../lib/api/route-guards';
import { workflowPublicBaseUrl } from '../../../../../lib/workflows/resolve-workflow-public-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * בדיקת תצורה בלי להריץ מודל: האם משתני QStash מוגדרים והאם כתובת
 * ה-workflow נראית הגיונית.
 *
 * 🛡️ הגבלת אבטחה: נחשף רק ל-admin. בעבר משתמש מחובר רגיל יכול היה
 * לראות איזה משתני סביבה מוגדרים (QSTASH/OPENROUTER/SUPABASE_SERVICE_ROLE),
 * וכן את ה-public base URL. זה שימושי ל-recon, ולא נדרש למשתמש קצה.
 */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;

  const token = Boolean(process.env.QSTASH_TOKEN?.trim());
  const qstashUrl = process.env.QSTASH_URL?.trim() ?? '';
  const openrouter = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  const service = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const base = workflowPublicBaseUrl();
  const workflowEndpoint = `${base}/api/workflows/almog-followup`;

  const ready = token && service && openrouter;

  return NextResponse.json({
    ok: ready,
    checks: {
      qstash_token_configured: token,
      qstash_url: qstashUrl || null,
      openrouter_configured: openrouter,
      supabase_service_role_configured: service,
      resolved_public_base: base,
      workflow_endpoint: workflowEndpoint,
    },
    live_notifications_he:
      'התראות חיות: הרץ migration 000011 (הוספת notifications ל-publication supabase_realtime). אחרי migrate — פתח את האפליקציה, לחץ על הפעמון; הוספת שורה ל-notifications אמורה להופיע בלי ריענון.',
    how_to_test_he: [
      '1) משימה במסע: לחץ "מקובל עליי" (מתזמן workflow) או POST ל-/api/v1/almog-followup/start עם taskId ו-delayString כמו 20s.',
      '2) אל תסמן "בוצע" במגירת הדיווח — אחרי ההשהיה תתקבל התראה בפעמון (גוף מותאם לשם + מגדר מהפרופיל).',
      '3) אם Realtime לא מופעל בפרויקט — עדיין יש ריענון שקט כל ~25 שניות.',
    ],
    hint_he: ready
      ? 'מוכן להרצת בדיקה: POST ל-/api/v1/almog-followup/start עם {"taskId":"...","delayString":"15s"} (בפיתוח).'
      : 'השלם משתני סביבה (QSTASH_*, OPENROUTER, SUPABASE_SERVICE_ROLE_KEY). בפיתוח: npx @upstash/qstash-cli dev',
  });
}
