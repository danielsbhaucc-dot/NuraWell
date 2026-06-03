# NuraWell — תזמוני Cron לסיכומים תקופתיים (Memory Pyramid)

מדריך הגדרה ידני של 6 ה-Schedules שמייצרים אוטומטית את הסיכומים
היומיים, השבועיים, החודשיים, הרבעוניים, חצי-שנתיים והשנתיים של המשתמשים.

> **תלוי ב:** `docs/CRON_SCHEDULES_SETUP.md` (אימות Upstash, secrets, environment).
> כאן ננחה רק על ה-schedules הספציפיים של ה-Summary Engine.

## תוכן עניינים

1. [רקע ופירמידת הזיכרון](#1-רקע)
2. [ה-API שיש להפעיל](#2-api)
3. [שש ה-Schedules — Cron + Payload](#3-schedules)
4. [Multi-user fan-out (כשיש >1 משתמש)](#4-fan-out)
5. [בדיקה מיידית עם curl](#5-בדיקה)
6. [תקלות שכיחות](#6-תקלות)

---

## 1) רקע

המערכת בנויה כפירמידה: כל רמה גבוהה קוראת **רק את הסיכומים של הרמה
שמתחתיה** (Daily לעומת task_logs, Weekly מסתמך על 7 דיילי, וכו'). זה חוסך
~95% טוקנים בהשוואה לקריאת חודש שלם של logs ל-LLM ושומר על עקביות בין
רמות (כל מספר מופיע פעם אחת בלבד בכל הפירמידה).

לכן ה-Schedules צריכים לרוץ **בסוף התקופה הרלוונטית**:

| רמה | מתי לרוץ | למה אז |
|---|---|---|
| `daily` | 23:55 כל יום | סוף היום — `task_logs` של היום סגור |
| `weekly` | 23:55 ביום ראשון (סוף ISO week — Sun) | ה-7 דיילי של השבוע מוכנים |
| `monthly` | 23:55 ביום האחרון של החודש | ה-Weekly summaries מוכנים |
| `quarterly` | 23:55 ב-31/3, 30/6, 30/9, 31/12 | סוף רבעון |
| `semi_annual` | 23:55 ב-30/6 ו-31/12 | סוף חצי |
| `annual` | 23:55 ב-31/12 | סוף שנה |

> 💡 **חשוב:** הקרון שלנו תומך ב-`periodKey: "auto"` — ה-API מחשב לבד
> את "התקופה הנוכחית" בלוח ירושלים. לכן ה-Schedules הם **סטטיים**
> ולא צריך לעדכן payload כל שבוע/חודש/שנה.

---

## 2) API

נתיב: **`POST https://<your-domain>/api/summaries/generate`**

**Headers:**
```
Content-Type: application/json
```
(QStash חותם את הבקשה אוטומטית עם `Upstash-Signature` אם הגדרת
`QSTASH_CURRENT_SIGNING_KEY` ב-Vercel — ראה
`docs/CRON_SCHEDULES_SETUP.md`. אם לא — אפשר Bearer ידני עם
`CRON_SECRET`.)

**Body:**
```json
{
  "userId": "<UUID של המשתמש>",
  "type": "daily | weekly | monthly | quarterly | semi_annual | annual",
  "periodKey": "auto",
  "dispatchNotification": true
}
```

- `periodKey: "auto"` → השרת מחשב את התקופה הנוכחית (Israel TZ).
- `dispatchNotification: true` → אחרי הסיכום, נשלחת התראה למשתמש
  ("הסיכום השבועי שלך מוכן ✨").

**תגובה (200):**
```json
{
  "ok": true,
  "summary": {
    "userId": "...",
    "type": "weekly",
    "periodKey": "2026-W22",
    "metrics": { "completion_rate": 0.71, "max_streak": 4, ... },
    "ai_insight": "...",
    "ai_model": "openai/gpt-5-mini"
  },
  "notificationDispatched": true,
  "authorizedAs": "cron"
}
```

---

## 3) Schedules

### חישוב Cron — UTC vs Israel

QStash משתמש ב-**UTC**. ישראל היא UTC+2 בחורף (IST) ו-UTC+3 בקיץ (IDT).
את ה-Cron שלנו נכוון ל-23:55 בקיץ ישראל = **20:55 UTC**.
בחורף זה ייצא 22:55 IL — עדיין סוף היום, מספיק טוב.
(אם אתה רוצה דיוק קיצוני בכל עונה — תצטרך 2 schedules ולהחליף בידיים בעת
מעבר שעון. לרוב לא שווה את הסיבוך.)

### Schedule 1 — Daily Summary (23:55 IL כל יום)

| שדה | ערך |
|---|---|
| **Destination URL** | `https://<your-domain>/api/summaries/generate` |
| **Method** | `POST` |
| **Cron** | `55 20 * * *` |
| **Body** (JSON) | `{"userId":"<USER-UUID>","type":"daily","periodKey":"auto","dispatchNotification":true}` |
| **Headers** | `Content-Type: application/json` |
| **Retries** | `3` (ברירת המחדל של QStash) |

### Schedule 2 — Weekly Summary (23:55 IL כל ראשון בלילה)

ISO week ב-NuraWell מסתיים ביום ראשון (Mon→Sun). לכן ה-cron רץ במוצ"ש
מבחינת לוח שבועי בעולם, אבל **23:55 ביום ראשון בישראל** — זה הזמן הנכון.

| שדה | ערך |
|---|---|
| **Destination URL** | `https://<your-domain>/api/summaries/generate` |
| **Method** | `POST` |
| **Cron** | `55 20 * * 0` |
| **Body** | `{"userId":"<USER-UUID>","type":"weekly","periodKey":"auto","dispatchNotification":true}` |

> `* * * * 0` = כל יום ראשון. (cron weekday: 0 = Sunday, 1 = Monday, ...)

### Schedule 3 — Monthly Summary (23:55 IL ביום האחרון של החודש)

QStash תומך ב-`L` של cron (last day of month) לפעמים — אם לא, פתרון
פשוט: רץ ב-1 לחודש בבוקר ומסכם את "התקופה הקודמת". כדי לא לסבך —
ננצל את `auto`: קרון רץ ב-1 לחודש בבוקר → השרת מבין שהחודש הקודם הוא
"current period" (כי `today` כבר 1 לחודש החדש).

> 🔥 **שינוי חשוב מהמודל הפשטני:** ב-monthly + מעלה אנחנו לא רוצים
> "current month" אלא "previous". פתרון: קרא ל-API עם `periodKey: "auto"`
> אבל הוסף `?previous=1` או החלף `auto` ב-key מפורש. המומלץ הקל ביותר —
> לתזמן ב-23:55 ביום אחרון של החודש (אז `auto` עדיין מצביע על החודש
> הנוכחי = הסוגר).

| שדה | ערך |
|---|---|
| **Destination URL** | `https://<your-domain>/api/summaries/generate` |
| **Method** | `POST` |
| **Cron** | `55 20 28-31 * *` (כל יום בין ה-28 ל-31, אבל ה-engine UPSERT-אידמפוטנטי) |
| **Body** | `{"userId":"<USER-UUID>","type":"monthly","periodKey":"auto","dispatchNotification":true}` |

> ה-UNIQUE constraint על `(user_id, type, period_key)` מבטיח שגם אם הקרון
> רץ 4 פעמים (28-31), נוצר רק רישום אחד לחודש. הקריאות ה-2-3-4 פשוט
> יעדכנו את אותה שורה (UPSERT). זה גם מתקן מצבים של "החודש כבר נסגר
> אבל הסיכום עדיין לא נוצר" כי הקרון של 31 נכשל.

### Schedule 4 — Quarterly Summary (23:55 IL בסוף רבעון)

| שדה | ערך |
|---|---|
| **Destination URL** | `https://<your-domain>/api/summaries/generate` |
| **Method** | `POST` |
| **Cron** | `55 20 28-31 3,6,9,12 *` |
| **Body** | `{"userId":"<USER-UUID>","type":"quarterly","periodKey":"auto","dispatchNotification":true}` |

> רץ ביום 28-31 של מרץ / יוני / ספטמבר / דצמבר. UPSERT אידמפוטנטי.

### Schedule 5 — Semi-Annual Summary (23:55 IL בסוף חצי)

| שדה | ערך |
|---|---|
| **Destination URL** | `https://<your-domain>/api/summaries/generate` |
| **Method** | `POST` |
| **Cron** | `55 20 28-30 6 *` *(חצי 1 — סוף יוני)* |
| **Cron #2** | `55 20 28-31 12 *` *(חצי 2 — סוף דצמבר)* |
| **Body** | `{"userId":"<USER-UUID>","type":"semi_annual","periodKey":"auto","dispatchNotification":true}` |

> צריך ליצור **שני schedules נפרדים** — אחד ליוני (חצי 1) ואחד לדצמבר
> (חצי 2). שני ה-cron expressions לא יכולים להיות ב-Schedule אחד.

### Schedule 6 — Annual Summary (23:55 IL ב-31/12)

| שדה | ערך |
|---|---|
| **Destination URL** | `https://<your-domain>/api/summaries/generate` |
| **Method** | `POST` |
| **Cron** | `55 20 31 12 *` |
| **Body** | `{"userId":"<USER-UUID>","type":"annual","periodKey":"auto","dispatchNotification":true}` |

---

## 4) Multi-user fan-out

**הבעיה:** Schedule ב-QStash שולח payload **קבוע**. אם יש לך 100 משתמשים —
לא תיצור 100 schedules. תצטרך fan-out worker.

**הפתרון המומלץ:** Workflow אחד שעושה fan-out — כמו שעשינו ב-
`apps/web/app/api/workflows/almog-habit-checkpoint/route.ts`.

**דפוס:**
1. `POST /api/workflows/summaries-cascade` (חדש — עוד לא בנוי).
   - שולף את כל המשתמשים הפעילים.
   - לכל אחד עושה `context.run('generate-${userId}')` שקורא ל-engine.
2. ה-Schedule מצביע על ה-Workflow הזה במקום על ה-route הבודד.
3. ה-Workflow מטפל ב-checkpointing, retry פר-משתמש, ו-rate limiting
   מובנה (אין הצפת LLM).

עד שיש fan-out — אם יש לך מעט משתמשים (1-10), אפשר ליצור Schedule נפרד
לכל משתמש (palatable עד גודל מסוים). מעבר לזה חובה לבנות fan-out.

---

## 5) בדיקה מיידית

לפני שמגדירים Schedules — לוודא שה-API חי:

```bash
curl -i -X POST "https://<your-domain>/api/summaries/generate" \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "<USER-UUID>",
    "type": "weekly",
    "periodKey": "auto",
    "dispatchNotification": false
  }'
```

תגובה אמורה להיות `200 OK` עם הסיכום ב-JSON.

לוקאל:
```bash
curl -X POST http://localhost:3000/api/summaries/generate \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"userId":"<USER-UUID>","type":"daily","periodKey":"auto"}'
```

---

## 6) תקלות שכיחות

### `401 Unauthorized` בקרון
- חסר `QSTASH_CURRENT_SIGNING_KEY` ב-Vercel, או חסר `CRON_SECRET`.
- ה-URL ב-Schedule מצביע על דומיין ישן/staging שאין לו ה-env.
- פתרון: ראה `docs/CRON_SCHEDULES_SETUP.md` סעיף 4.

### `403 Forbidden` או `400 Invalid body`
- ה-`userId` לא תואם ל-session (לא רלוונטי לקרון — תמיד יעבור על
  `Bearer CRON_SECRET` או `Upstash-Signature` תקפים).
- `periodKey` לא במבנה הנכון. `"auto"` תמיד תקין; `"2026-W22"` תקין
  ל-weekly אבל לא ל-monthly.

### `500 PGRST` או "relation does not exist"
- מיגרציה `000028_periodic_summaries.sql` לא רצה ב-DB.
- פתרון: `npx supabase db push` או הרצה ידנית מ-SQL Editor.

### "סיכום שנתי" לוקח 30+ שניות
- רגיל. ה-cascade מייצר את כל הרמות החסרות (≈12 חודשים, ≈52 שבועות,
  ≈365 ימים — אם הכל ריק). זה קורה רק בפעם הראשונה. הפעמים הבאות
  ייקראו רק מ-`periodic_summaries` כי הילדים כבר קיימים.
- אם משך הקריאה > 60s → ה-Vercel timeout יעיף את הבקשה. במקרה כזה
  כדאי לרוץ קודם את ה-monthly/quarterly לבד, ואז ה-annual יעבוד מהר.

### `429` או החזרות שגיאה מ-OpenRouter
- חרגנו ממכסה. ה-engine נופל אוטומטית ל-Groq (Llama 4) — נראה
  ב-`ai_model` שהוא לא `openai/gpt-5-mini` אלא `meta-llama/...`.
- אם **גם** Groq נופל → static template ב-`ai_insight`. נדיר.

---

## נספח: Cheatsheet של ה-6 Schedules

| # | Type | Cron (UTC) | משמעות IL |
|---|---|---|---|
| 1 | daily | `55 20 * * *` | 23:55 כל יום (קיץ) |
| 2 | weekly | `55 20 * * 0` | 23:55 כל ראשון |
| 3 | monthly | `55 20 28-31 * *` | 23:55 בסוף חודש |
| 4 | quarterly | `55 20 28-31 3,6,9,12 *` | 23:55 בסוף רבעון |
| 5a | semi_annual | `55 20 28-30 6 *` | 23:55 בסוף יוני |
| 5b | semi_annual | `55 20 28-31 12 *` | 23:55 בסוף דצמבר |
| 6 | annual | `55 20 31 12 *` | 23:55 ב-31/12 |

כולם עם `periodKey: "auto"` כדי שלא נצטרך לעדכן payload-ים מתי שמתחלף
תאריך.
