import { NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';

/**
 * אימות אחיד לכל ה-cron routes. תומך בשלוש שיטות:
 *  1) Authorization: Bearer <CRON_SECRET>            — ידני (Postman / curl / GitHub Actions)
 *  2) x-cron-job-org-token / x-cronjob-token         — cron-job.org
 *  3) Upstash-Signature header (QStash signing keys) — Upstash QStash Schedules
 *
 * שיטה (3) מאפשרת לתזמן Schedule בלוח־הבקרה של Upstash בלי לקבע סוד בכותרת בקשה.
 * רק QSTASH_CURRENT_SIGNING_KEY מספיק; QSTASH_NEXT_SIGNING_KEY אופציונלי לתקופת רוטציה.
 *
 * החזרה: `null` אם מורשה; אחרת `NextResponse` עם 401/500 לפי המצב.
 */
export async function authorizeCronRequest(request: Request): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET?.trim();
  const cronJobOrgToken = process.env.CRON_JOB_ORG_TOKEN?.trim();
  const qstashCurrent = process.env.QSTASH_CURRENT_SIGNING_KEY?.trim();
  const qstashNext = process.env.QSTASH_NEXT_SIGNING_KEY?.trim();

  if (!secret && !cronJobOrgToken && !qstashCurrent) {
    return NextResponse.json(
      {
        error:
          'Missing cron auth env: configure at least one of CRON_SECRET / CRON_JOB_ORG_TOKEN / QSTASH_CURRENT_SIGNING_KEY',
      },
      { status: 500 }
    );
  }

  const auth = request.headers.get('authorization');
  const hasBearer = Boolean(secret) && auth === `Bearer ${secret}`;
  if (hasBearer) return null;

  const cronToken =
    request.headers.get('x-cron-job-org-token') ?? request.headers.get('x-cronjob-token');
  const hasCronJobOrgToken = Boolean(cronJobOrgToken) && cronToken === cronJobOrgToken;
  if (hasCronJobOrgToken) return null;

  const upstashSignature = request.headers.get('upstash-signature');
  if (upstashSignature && qstashCurrent) {
    try {
      const cloned = request.clone();
      const bodyText = await cloned.text();
      const receiver = new Receiver({
        currentSigningKey: qstashCurrent,
        nextSigningKey: qstashNext ?? '',
      });
      /**
       * אנחנו לא מעבירים `url` — מאחורי ה-proxy של Vercel המארח הפנימי שונה
       * מזה ש-QStash חתם עליו, ואז verify היה זורק שגיאה גם עבור בקשה תקינה.
       * בקרת חתימה על body+key עם המפתחות הסודיים נשארת חזקה.
       */
      const valid = await receiver.verify({
        signature: upstashSignature,
        body: bodyText,
      });
      if (valid) return null;
    } catch {
      /** נופלים ל-401 בהמשך, ללא חשיפת פרטי השגיאה החוצה */
    }
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
