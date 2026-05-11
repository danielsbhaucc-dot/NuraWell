import { NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';

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
export async function authorizeCronRequest(request: Request): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET?.trim();
  const qstashCurrent = process.env.QSTASH_CURRENT_SIGNING_KEY?.trim();
  const qstashNext = process.env.QSTASH_NEXT_SIGNING_KEY?.trim();

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
      const receiver = new Receiver({
        currentSigningKey: qstashCurrent,
        nextSigningKey: qstashNext ?? '',
      });
      /**
       * אנחנו לא מעבירים `url` — מאחורי ה-proxy של Vercel המארח הפנימי שונה
       * מזה ש-QStash חתם עליו, ואז verify היה זורק שגיאה גם לבקשה תקינה.
       * אימות חתימה על body+מפתח סודי נשאר חזק.
       */
      const valid = await receiver.verify({
        signature: upstashSignature,
        body: bodyText,
      });
      if (valid) return null;
    } catch {
      /** נופלים ל-401 בהמשך, ללא חשיפת פרטי השגיאה */
    }
  }

  /** הפעלה ידנית — Authorization: Bearer <CRON_SECRET> */
  const auth = request.headers.get('authorization');
  if (secret && auth === `Bearer ${secret}`) {
    return null;
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
