# אימות אימייל (Supabase Auth) + מיילים מ-Resend

## 1. אימות אימייל ב-Supabase

1. [Supabase Dashboard](https://supabase.com/dashboard) → הפרויקט → **Authentication** → **Providers** → **Email**
2. הפעל **Confirm email**
3. **Authentication** → **URL Configuration** (ראו הסבר למטה אם האתר על Vercel):

אחרי הרשמה המשתמש מופנה ל־`/register/check-email` עד ללחיצה על הקישור במייל.

### מה זה Redirect URLs? (חשוב אם האתר על `*.vercel.app`)

זה **לא** קשור ל-Resend ולא לדומיין `nurawell.ai`.

כשמשתמש לוחץ על קישור האימות במייל, Supabase מחזיר אותו לכתובת האתר שלך, למשל:

`https://nurawell.vercel.app/auth/callback?code=...`

Supabase מאפשר redirect **רק** לכתובות שמופיעות ברשימת **Redirect URLs**.

לכן:

| שדה | מה לשים עכשיו (Vercel) | מה לשים אחרי חיבור דומיין |
|-----|-------------------------|---------------------------|
| **Site URL** | `https://nurawell.vercel.app` (או ה-URL המדויק שלך ב-Vercel) | `https://nurawell.ai` |
| **Redirect URLs** | `https://nurawell.vercel.app/auth/callback` | `https://nurawell.ai/auth/callback` |
| | `http://localhost:3000/auth/callback` (פיתוח) | + localhost |

**Vercel — משתנה חובה:** `NEXT_PUBLIC_APP_URL` = אותה כתובת בדיוק (למשל `https://nurawell.vercel.app`), כדי שהקישור במייל האימות יצביע לאותו מקום.

Resend מאומת על `nurawell.ai` — זה רק ל**שליחת** מיילים (`dolev@nurawell.ai`). זה בנפרד לגמרי מה-URL של האתר ב-Vercel.

## 2. תבנית אימייל אימות (Supabase)

**Authentication** → **Email Templates** → **Confirm signup**

דוגמה (HTML):

```html
<h2 style="font-family:Rubik,Heebo,sans-serif;color:#047857">אימות כתובת ב-NuraWell</h2>
<p style="font-family:Rubik,Heebo,sans-serif;color:#334155">לחץ/י לאישור האימייל והמשך/י להרשמה:</p>
<p><a href="{{ .ConfirmationURL }}" style="background:#059669;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold">אימות אימייל</a></p>
```

הקישור `{{ .ConfirmationURL }}` מפנה ל־`/auth/callback` ואז לאפליקציה.

## 3. Resend — כתובת מייל אישית (דומיין מאומת)

הדומיין שלך כבר מאומת ב-Resend. עכשיו מחברים ל-Supabase **או** שולחים מייל ברכה מהאפליקציה.

### אופציה א׳ — כל מיילי Auth דרך Resend (מומלץ לעיצוב אחיד)

1. [Resend](https://resend.com) → **Domains** — ודא שהדומיין פעיל (למשל `nurawell.ai`)
2. **API Keys** → צור מפתח
3. ב-Supabase: **Project Settings** → **Authentication** → **SMTP Settings** → **Enable Custom SMTP**
   - Host: `smtp.resend.com`
   - Port: `465` (SSL) או `587` (TLS)
   - User: `resend`
   - Password: מפתח ה-API של Resend
   - Sender email: `onboarding@nurawell.ai` (חייב להיות מהדומיין המאומת)
   - Sender name: `NuraWell`

אחרי שמירה, מיילי האימות יישלחו מ-`onboarding@nurawell.ai`.

### אופציה ב׳ — רק מייל ברכה מדולב מהאפליקציה

הוסף ב-Vercel (או `.env.local`):

```env
RESEND_API_KEY=re_xxxxxxxx
# שולח ראשון (כבר קיים אצלך) — נשאר RESEND_FROM
RESEND_FROM=NuraWell <onboarding@nurawell.ai>
# שולח שני — דולב (אופציונלי; בלי זה משתמשים ב-dolev@nurawell.ai מהקוד)
RESEND_FROM_DOLEV=Dolev <dolev@nurawell.ai>
```

מייל האימות נשאר ב-Supabase; מייל הברכה נשלח מ-**dolev** (`sender: 'dolev'` בקוד). להוספת שולחים בעתיד: `lib/email/senders.ts`.

### קוד OTP בתבנית אימות Supabase

ב-**Confirm signup** הוסף את `{{ .Token }}` כדי שהמשתמש יוכל להזין קוד בן 6 ספרות בדף `/register/check-email`.

## 4. משתני סביבה באפליקציה

| משתנה | שימוש |
|--------|--------|
| `NEXT_PUBLIC_APP_URL` | בסיס ל־`emailRedirectTo` בהרשמה |
| `RESEND_API_KEY` | שליחת מיילים דרך Resend |
| `RESEND_FROM` | שולח ברירת מחדל (`default`) — השאר כמו שהיה |
| `RESEND_FROM_DOLEV` | אופציונלי — דורס את `dolev@nurawell.ai` מהקוד |
| `QSTASH_TOKEN` | גיבוי תזמון מייל ברכה |

## 5. מיגרציה

הרץ ב-Supabase SQL:

`supabase/migrations/000018_profile_welcome_email.sql`  
`supabase/migrations/000020_dolev_welcome_seen.sql`

## 6. בדיקה

1. הרשמה בטופס → דף "בדוק/י את האימייל"
2. לחיצה על קישור באימייל → `/auth/callback` → `/register/verified`
3. מיידית: מייל מדולב עם סיכום (אם Resend מוגדר) + התראה באפליקציה; גיבוי אחרי ~3 דקות
