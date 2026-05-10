import { NextResponse } from 'next/server';
import { requireApiSession } from '../../../../../lib/api/route-guards';
import { workflowPublicBaseUrl } from '../../../../../lib/workflows/resolve-workflow-public-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * בדיקת תצורה בלי להריץ מודל: האם משתני QStash מוגדרים והאם כתובת ה-workflow נראית הגיונית.
 */
export async function GET(request: Request) {
  const auth = await requireApiSession(request);
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
    hint_he: ready
      ? 'מוכן להרצת בדיקה: POST ל-/api/v1/almog-followup/start עם {"taskId":"...","delayString":"15s"} (בפיתוח).'
      : 'השלם משתני סביבה (QSTASH_*, OPENROUTER, SUPABASE_SERVICE_ROLE_KEY). בפיתוח: npx @upstash/qstash-cli dev',
  });
}
