# NuraWell — מפת דרכים ל-AI-First אמיתי

> מסמך עבודה. המטרה: להפוך את NuraWell מ-"אפליקציה עם AI מסביב" ל-"AI שמניע כל מסך וכל אינטראקציה".
> נכתב לאחר סקירת קוד מלאה של שכבת ה-AI הקיימת (49 מודולים ב-`apps/web/lib/ai/`, 80+ API routes).

---

## 0. איפה אנחנו היום (מצב פתיחה)

### מה שכבר באמת AI-First (ציון ~90%)
- **צ׳אט אלמוג עמוק** — `apps/web/app/api/v1/ai/chat/route.ts`: streaming, RAG, זיהוי כוונות, סימון משימות/הרגלים/משקל מתוך שיחה חופשית, follow-up, חגיגות.
- **זיכרון אמיתי** — `profiles.ai_context` + זיכרון וקטורי ב-Upstash (`lib/ai/memory.ts`, `vector-memory-ingest.ts`).
- **RAG על ידע מערכת** — `lib/ai/almog-system-rag.ts`, שליפה לפי התקדמות והרשאות.
- **מנוע התראות חכם** — habit checkpoints, life-context (חופשה/מחלה/משבר משנים טון), churn, onboarding check-ins.
- **תשתית מודלים** — GPT-5 / GPT-5-mini / Claude Sonnet 4.6 / Llama 4 / DeepSeek / embeddings, דרך `lib/ai/client.ts`.

### מה שעדיין לא AI-First (הפער)
| אזור | מצב היום | היעד |
|------|-----------|------|
| Dashboard / Home / Progress | מספרים וגרפים דטרמיניסטיים | אלמוג מסביר ומדגיש מה חשוב עכשיו |
| מסע / שיעור | רצף קבוע זהה לכולם | מסלול אדפטיבי לפי המשתמש |
| Onboarding | טופס שדות ידני | שיחה עם אלמוג |
| פרופיל / הגדרות | טפסים ידניים | עדכון דרך שיחה |
| משקל / מדידות | מסכי הזנה + גרפים | ניתוח מגמות ותובנות יזומות |

**ציון מוצר כולל היום: ~55-60%.** היעד: שכל מסך מותאם אישית ומשתנה לפי המשתמש.

### שלושת חוקי הברזל של AI-First
1. **אין מסך "מת"** — לכל מסך שכבת אלמוג שמסבירה/מתאימה.
2. **אין שדה טופס** שאי אפשר למלא גם בשיחה.
3. **כל נתון שנכנס** מזין את הזיכרון ומשנה את הצעד הבא.

---

## שלב 1 — Dashboard חי (הבסיס, מתחילים מכאן)

**למה ראשון:** ההשפעה הכי גדולה על תחושת "AI-First", והכי נמוך סיכון — כל התשתית כבר קיימת (`ai_context`, `almog-daily-context.ts`, RAG).

### משימות
- [ ] **כרטיס "מה קורה איתך עכשיו"** בראש הדשבורד — אלמוג קורא `ai_context` + התקדמות + מגמות ומנסח 2-3 משפטים אישיים. רענון יומי.
- [ ] **תובנות יזומות ליד גרפים** — שורת AI מתחת לכל גרף ("ירדת 3 ימים ברצף, בא נדבר על זה?").
- [ ] **CTA אדפטיבי** — הכפתור הראשי משתנה לפי המצב (נפילה → "בוא נחזור בעדינות"; רצף → "שמור על המומנטום").

### קבצים
- חדש: `apps/web/app/api/v1/ai/dashboard-brief/route.ts`
- חדש: `apps/web/lib/ai/dashboard-brief-llm.ts`
- עריכה: `apps/web/components/dashboard/*` (כרטיס AI + שורות תובנה)
- שימוש קיים: `lib/ai/almog-daily-context.ts`, `lib/ai/format-user-progress-for-ai.ts`, `lib/ai/memory.ts`

---

## שלב 2 — Onboarding שיחתי

**מטרה:** להחליף את טופס השדות בשיחה עם אלמוג.

### משימות
- [ ] אלמוג שואל בשפה חופשית ("ספר לי על המטרה שלך") ומחלץ שדות מובנים ברקע.
- [ ] מילוי הפרופיל אוטומטית מתוך השיחה.
- [ ] סיכום אישור בסוף ("הבנתי נכון? המטרה שלך X, המכשול Y").
- [ ] הזנה ישירה לזיכרון הווקטורי.

### קבצים
- חדש: `apps/web/app/api/v1/ai/onboarding-chat/route.ts`
- עריכה: `apps/web/components/onboarding/*`
- שימוש קיים: `lib/ai/extract-memory-facts.ts`, `lib/ai/ingest-onboarding-vector-memory.ts`, `lib/ai/onboarding-chat-context.ts`

---

## שלב 3 — מסע אדפטיבי (הלב של AI-First)

**מטרה:** המסלול משתנה לפי המשתמש, לא רצף קבוע לכולם.

### משימות
- [ ] **בחירת צעד דינמית** — אלמוג מחליט מה הצעד הבא לפי קצב, נפילות והרגלים.
- [ ] **תוכן שיעור מותאם** — אותו שיעור, ניסוח/דגשים שונים למתקשה לעומת מתקדם.
- [ ] **Quiz/Game דינמיים** — שאלות שנוצרות לפי המכשולים האישיים, לא תוכן קבוע.
- [ ] **Commitment חכם** — אלמוג מציע התחייבות ריאלית לפי ההיסטוריה ("אתה נופל בערבים — בוא נתחייב רק לבקרים").

### קבצים
- חדש: `apps/web/app/api/v1/ai/journey-next-step/route.ts`
- חדש: `apps/web/lib/ai/journey-adaptive-llm.ts`
- עריכה: `apps/web/components/journey/*` (QuizSection, MiniGame, CommitmentSection)
- שימוש קיים: `lib/ai/roller-coaster.ts`, `lib/ai/format-user-progress-for-ai.ts`, `lib/ai/almog-system-rag.ts`

---

## שלב 4 — הזנת נתונים שיחתית + תובנות

### משימות
- [ ] **משקל/מדידות** — להרחיב את הזיהוי הקיים בצ׳אט עם ניתוח מגמות יזום ("המשקל תקוע שבועיים — 3 דברים לבדוק").
- [ ] כל הזנה ידנית מקבלת חלופת "ספר לאלמוג".

### קבצים
- עריכה: `apps/web/lib/ai/chat-weight-intent.ts` (קיים)
- חדש: `apps/web/lib/ai/trend-insights-llm.ts`
- עריכה: מסכי מדידות/משקל ב-`components/*`

---

## שלב 5 — זיכרון ופרסונליזציה מלאה (Always-on)

### משימות
- [ ] **פרופיל נערך בשיחה** — "אלמוג, תשנה את שעת הקימה ל-7".
- [ ] **Memory Pyramid מורחב** — סיכומים שבועיים/חודשיים שמשפיעים על כל המסכים.
- [ ] **טון אישי גלובלי** — `almog-coaching-style.ts` חל על *כל* טקסט במוצר, לא רק התראות.

### קבצים
- עריכה: `apps/web/app/api/summaries/generate/route.ts` (קיים)
- עריכה: `apps/web/lib/ai/almog-coaching-style.ts` (קיים) — להפוך לשכבה גלובלית
- עריכה: `apps/web/lib/ai/memory.ts`

---

## שלב 6 — אדמין AI-First

### משימות
- [ ] הרחבת AI-fill ליצירת מסעות שלמים מ-prompt.
- [ ] "מצב סוכן" לאדמין: "צור מסע 30 יום על שינה" → אלמוג בונה את הכל (תחנות, שיעורים, quiz, commitments).

### קבצים
- עריכה: `apps/web/app/api/v1/admin/journey-steps/ai-fill/route.ts` (קיים)
- חדש: `apps/web/app/api/v1/admin/journey/ai-generate/route.ts`
- עריכה: `apps/web/components/admin/StepEditor.tsx` (קיים)

---

## סדר עבודה מומלץ
1. **שלב 1 (Dashboard)** — מתחילים מכאן. הכי גבוה ערך, הכי נמוך סיכון.
2. שלב 2 (Onboarding שיחתי).
3. שלב 3 (מסע אדפטיבי) — הליבה.
4. שלב 4 (הזנה שיחתית + תובנות).
5. שלב 5 (זיכרון גלובלי).
6. שלב 6 (אדמין סוכן).

---

## נקודות פתיחה למחר (אחרי pull)
- כל התשתית קיימת — לא צריך להקים שום דבר חדש בצד ה-AI/RAG/זיכרון.
- להתחיל מ-`apps/web/lib/ai/almog-daily-context.ts` + `format-user-progress-for-ai.ts` כדי לבנות את `dashboard-brief`.
- לזכור: לבדוק `apps/web/tests/` להוספת בדיקות לכל route חדש (יש כבר תבנית ב-`notification-smart.test.ts`).

---

*מסמך זה הוא תוכנית; כל שלב יפורק למשימות קוד קונקרטיות בזמן הביצוע.*
