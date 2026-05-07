# NuraWell — AI (אלמוג): מה מומש, איך לבדוק, מה נשאר

מסמך זה מסכם את שילוב ה-AI בפרויקט נוראוול עד שלב ה-UI (פידבק בשיעור + צ'אט צף), כולל בדיקות ידניות והמשך דרך.

## מה מומש (ארכיטקטורה קצרה)

| אזור | תיאור |
|------|--------|
| **זיכרון דחוס** | `profiles.ai_context` + `buildUserContext()` ב-[`apps/web/lib/ai/memory.ts`](../apps/web/lib/ai/memory.ts) — טקסט קצר ל-system prompt |
| **פרומפטים** | [`apps/web/lib/ai/prompts.ts`](../apps/web/lib/ai/prompts.ts) — דמות **אלמוג** (גבר), אמפתיה, התאמה בלתי נראית, בלי "זיכרון/נתונים" |
| **לקוחות מודל** | [`apps/web/lib/ai/client.ts`](../apps/web/lib/ai/client.ts) — OpenRouter (`openai/gpt-5-mini`) + DeepSeek לעתיד |
| **API** | `POST /api/v1/ai/chat` — JSON או **SSE** (`stream: true`); `POST /api/v1/ai/lesson-feedback` — פידבק קצר אחרי חידון/התחייבות |
| **אימות** | Supabase: עוגיות בדפדפן או `Authorization: Bearer`; שדה אופציונלי `user_id` בגוף — **חייב להתאים** ל-`auth` או מתקבלת 403 |
| **שמירה** | `ai_interactions` — כל הודעת user/assistant |

## קבצי UI חדשים/מעודכנים

- [`apps/web/components/ai/AIFeedbackCard.tsx`](../apps/web/components/ai/AIFeedbackCard.tsx) — כרטיס פידבוק עם אנימציית כניסה (Framer Motion)
- [`apps/web/components/ai/AIChatWidget.tsx`](../apps/web/components/ai/AIChatWidget.tsx) — כפתור צף + חלון צ'אט RTL, בועות, סטרימינג, מצב "אלמוג כותב…"
- [`apps/web/components/journey/QuizSection.tsx`](../apps/web/components/journey/QuizSection.tsx) — אחרי סיום חידון: קריאה ל-`lesson-feedback` + `AIFeedbackCard`
- [`apps/web/components/journey/CommitmentSection.tsx`](../apps/web/components/journey/CommitmentSection.tsx) — אחרי בחירה (עם/בלי התחייבות): פידבק + כפתור **המשך לשלב הבא** לפני עדכון `onChoose`
- [`apps/web/app/(dashboard)/layout.tsx`](../apps/web/app/(dashboard)/layout.tsx) — `<AIChatWidget userId={user.id} />`

## איך לבדוק שהכול עובד

### 1) סביבה

- `apps/web/.env.local`: `NEXT_PUBLIC_SUPABASE_*`, `OPENROUTER_API_KEY`, מיגרציה `000002` הופעלה (כולל `ai_interactions`, `ai_context`).
- `npm run dev` מתוך `apps/web` (או מונורפו לפי ההרגל שלך).

### 2) API + DB (כבר אימתת בסקריפט)

- סקריפט: `node --env-file=.env.local scripts/test-ai-chat.mjs` (Bearer) — בודק צ'אט + שורות ב-`ai_interactions`.
- לחלופין `curl` עם JWT אימות (ראה הודעות קודמות בצ'אט).

### 3) פידבק אחרי חידון (UI)

1. התחבר למערכת.
2. פתח צעד מסע עם חידון (`/journey/...`).
3. סיים את כל השאלות.
4. אמור להופיע כרטיס **מילה מאלמוג** (טעינה ואז טקסט).
5. ב-Supabase: בדוק שורות חדשות ב-`ai_interactions` עם `context_type = lesson`.

### 4) פידבק אחרי התחייבות (UI)

1. עבור לסעיף התחייבות באותו צעד.
2. לחץ "מתחייב" או "בלי התחייבות".
3. אמור להופיע כרטיס אלמוג + בסיום **המשך לשלב הבא** (רק אז מתעדכן `journey_progress` דרך `onChoose`).
4. וודא ב-DB שאין כפילויות לא רצויות; ביטול באמצע ("התחרטתי") מאפס את הזרימה בלי לנווט.

### 5) צ'אט צף

1. בכל מסך דשבורד: לחץ על כפתור העיגול הירוק (למטה-ימין, מעל ה-bottom nav).
2. שלח הודעה — טקסט אמור להופיע **בזרימה** (מילה-מילה).
3. לפני הטוקן הראשון: אינדיקציה "אלמוג כותב…".

### 6) `user_id` בגוף הבקשה

- הצ'אט שולח `user_id` זהה ל-`user.id` מה-layout.
- אם תשלח בכוונה UUID אחר — תקבל `403 Forbidden: user_id does not match session`.
- הקונטקסט האישי נטען **תמיד** לפי משתמש ה-session בשרת; השדה בגוף הוא לאינטגרציות עתידיות ולאימות מפורש.

## מה עוד לא מומש / רעיונות להמשך

- **MiniGame** — עדיין לא מחובר ל-`lesson-feedback` (רק Quiz + Commitment).
- **Cron / DeepSeek** — ניתוח batch לעדכון `ai_context`, זיהוי היעלמות, התראות `notifications`.
- **היסטוריית צ'אט ב-UI** — טעינת הודעות אחרונות מ-`ai_interactions` (כרגע רק `session_id` ב-sessionStorage).
- **שגיאות רשת** — ניתן להוסיף כפתור "נסה שוב" בכרטיסי פידבק.
- **אי-התאמת משתמש** — אם תרצה למנוע שליחת `user_id` מהלקוח לגמרי, אפשר להסיר מה-body ולהסתמך רק על session (השרת כבר יודע מי המשתמש).

## קישורים מהירים לקבצים

- Chat route: [`apps/web/app/api/v1/ai/chat/route.ts`](../apps/web/app/api/v1/ai/chat/route.ts)
- Lesson feedback: [`apps/web/app/api/v1/ai/lesson-feedback/route.ts`](../apps/web/app/api/v1/ai/lesson-feedback/route.ts)
- Supabase לראוטים: [`apps/web/lib/supabase/api-route-client.ts`](../apps/web/lib/supabase/api-route-client.ts)

---

*עודכן לאחר השלמת Phase 3 (UI + אימות user_id + AIFeedbackCard).*
