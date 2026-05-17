# אימות אימייל (Supabase Auth) + מיילים מ-Resend

## 1. אימות אימייל ב-Supabase

1. [Supabase Dashboard](https://supabase.com/dashboard) → הפרויקט → **Authentication** → **Providers** → **Email**
2. הפעל **Confirm email**
3. **Authentication** → **URL Configuration**:
   - **Site URL**: `https://nurawell.ai` (או כתובת הפרודקשן שלך)
   - **Redirect URLs** — הוסף:
     - `https://nurawell.ai/auth/callback`
     - `http://localhost:3000/auth/callback` (פיתוח)

אחרי הרשמה המשתמש מופנה ל־`/register/check-email` עד ללחיצה על הקישור במייל.

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

### אופציה ב׳ — רק מייל ברכה מאלמוג מהאפליקציה

הוסף ב-Vercel (או `.env.local`):

```env
RESEND_API_KEY=re_xxxxxxxx
RESEND_FROM=NuraWell <onboarding@nurawell.ai>
```

מייל האימות נשאר ב-Supabase (ברירת מחדל); אחרי אימות, האפליקציה שולחת מייל ברכה מאלמוג (עיכוב ~3 דקות).

## 4. משתני סביבה באפליקציה

| משתנה | שימוש |
|--------|--------|
| `NEXT_PUBLIC_APP_URL` | בסיס ל־`emailRedirectTo` בהרשמה |
| `RESEND_API_KEY` | מייל ברכה מאלמוג |
| `RESEND_FROM` | שולח, חייב דומיין מאומת |
| `QSTASH_TOKEN` | תזמון ברכה 3 דקות אחרי אימות |

## 5. מיגרציה

הרץ ב-Supabase SQL:

`supabase/migrations/000018_profile_welcome_email.sql`

## 6. בדיקה

1. הרשמה בטופס → דף "בדוק/י את האימייל"
2. לחיצה על קישור באימייל → `/auth/callback` → `/courses`
3. אחרי ~3 דקות: מייל מאלמוג (אם Resend מוגדר) + התראה באפליקציה
