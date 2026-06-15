import { NextResponse } from 'next/server';

/**
 * עטיפת fail-closed ל-route handlers של Upstash Workflow.
 *
 * `serve()` מ-`@upstash/workflow` מאמת את חתימת QStash אוטומטית כש-
 * `QSTASH_CURRENT_SIGNING_KEY` מוגדר, אך אם המפתח חסר הוא רק מדפיס אזהרה
 * ומדלג על האימות — כלומר endpoint עם הרשאות service-role (עוקף RLS) עלול
 * להיחשף ללא אימות. כדי לא להסתמך על תצורה נכונה, בפרודקשן אנו חוסמים
 * את ה-route אם אין מפתח חתימה מוגדר.
 *
 * בפיתוח (NODE_ENV !== 'production') ההתנהגות נשמרת כדי לא לשבור ריצה מקומית.
 */
type WorkflowPost = (request: Request) => Promise<Response>;

export function requireQstashConfigured(post: WorkflowPost): WorkflowPost {
  return async (request: Request): Promise<Response> => {
    const hasSigningKey = Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY?.trim());
    if (!hasSigningKey && process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Workflow signature verification is not configured' },
        { status: 500 },
      );
    }
    return await post(request);
  };
}
