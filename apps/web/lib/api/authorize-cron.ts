import { enterAiUsage } from '@/lib/ai/usage-meter';
import { NextResponse } from 'next/server';
import { qstashReceivers, verifyQstashAny } from '@/lib/api/qstash-receivers';
import { workflowPublicBaseUrl } from '../workflows/resolve-workflow-public-url';
import { timingSafeEqualStr } from './timing-safe-equal';

/**
 * אימות אחיד לכל ה-cron routes. שתי שיטות נתמכות:
 *
 *  1) **Upstash QStash** — חתימת `Upstash-Signature` (האופציה הראשית).
 *     QStash חותם כל בקשה במפתח הסודי שלו; השרת מאמת מול
 *     `QSTASH_CURRENT_SIGNING_KEY` (ובמקרי רוטציה גם `QSTASH_NEXT_SIGNING_KEY`).
 *
 *  2) **Bearer ידני** — `Authorization: Bearer <CRON_SECRET>` להפעלה ידנית מ-curl /
 *     Postman / GitHub Actions / קונסולה. שימושי בעיקר ל-`dryRun=1` ולבדיקות.
 *
 *  ה-return: `null` אם הבקשה מורשית; אחרת `NextResponse` עם 401/500 לפי המצב.
 */

/**
 * בונה רשימת URLs קנוניים שנקבל מהם חתימה תקפה. QStash חותם על ה-URL שאליו
 * הבקשה נשלחה; ב-Vercel ה-host הפנימי שונה מהציבורי, לכן בונים את הציבורי
 * מ-`workflowPublicBaseUrl` (זה ה-URL שב-pipelines נרשם כיעד QStash).
 *
 * נוסיף גם וריאציה של `forwarded-host`/`request.url` כ-best-effort, אבל
 * ה-allowlist הקנוני מבוסס env variables ולא input של הבקשה — כדי שלא
 * נוכל להיות מולאמים על ידי headers שתוקף שולט בהם.
 */
function buildCanonicalUrlsForRequest(request: Request): string[] {
  const reqUrl = new URL(request.url);
  const path = reqUrl.pathname + (reqUrl.search ?? '');

  const candidates = new Set<string>();

  // 1) URL ציבורי לפי env (העדיפות הראשונה — מאומת מחוץ לבקשה).
  try {
    const publicBase = workflowPublicBaseUrl();
    if (publicBase) {
      candidates.add(`${publicBase.replace(/\/$/, '')}${path}`);
    }
  } catch {
    /** ignore */
  }

  // 2) `request.url` עצמו (עובד ב-dev / curl לוקאלי / sanity).
  candidates.add(request.url);

  return [...candidates];
}

export async function authorizeCronRequest(request: Request): Promise<NextResponse | null> {
  try {
    enterAiUsage({ feature: `cron:${new URL(request.url).pathname.replace(/^\/api\/v1\/(ai\/)?(cron\/)?/, '').slice(0, 50)}` });
  } catch {
    /* ignore */
  }
  const secret = process.env.CRON_SECRET?.trim();
  const qstashCurrent = process.env.QSTASH_CURRENT_SIGNING_KEY?.trim();

  if (!qstashCurrent && !secret) {
    return NextResponse.json(
      {
        error:
          'Missing cron auth env: configure QSTASH_CURRENT_SIGNING_KEY (for Upstash Schedules) and/or CRON_SECRET (for manual Bearer)',
      },
      { status: 500 }
    );
  }

  /** Upstash QStash Schedules — חתימה בכותרת */
  const upstashSignature = request.headers.get('upstash-signature');
  if (upstashSignature && qstashCurrent) {
    try {
      const cloned = request.clone();
      const bodyText = await cloned.text();
      const receivers = qstashReceivers();

      /**
       * אימות מחזק: בודקים את החתימה מול URLs קנוניים מ-allowlist (לא ערכים
       * שנגזרים מ-headers שתוקף שולט בהם). אם אחד מהם תואם — הבקשה מורשית.
       * זה חוסם replay בין routes שונים: חתימה תקפה ל-route A לא תאמת route B.
       */
      const candidateUrls = buildCanonicalUrlsForRequest(request);
      for (const candidate of candidateUrls) {
        if (await verifyQstashAny({ signature: upstashSignature, body: bodyText, url: candidate }, receivers)) {
          return null;
        }
      }
    } catch {
      /** נופלים ל-401 בהמשך, ללא חשיפת פרטי השגיאה */
    }
  }

  /** הפעלה ידנית — Authorization: Bearer <CRON_SECRET> */
  const auth = request.headers.get('authorization');
  if (secret && auth && timingSafeEqualStr(auth, `Bearer ${secret}`)) {
    return null;
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * Dedicated manual-trigger secret for the enc:v2 backfill route only (Bearer header only, constant-time).
 * Independent of CRON_SECRET so rotating one never breaks the other.
 */
export function hasFieldBackfillSecret(request: Request): boolean {
  const secret = process.env.FIELD_BACKFILL_SECRET?.trim();
  if (!secret || secret.length < 32) return false;
  const auth = request.headers.get('authorization');
  return !!auth && timingSafeEqualStr(auth, `Bearer ${secret}`);
}
