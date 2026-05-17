# NuraWell — תזמוני Cron עם Upstash QStash

זה המקור היחיד שמסביר איך ה-cron-jobs של האפליקציה מתוזמנים ומאומתים.
**אנחנו משתמשים אך ורק ב-Upstash QStash Schedules** — לא Vercel Cron, לא cron-job.org.

## תוכן עניינים

1. [רקע: מה זה Upstash QStash Schedules](#1-רקע)
2. [הנתיבים שמתוזמנים](#2-הנתיבים)
3. [אימות (Upstash-Signature)](#3-אימות)
4. [Setup מלא ב-Vercel + Upstash](#4-setup)
5. [איך לבדוק שזה עובד מיידית](#5-בדיקה-מיידית)
6. [תקלות שכיחות (401, 500)](#6-תקלות)

---

## 1) רקע

Upstash QStash הוא queue + scheduler. כשמגדירים שם **Schedule**, QStash שומר cron expression
ו-URL, ובכל הפעלה הוא שולח HTTP request לאותו URL **חתום עם מפתח סודי שלו**.

המפתחות הציבוריים-כביכול (Current + Next signing keys) מוצגים בלוח הבקרה — אבל למעשה הם
**סודיים**: רק מי שמחזיק אותם יכול לאמת את החתימה ולקבל את הבקשה. לכן השרת שלנו שומר אותם
ב-`QSTASH_CURRENT_SIGNING_KEY` ומאמת איתם כל בקשה נכנסת.

זה אומר ש-**אין צורך לקבע סוד כותרת בידיים** ב-Schedule. הכל אוטומטי.

---

## 2) הנתיבים

| נתיב | תדירות | קובץ |
|---|---|---|
| `POST /api/v1/ai/cron/master` | 1× ביום | `apps/web/app/api/v1/ai/cron/master/route.ts` |
| `POST /api/v1/ai/cron/habit-checkpoints?slot=morning` | יומי 08:00 ישראל | `apps/web/app/api/v1/ai/cron/habit-checkpoints/route.ts` |
| `POST /api/v1/ai/cron/habit-checkpoints?slot=midday`  | יומי 13:00 ישראל | אותו קובץ |
| `POST /api/v1/ai/cron/habit-checkpoints?slot=evening` | יומי 20:00 ישראל | אותו קובץ |
| `POST /api/v1/ai/cron/onboarding-check-ins` | כל 30 דקות (מומלץ) | `apps/web/app/api/v1/ai/cron/onboarding-check-ins/route.ts` |

ה-Master cron מנתח אינטראקציות AI מ-24 השעות האחרונות + שולח נידג'ים למשתמשים לא־פעילים.
ה-habit checkpoints מתזמן Workflows של בדיקת הרגלים לפי החלון (בוקר/צהריים/ערב) **וגם
מזהה משימות שהמשתמש קיבל אבל לא ביצע** — מי שאין לו לא הרגלים תואמי slot ולא משימות
פתוחות, מדולג אוטומטית כדי לא להציף עם תזכורות מיותרות.

**בדיקות אישיות מאלמוג (אחרי הרשמה):** דולב אוסף מידע בשאלון; אלמוג מיישם.
קורא `profiles.ai_check_in_times` + `ai_system_prompt` למי שסיים הרשמה — זמנים מותאמים (3–5: לפני חלון קשה, ואם הוגדרה `dinner_time` גם לפני/אחרי ארוחת ערב).
**שילוב מסע:** אם יש הרגלים/משימות פתוחות במסלול — נכללים באותה הודעת אלמוג (לא צריך cron נפרד).
משתמשים עם זמנים אישיים **מדולגים** ב-habit-checkpoints הקבועים כדי למנוע כפילות.
חלון התאמה: ±30 דקות (ניתן לשינוי ב-`?window_minutes=`).

---

## 3) אימות

מימוש: `apps/web/lib/api/authorize-cron.ts`.

שתי שיטות נתמכות:

| # | ש0יטה | ל־ |
|---|---|---|
| 1 | `Upstash-Signature` header (אוטומטי מ-QStash) | תזמונים בפרודקשן |
| 2 | `Authorization: Bearer <CRON_SECRET>` | הפעלה ידנית מ-curl/Postman/GitHub Actions |

כל בקשה ללא אחת מהשתיים → **401 Unauthorized**. ללא משתני סביבה כלל → **500**.

---

## 4) Setup

### א. משתני סביבה ב-Vercel (Production)

`Project → Settings → Environment Variables → Production`:

| משתנה | חובה? | מאיפה לקבל |
|---|---|---|
| `QSTASH_TOKEN` | ✅ | Upstash → QStash → Console → API Key (`qstash_...`) |
| `QSTASH_CURRENT_SIGNING_KEY` | ✅ | Upstash → QStash → Console → **Signing Keys** → Current |
| `QSTASH_NEXT_SIGNING_KEY` | מומלץ | אותו מסך, "Next" — לזמן רוטציית מפתחות |
| `CRON_SECRET` | אופציונלי | מחרוזת אקראית; רק להפעלה ידנית |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase → Settings → API |
| `WORKFLOW_PUBLIC_BASE_URL` | אופציונלי | אם רוצים לאלץ דומיין ספציפי ל-Workflows |
| `CRON_MAX_HABIT_CHECKPOINT_TRIGGERS` | אופציונלי | ברירת מחדל 350, מקסימום 800 |
| `CRON_MAX_ONBOARDING_CHECK_IN_TRIGGERS` | אופציונלי | ברירת מחדל 200, מקסימום 500 |

> **חובה Redeploy ל-Production אחרי הוספה / עדכון משתני סביבה**, אחרת השרת לא יראה אותם.

### ב. יצירת 5 Schedules ב-Upstash Console

נכנסים ל-**Upstash → QStash → Schedules → Create**. יוצרים 5 schedules:

#### Schedule 1 — Master Daily

| שדה | ערך |
|---|---|
| Destination URL | `https://nurawell.vercel.app/api/v1/ai/cron/master` |
| Method | `POST` |
| Cron | `0 6 * * *` |
| Timezone | `Asia/Jerusalem` |
| Body | ריק |
| Headers | ריק (QStash מצרף `Upstash-Signature` לבד) |

#### Schedule 2 — Habit Checkpoint: Morning

| שדה | ערך |
|---|---|
| Destination URL | `https://nurawell.vercel.app/api/v1/ai/cron/habit-checkpoints?slot=morning` |
| Method | `POST` |
| Cron | `0 8 * * *` |
| Timezone | `Asia/Jerusalem` |

#### Schedule 3 — Habit Checkpoint: Midday

| שדה | ערך |
|---|---|
| Destination URL | `https://nurawell.vercel.app/api/v1/ai/cron/habit-checkpoints?slot=midday` |
| Method | `POST` |
| Cron | `0 13 * * *` |
| Timezone | `Asia/Jerusalem` |

#### Schedule 4 — Habit Checkpoint: Evening

| שדה | ערך |
|---|---|
| Destination URL | `https://nurawell.vercel.app/api/v1/ai/cron/habit-checkpoints?slot=evening` |
| Method | `POST` |
| Cron | `0 20 * * *` |
| Timezone | `Asia/Jerusalem` |

#### Schedule 5 — Almog personalized check-ins (זמנים מההרשמה)

| שדה | ערך |
|---|---|
| Destination URL | `https://nurawell.vercel.app/api/v1/ai/cron/onboarding-check-ins` |
| Method | `POST` |
| Cron | `0,30 * * * *` |
| Timezone | `Asia/Jerusalem` |

> **למה כל 30 דקות ולא פעם בשעה?** זמני הבדיקה נשמרים בדיוק (למשל 07:45). Cron שעתי ב-:00 עלול לפספס. `0,30 * * * *` = פעמיים בשעה, חלון ±30 דקות.

בדיקה יבשה: `POST .../onboarding-check-ins?dryRun=1` עם `Authorization: Bearer <CRON_SECRET>`.

---

## 5) בדיקה מיידית

### דרך א — Upstash Console (ללא curl, ללא סודות ביד)

`QStash → Schedules → ⋯ → Trigger now` (או "Run now") על כל Schedule.

- `200` בתגובה = הכל עובד.
- `401` = ראו [סעיף 6](#6-תקלות).

### דרך ב — dry-run ב-curl (לא יוצר נוטיפיקציות אמיתיות)

`/api/v1/ai/cron/habit-checkpoints` תומך בפרמטר `?dryRun=1` שמחזיר את התכנון בלי לטרגר
Workflows אמיתיים. מצוין כדי לוודא שיש משתמשים זכאים לפני שמשגרים בפועל.

> 🛡️ ה-endpoints של ה-cron מקבלים **POST בלבד**. GET סגור מ-405 (מניעת טריגר לא-מכוון מ-prefetch/CDN/monitoring).

```bash
curl -i -X POST "https://nurawell.vercel.app/api/v1/ai/cron/habit-checkpoints?slot=morning&dryRun=1" \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "Content-Length: 0"
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

- `would_trigger > 0` → ההגדרה תקינה והשעון יעבוד.
- `would_trigger = 0` → אין משתמשים זכאים כרגע (אין הרגלים מתאימים ל-slot, או כולם
  סומנו `avoid_push=true`).

חזרו על הבדיקה עם `slot=midday` ו-`slot=evening`.

### דרך ג — הפעלה אמיתית מיידית

```bash
curl -i -X POST "https://nurawell.vercel.app/api/v1/ai/cron/habit-checkpoints?slot=morning" \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "Content-Length: 0"
```

> ה-workflow עצמו (`almog-habit-checkpoint`) חוסם כפילויות לאותו slot/יום, אז קריאה חוזרת
> לא תיצור התראות כפולות (`apps/web/lib/workflows/habit-checkpoint-gates.ts`).

### דרך ד — בדיקה עצמית של ההתראה (`/test`)

ל-Endpoint נפרד שמריץ **סינכרונית** את אותו תזרים שה-CRON האמיתי מריץ אחרי
ה-Workflow — בלי המתנה ל-QStash, בלי המתנה לחלון הזמן הבא, ועם דריסת ה-gate
שמונע כפילויות. שימושי לבדיקה חוזרת בלי לחכות שעות.

נתיב: `POST /api/v1/ai/cron/habit-checkpoints/test`

קוד: `apps/web/app/api/v1/ai/cron/habit-checkpoints/test/route.ts`

מסכי משתמש: כפתור "שלחו לי התראת בדיקה עכשיו" בעמוד `/settings/almog`.

ברירות מחדל (אופטימליות לבדיקה):

- `bypassGate=true` — דורס את ה-gate "כבר נשלחה התראה ל-slot היום".
- `bypassEligibility=true` — לא מסנן הרגלים לפי `slot`/יום בשבוע, שולח את כל ההרגלים
  שיש למשתמש במסע. אם אין הרגלים בכלל, משתמש בפלייסהולדר `שתיית כוס מים`
  (`allowFallbackHabit=true`).
- `slot` — אם לא צוין, נגזר אוטומטית משעת ירושלים הנוכחית.

**אימות:**

1. משתמש מחובר (cookies) → שולח התראה לעצמו, לא יכול לציין `userId` של אחר.
2. `Authorization: Bearer <CRON_SECRET>` → דורש `userId` מפורש; טוב לקריאה מ-ops/curl.

> ⚠️ ה-`/test` יוצר notification אמיתי בטבלת `notifications` של המשתמש —
> רק שולח עוקף gate. ב-CRON האמיתי הזרימה ממשיכה לרוץ עם gate מלא. אין כאן
> bypass לכל המשתמשים בו-זמנית.

דוגמת curl (משתמש ב-CRON_SECRET, מציין userId):

```bash
curl -i -X POST "https://nurawell.vercel.app/api/v1/ai/cron/habit-checkpoints/test" \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"userId":"<UUID>","slot":"morning"}'
```

תגובה צפויה:

```json
{
  "ok": true,
  "mode": "sync_debug",
  "slot": "morning",
  "checkpoint_date": "2026-05-12",
  "weekday_jerusalem": 2,
  "gate_bypassed": true,
  "eligibility_bypassed": true,
  "used_fallback_habit": false,
  "all_habits_count": 4,
  "eligible_habits_count": 4,
  "sent_habits_count": 4,
  "pending_tasks_count": 2,
  "pending_task_titles": ["לשתות 8 כוסות מים", "להחליף שמן זית לחמאה"],
  "notification_body": "היי דן, רוצה לעצור רגע ולבדוק…"
}
```

`pending_tasks_count` מציין כמה משימות שהמשתמש קיבל על עצמו (`status='accepted'`)
עדיין לא דווחו כבוצעו (`execution_done` לא `true`). אם הוא 0 וגם
`eligible_habits_count=0`, וב-CRON האמיתי, המשתמש יידלג. ב-`/test` עם
`allowFallbackHabit=true` (ברירת מחדל) עדיין תישלח התראה לבדיקה.

הודעות שגיאה ייעודיות:

- `blocked_by_gate` (רק עם `bypassGate=false`) → המשתמש סימן `avoid_push` או
  שכבר נשלחה התראה לאותו slot/יום.
- `nothing_to_send` (רק עם `allowFallbackHabit=false`) → אין למשתמש לא הרגלים
  תואמי חלון ולא משימות פתוחות.
- `send_failed` → שגיאה ב-OpenRouter או ב-Supabase insert. הודעה מפורטת ב-details.

---

## 6) תקלות

### 401 Unauthorized

מתקבל כאשר אף אחד מאלה לא תקין:

1. `QSTASH_CURRENT_SIGNING_KEY` ב-Vercel לא תואם למפתח ב-Upstash Console.
   - וודאו ששני המפתחות (Current + Next) הועתקו **מפרויקט ה-QStash הנכון**.
2. נשכח **Redeploy** ל-Production אחרי הוספת המשתנים.
3. ה-Schedule נוצר עם URL שגוי (למשל דומיין סטייג'ינג שאין בו את המשתנים).

תיקון: עוברים על השלבים בסעיף 4 לפי הסדר.

### 500 — `Missing cron auth env`

לא הוגדר אף `QSTASH_CURRENT_SIGNING_KEY` ולא `CRON_SECRET` בסביבה.

### 500 — `חסר QSTASH_TOKEN לטריגר Workflow`

ה-cron עבר אימות, אבל הוא לא יכול לשלוח את ה-Workflow trigger הלאה.
הוסיפו `QSTASH_TOKEN` ב-Vercel + Redeploy.

### Schedule רץ אבל אף נוטיפיקציה לא מגיעה

הסיבה לרוב מצויה ב-gate של ה-workflow (`habit-checkpoint-gates.ts`):

- `avoid_push: true` בפרופיל המשתמש → השרת מדלג.
- כבר נשלחה התראה לאותו slot היום → השרת מדלג.
- אין הרגלים שתואמים ל-slot היום (למשל `weekly` רק ביום מסוים) **וגם** אין משימות
  שהמשתמש סימן כ-`accepted` ועדיין לא דיווח עליהן ב-`task_statuses[id].execution_done` → השרת מדלג.
  המשמעות: משתמש שהשלים את כל המשימות שקיבל על עצמו לא יקבל תזכורת באותו חלון.

הריצו `dryRun=1` כדי לראות מי תוכנן ומי דולג, או `/test` כדי לראות עבור משתמש ספציפי
כמה משימות פתוחות וכמה הרגלים תואמים נמצאו.

---

## קישורי קוד

- `apps/web/lib/api/authorize-cron.ts` — אימות חתימה / Bearer.
- `apps/web/app/api/v1/ai/cron/master/route.ts` — cron מאסטר יומי.
- `apps/web/app/api/v1/ai/cron/habit-checkpoints/route.ts` — תזמון 3× ביום.
- `apps/web/app/api/v1/ai/cron/habit-checkpoints/test/route.ts` — endpoint דיבוג סינכרוני (`/test`).
- `apps/web/app/api/workflows/almog-habit-checkpoint/route.ts` — ה-workflow הקצה שמטפל במשתמש בודד.
- `apps/web/lib/workflows/habit-checkpoint-eligibility.ts` — סינון הרגלים לפי slot/יום.
- `apps/web/lib/workflows/habit-checkpoint-gates.ts` — חסימת כפילויות.
- `apps/web/components/settings/AlmogNudgeSettingsClient.tsx` — כפתור בדיקה ב-UI ב-`/settings/almog`.
