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

- בחירה דינמית לפי `shouldNudgeUser()`:
  - `dropout_risk=high` → נידג' מוקדם יותר (יום).
  - `dropout_risk=low` → סבלנות ארוכה יותר (4 ימים).
  - `engagement_pattern=weekend_drop` → עוד יום חסד.
- דילוג אם כבר נשלחה התראה מסוג `ai_message` ב-`CRON_NUDGE_COOLDOWN_HOURS` שעות (ברירת מחדל 48).
- יוצר טקסט ב-**GPT-5-mini דרך OpenRouter** (`openai/gpt-5-mini`, אותו מזהה כמו שאר אלמוג) עם `REENGAGEMENT_PROMPT` + `buildUserContext`.
- מכניס שורה ל-`notifications` (`type: ai_message`, `title: אלמוג`, `action_url: /journey`) + `metadata` עם `reason` ו-`urgency`.

### 4) UI התראות (דשבורד)

- קומפוננטה חדשה: [`components/ai/NotificationsInbox.tsx`](../apps/web/components/ai/NotificationsInbox.tsx)
- מחוברת ב-[`app/(dashboard)/layout.tsx`](../apps/web/app/(dashboard)/layout.tsx)
- API חדש:
  - `GET /api/v1/notifications` — 20 התראות אחרונות של המשתמש.
  - `PATCH /api/v1/notifications` — סימון התראה בודדת או כולן כנקראו.
- כפתור פעמון צף, מונה unread, ופתיחת חלונית עם ניווט ל-`action_url`.

### 5) אווטאר אלמוג מ-R2 (כולל אופטימיזציה)

- פאנל אדמין חדש: `admin` → "אווטאר אלמוג (R2)".
- API אדמין חדש: `POST /api/v1/admin/almog-avatar`.
- תהליך ההעלאה:
  1. קובץ נבחר בלוח אדמין.
  2. בדפדפן (לוח אדמין): יצוא ל-WebP ושינוי גודל (עד צלע ~900px) לפני שליחה — בלי ספריות native בשרת (מתאים ל-Vercel).
  3. השרת מאמת שזה WebP ושומר **רק** את הקובץ הדחוס ב-R2 תחת `almog/avatar` עם `Content-Type: image/webp`.
  4. כל רכיבי אלמוג (צ'אט/משוב/התראות AI) קוראים URL אחיד דרך `getAlmogAvatarUrl()`.

**הגדרת R2:**
- צור bucket ב-Cloudflare R2.
- פתח public/custom domain לבקט (לקריאה ציבורית).
- צור API Token עם הרשאות Object Read/Write לבקט.
- הגדר סביבות:
  - `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`
  - `R2_ACCOUNT_ID`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_IMAGE_BUCKET_NAME` (דלי תמונות; תאימות: `R2_BUCKET_NAME`)

**הערת Worker (אופציונלי):**
- לא חובה למימוש הנוכחי כי האופטימיזציה כבר מתבצעת בצד שרת.
- אם רוצים חתימות URL/CDN חכם/טרנספורמציות on-the-fly, ניתן להוסיף Cloudflare Worker בהמשך.

### 6) תזמון Cron חינמי

- הוסר Cron מ-`vercel.json` כדי לא להיות תלוי בתוכנית בתשלום.
- תזמון מתבצע דרך GitHub Actions:  
  [`/.github/workflows/nurawell-cron.yml`](../.github/workflows/nurawell-cron.yml)
- נדרש להגדיר ב-GitHub Secrets:
  - `CRON_SECRET`
  - `VERCEL_APP_URL` (למשל `https://nurawell.vercel.app`)

### 7) מודלים וסביבה

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

## איך לבדוק (E2E ידני אמיתי)

1. **מיגרציות:** ודא `000002_ai_ready_tables.sql` רצה (`ai_interactions`, `notifications`, `profiles.ai_context`).
2. **מסלול שיעור מלא (חובה):**
   - חידון → בדוק הופעת `AIFeedbackCard`.
   - משחק → בדוק הופעת `AIFeedbackCard`.
   - התחייבות → בדוק פידבק והמשך.
3. **אימות DB אחרי המסלול:**
   - בדוק שב-`ai_interactions` יש לפחות 6 רשומות חדשות לאותו משתמש (user/assistant לכל שלב).
   - בדוק שהטקסטים של assistant מרגישים טבעיים וקצרים (2-4 משפטים, ללא ניסוח רובוטי).
4. **בדיקת נידג' + UI התראות:**
   - הרץ cron (`GET /api/v1/ai/cron/master` עם secret).
   - ודא שנוספה שורה ב-`notifications`.
   - היכנס לדשבורד: פעמון ההתראות מציג unread, לחיצה פותחת רשימה, ולחיצה על כרטיס מסמנת כנקרא.
5. **סקריפט צ'אט:** `node --env-file=.env.local scripts/test-ai-chat.mjs` (מתוך `apps/web`).

## מה עדיין לא / להמשך פיתוח

- **Push אמיתי** (FCM/APNS/WebPush) מעבר ל-inbox בתוך האפליקציה.
- **פילטרים/ארכיון להתראות** (כרגע מוצגות 20 אחרונות בלבד).
- **מסך הגדרות נידג'** — תדירות, טון, ביטול התראות.
- **בדיקות אוטומטיות** — אינטגרציה ל-Cron ול-endpoints.
- **החמרת אבטחה** — להסיר מפתחות אמיתיים מ-`.env.example` אם הועלו בטעות; רוטציה אם נחשפו.

---

*עודכן: UI התראות בדשבורד, Cron חינמי ב-GitHub Actions, E2E ידני למסלול שיעור מלא.*
