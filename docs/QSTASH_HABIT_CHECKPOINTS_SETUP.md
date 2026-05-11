# QStash Schedules ל-Habit Checkpoints (בוקר / צהריים / ערב)

מסמך זה מסביר איך לתזמן 3 קריאות ביום ל-
`/api/v1/ai/cron/habit-checkpoints?slot=morning|midday|evening`
דרך **Upstash QStash Schedules**, ולוודא שהן עוברות אימות.

> אם קיבלת **HTTP 401 / "Unauthorized"** מהשעון של QStash — הסיבה הקבועה: ה-endpoint לא ידע
> לאמת את ה-`Upstash-Signature`. מאז העדכון האחרון התווסף אימות חתימת QStash; חובה
> להגדיר את משתני הסביבה שלמטה.

---

## 1) משתני סביבה (ב-Vercel → Project Settings → Environment Variables)

חובה לפחות אחת מהאופציות הבאות (מומלץ כל השלוש):

| משתנה | למה משמש | חובה? |
|---|---|---|
| `QSTASH_CURRENT_SIGNING_KEY` | לאמת `Upstash-Signature` מ-QStash Schedules | חובה ל-QStash |
| `QSTASH_NEXT_SIGNING_KEY` | תקופת רוטציה של מפתחות (אם אין — שים מחרוזת ריקה / הסר) | מומלץ |
| `CRON_SECRET` | להפעלה ידנית (`Authorization: Bearer ...`) | מומלץ |
| `CRON_JOB_ORG_TOKEN` | תאימות לאחור ל-cron-job.org | אופציונלי |
| `QSTASH_TOKEN` | קיים כבר; נדרש לשלוח Workflow triggers הלאה | חובה |

המפתחות `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` נמצאים ב-
**Upstash Console → QStash → Signing Keys**. אסור לחשוף ב-frontend.

לאחר עדכון משתני הסביבה — חובה **Redeploy** ל-Production כדי שהשרת ירים את הערכים.

---

## 2) יצירת 3 Schedules ב-Upstash QStash Console

לכל אחת מ-`morning / midday / evening`:

1. נכנסים ל-**QStash → Schedules → Create Schedule**.
2. **Destination**: `https://nurawell.vercel.app/api/v1/ai/cron/habit-checkpoints?slot=morning`
   (החליפו את `morning` ב-`midday` / `evening` לכל שעון).
3. **Method**: `POST` (גם `GET` עובד; QStash חותם את שניהם).
4. **Cron expression** (זמן ירושלים — UTC+2/UTC+3, התאימו עונת קיץ/חורף):
   - בוקר 08:00 ירושלים → `0 5 * * *` (חורף) / `0 5 * * *` בקיץ (UTC).
     בפועל, אם רוצים תמיד שעת ישראל מקומית — קונפיגו עם `timezone: Asia/Jerusalem` ב-QStash
     (UI חדש תומך), ושימו cron פשוט כמו `0 8 * * *`.
   - צהריים 13:00 → `0 13 * * *` (timezone=Asia/Jerusalem).
   - ערב 20:00 → `0 20 * * *` (timezone=Asia/Jerusalem).
5. **Headers**: לא צריך להוסיף שום כותרת ידנית. QStash מצרף `Upstash-Signature`
   באופן אוטומטי, וה-route מאמת אותה מול `QSTASH_CURRENT_SIGNING_KEY`.
6. **Body**: ריק.
7. שומרים. אפשר להריץ ידנית "Run now" ולבדוק שהתגובה חוזרת `200`.

---

## 3) בדיקה מיידית בלי לחכות לשעת התזמון

### א. dry-run (מומלץ — לא יוצר נוטיפיקציות אמיתיות)

```bash
curl -i "https://nurawell.vercel.app/api/v1/ai/cron/habit-checkpoints?slot=morning&dryRun=1" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

תגובה צפויה:

```json
{
  "ok": true,
  "mode": "dry_run",
  "slot": "morning",
  "planned_users": 17,
  "skipped_avoid_push": 2,
  "would_trigger": 15,
  "workflow_url": "https://nurawell.vercel.app/api/workflows/almog-habit-checkpoint",
  "sample_user_ids": ["...", "...", "..."]
}
```

- `would_trigger > 0` => התזמון יעבוד; הסר את `dryRun=1` להפעלה אמיתית.
- `would_trigger = 0` => אף משתמש לא זכאי כרגע (אין הרגלים מתאימים ל-slot,
  או כולם נמצאים ב-`avoid_push=true`).

חזור על אותה בדיקה עם `slot=midday` ו-`slot=evening`.

### ב. הפעלה אמיתית מיידית (ייצור נוטיפיקציות)

```bash
curl -i "https://nurawell.vercel.app/api/v1/ai/cron/habit-checkpoints?slot=morning" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

> שים לב: ה-workflow עצמו (`almog-habit-checkpoint`) חוסם כפילויות לאותו יום/slot,
> אז קריאה כפולה לא תיצור התראות כפולות.

### ג. בדיקת חתימת QStash מתוך הקונסולה

ב-QStash → Schedules → לחיצה על Schedule → **Run now**.
אם עכשיו מקבלים `200` במקום `401` — האימות עובד.
אם עדיין `401`:

1. ודא ש-`QSTASH_CURRENT_SIGNING_KEY` קיים בסביבת Production של Vercel.
2. ודא שעשית **Redeploy** אחרי שהוספת את המשתנים.
3. בדוק ב-QStash Console → Settings → Signing Keys — המפתח חייב להיות זה שמופיע
   ב-Vercel (ולא של פרויקט אחר).

---

## 4) טבלת קודי תגובה

| Status | משמעות |
|---|---|
| `200` + `ok:true` | רץ בהצלחה; ראה שדה `workflow_triggers` |
| `400` | חסר/לא תקין `?slot=` |
| `401` | אימות נכשל — בדוק את סעיף 1 |
| `500` + `Missing cron auth env` | לא הוגדר אף אחד מהמפתחות בסביבה |
| `500` + `חסר QSTASH_TOKEN` | חסר Token לשליחת ה-Workflow trigger עצמו |

---

## 5) קישור למסע הכולל

- ה-cron הזה רק **מתזמן** Workflows; ההיגיון של "האם לשלוח" נמצא ב-
  `apps/web/app/api/workflows/almog-habit-checkpoint/route.ts`.
- שערים (gates) למניעת כפילויות: `apps/web/lib/workflows/habit-checkpoint-gates.ts`.
- בחירת ההרגלים לפי slot/יום: `apps/web/lib/workflows/habit-checkpoint-eligibility.ts`.
