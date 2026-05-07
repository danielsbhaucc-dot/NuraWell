# NuraWell — AI (אלמוג): מה עובד, איך לבדוק, מה חסר

מסמך עדכני לשילוב ה-AI בנוראוול: מוצר, API, Cron, ובדיקות.

## מה המערכת עושה בפועל

### 1) ליווי בשיעור (Journey)

| אירוע | API | UI |
|--------|-----|-----|
| סיום **חידון** | `POST /api/v1/ai/lesson-feedback` (`interaction_type: quiz`) | כרטיס `AIFeedbackCard` (ירוק) אחרי סיום השאלות |
| סיום **משחק** נכון/לא נכון | אותו endpoint (`interaction_type: game`) | כרטיס `AIFeedbackCard` (ענבר) אחרי סיום המשחק |
| **התחייבות** (עם / בלי) | אותו endpoint (`interaction_type: commitment`) | כרטיס + כפתור **המשך לשלב הבא** לפני עדכון `journey_progress` |

כל קריאה כותבת ל-`ai_interactions` (הודעת אירוע + תשובת אלמוג) עם `context_type: lesson` כשיש `step_id`.

### 2) צ'אט צף (דשבורד)

- `POST /api/v1/ai/chat` עם `stream: true` — סטרימינג SSE, שמירה ל-`ai_interactions`.
- גוף הבקשה כולל `user_id` שחייב להתאים ל-session (אחרת 403). הקונטקסט האישי נטען בשרת מ-`profiles` (כולל `ai_context`, רצף, `last_active_at`) דרך `buildUserContext()`.

### 3) Cron מאוחד (ניתוח + נידג' חזרה)

נתיב יחיד (חיסכון ב-invocations של Vercel):

**`GET` או `POST`** — [`apps/web/app/api/v1/ai/cron/master/route.ts`](../apps/web/app/api/v1/ai/cron/master/route.ts)

**אבטחה:** חובה `CRON_SECRET` בסביבה. אחד מהבאים:

- כותרת `Authorization: Bearer <CRON_SECRET>`
- או query `?secret=<CRON_SECRET>`

**שלב א — ניתוח (24 שעות אחרונות)**  

- אוסף `user_id` ייחודיים מ-`ai_interactions` עם `created_at` בחלון 24 שעות (עד `CRON_MAX_ANALYSIS_USERS`, ברירת מחדל 20).
- לכל משתמש: שולח תמליל שורות אחרונות ל-**DeepSeek** (מודל ברירת מחדל `deepseek-chat` — שכבת V3 ב-API הרשמי; ניתן לעקוף ב-`DEEPSEEK_ANALYSIS_MODEL`).
- מפרש JSON לפי `ANALYSIS_PROMPT` וממזג ל-`profiles.ai_context` (שדות מותרים בלבד).

**שלב ב — נידג' להחזרת משתמשים**

- משתמשים עם `last_active_at` לפני **X ימים** (`CRON_INACTIVITY_DAYS`, ברירת מחדל 2), עד `CRON_MAX_NUDGE_USERS` (ברירת מחדל 20).
- דילוג אם כבר נשלחה התראה מסוג `ai_message` ב-`CRON_NUDGE_COOLDOWN_HOURS` שעות (ברירת מחדל 48).
- יוצר טקסט ב-**GPT-5-mini דרך OpenRouter** (`openai/gpt-5-mini`, אותו מזהה כמו שאר אלמוג) עם `REENGAGEMENT_PROMPT` + `buildUserContext`.
- מכניס שורה ל-`notifications` (`type: ai_message`, `title: אלמוג`, `action_url: /journey`).

**הערה:** אין כרגע מסך באפליקציה שמציג את טבלת `notifications` — השורות נשמרות ל-push / מימוש UI עתידי.

**תזמון Vercel:** ב-[`apps/web/vercel.json`](../apps/web/vercel.json) מוגדר Cron יומי `0 7 * * *` (07:00 UTC). דורש תוכנית שתומכת ב-Crons; בפרויקט ודא ש-root ה-build הוא `apps/web` כמו היום.

### 4) מודלים וסביבה

| שימוש | מודל / ספק |
|--------|------------|
| אלמוג (צ'אט, פידבק בשיעור, נידג' Cron) | `openai/gpt-5-mini` דרך **OpenRouter** |
| ניתוח Cron | **DeepSeek API** — `getDeepseekAnalysisModel()` → `deepseek-chat` (ברירת מחדל) |
| מפתחות | `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Cron בלבד), `CRON_SECRET` |

רשימה מלאה של משתני אופציה: [`apps/web/.env.example`](../apps/web/.env.example).

## קבצים מרכזיים

| קובץ | תפקיד |
|------|--------|
| [`lib/ai/prompts.ts`](../apps/web/lib/ai/prompts.ts) | אלמוג, פידבק שיעור, נידג', ניתוח JSON |
| [`lib/ai/memory.ts`](../apps/web/lib/ai/memory.ts) | `buildUserContext`, `updateAiContext` |
| [`lib/ai/client.ts`](../apps/web/lib/ai/client.ts) | לקוחות OpenRouter + DeepSeek |
| [`lib/ai/deepseek-model.ts`](../apps/web/lib/ai/deepseek-model.ts) | מזהה מודל ניתוח ל-Cron |
| [`lib/supabase/api-route-client.ts`](../apps/web/lib/supabase/api-route-client.ts) | Cookie או Bearer למשתמש |
| [`lib/supabase/admin.ts`](../apps/web/lib/supabase/admin.ts) | Service role (Cron) |
| [`components/ai/AIChatWidget.tsx`](../apps/web/components/ai/AIChatWidget.tsx) | צ'אט |
| [`components/ai/AIFeedbackCard.tsx`](../apps/web/components/ai/AIFeedbackCard.tsx) | פידבק בשיעור |

## איך לבדוק (ידני)

1. **מיגרציות:** `000002_ai_ready_tables.sql` רצה ב-Supabase (`ai_interactions`, `notifications`, `profiles.ai_context`, …).
2. **צ'אט:** דשבורד → כפתור צף → הודעה → בדיקה ב-`ai_interactions`.
3. **חידון / משחק / התחייבות:** צעד מסע → סיים חלק → כרטיס אלמוג; בדוק `ai_interactions`.
4. **Cron (מקומי):**  
   `curl -s "http://localhost:3000/api/v1/ai/cron/master?secret=YOUR_CRON_SECRET"`  
   (או Header Bearer). ודא `SUPABASE_SERVICE_ROLE_KEY` ו-`CRON_SECRET` ב-`.env.local`.
5. **סקריפט צ'אט:** `node --env-file=.env.local scripts/test-ai-chat.mjs` (מתוך `apps/web`).

## מה עדיין לא / להמשך פיתוח

- **UI להתראות** — טעינת `notifications` בדשבורד / Push.
- **עדכון `last_active_at`** — ה-Cron מסתמך עליו; לוודא שכל כניסה משמעותית מעדכנת את השדה (טריגר/מידלוור).
- **מסך הגדרות נידג'** — תדירות, טון, ביטול התראות.
- **בדיקות אוטומטיות** — אינטגרציה ל-Cron ול-endpoints.
- **החמרת אבטחה** — להסיר מפתחות אמיתיים מ-`.env.example` אם הועלו בטעות; רוטציה אם נחשפו.

---

*עודכן: MiniGame מחובר ל-AI, Cron מאוחד master, נידג'ים ב-GPT-5-mini.*
