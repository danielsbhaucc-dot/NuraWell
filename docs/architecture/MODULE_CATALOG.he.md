# קטלוג מודולים ותוכנית מעבר — מוצרי SaaS רבים על אותם רכיבים

> נבנה על `feat/modular-platform-phase1` (#372). מסמך ניתוח ותוכנית בלבד: אין שינוי ב-prod ואין הרצות AI.
> סדר עדיפויות קבוע: **אבטחה → פרטיות → פיצ'רים**. **אסור שאיכות אלמוג תיפגע.**

## 0. החזון
כמה מוצרים, לכל אחד עיצוב משלו (שמעוצב יחד עם דניאל), על אותם רכיבים, ומחליפים רק הגדרות:
- רישום שמתחבר למסד אחר
- ליווי שבו רק הנושא מתחלף
- מערכת קורסים מוכנה
- רכיב נגישות שבו רק העיצוב משתנה

## 1. מיפוי הקוד הקיים למודולים
מקרא: **צימוד**: נמוך/בינוני/גבוה. **מאמץ**: S עד שבוע, M 1–3 שבועות, L יותר.

| מודול | איפה היום | צימוד | הגדרות לכל מוצר | מאמץ |
|---|---|---|---|---|
| **רישום/כניסה** | `apps/web/lib/auth` (15 קבצים), `app/(auth)`, `app/auth`, `lib/onboarding`; חבילה `@platform/auth` (#372) | בינוני: לקוח Supabase אחד, הפניות קשיחות, טקסטים בעברית בקוד | פרויקט מסד (URL + מפתח anon), כתובות הפניה, ספקי כניסה, טקסטים, ערכת עיצוב, שדות קליטה | **M** |
| **מנוע ליווי (אלמוג)** | `lib/ai` (220 קבצים, ~35K שורות), `lib/almog`, `lib/notifications` | **גבוה**: שם, קול ותחום (משקל/הרגלים) פזורים בפרומפטים ובכוונות | נושא, פרסונה (שם, קול, אווטאר), כללי בטיחות לתחום, כוונות תחום, מודלים | **L** (בשלבים) |
| **התראות/תזכורות** | `lib/notifications` (32), `lib/push`, `notifications/jobs` | בינוני-גבוה: בדיקות איכות וטקסטים בנויים סביב אלמוג | ערוצים, שעות שקטות, שם השולח, תבניות, מפתחות push | **M** |
| **תשלומים/מחירים** | `packages/billing` (`@saas/billing`), `lib/billing`, `app/pricing`, `(dashboard)/upgrade` | נמוך-בינוני: כבר חבילה | מסלולים ומחירים, מטבע, מע"מ, חשבון סליקה (עוד לא נבחר) | **M** |
| **רכיב נגישות** | `components/a11y` (5), `lib/a11y` (9) | נמוך: מבודד, אבל הצבעים קשיחים | **ערכת עיצוב בלבד**, טקסטים וקישור להצהרת נגישות | **S** |
| **ניהול/הרשאות** | `@platform/iam`, `@platform/access`, `lib/admin`, `lib/ops`, `app/ops` | בינוני: כבר לפי `product_id` | רשימת אדמינים, תפקידים, דגלים לכל מוצר | **S–M** |
| **משפטי/הסכמות** | `lib/legal` (50), `lib/privacy` (16), עמודי privacy/terms/cookies/accessibility | בינוני: טקסטים ושם הישות בקוד | ישות משפטית, DPO, גרסאות מסמכים, סוגי הסכמה (מידע רפואי כן/לא) | **M** |
| **הצפנה** | `lib/crypto`, `lib/security`, `lib/secure-vault` (#368, #374) | בינוני | `key_purpose` לכל מוצר (כבר ב-registry), רשימת עמודות מוצפנות | **M** (אחרי #368/#374) |
| **עלויות AI** | `@platform/ai-engine` (cost sink), `lib/ai/usage-meter.ts`, `insert-ai-interaction.ts`, `routing-v3.ts` | בינוני | `product_id`, מודלים ונתב, תקציב התראה (בלי תקרה קשיחה) | **S** |
| **מערכת עיצוב** | `@platform/ui` (tokens), `app/globals.css`, `components/ui`, `DESIGN_SYSTEM.md` | בינוני: הצבעים כפולים ב-CSS וב-TS | ערכת עיצוב מלאה (ראו סעיף 3) | **M** |
| **קורסים/מדריכים** | טבלאות `courses`, `lessons`, `lesson_progress`, `guide_access_grants`; `components/course` (18), `(dashboard)/guides`, `lessons`, `lib/journey` | גבוה: מעורבב עם המסע, אלמוג, משימות ומעקב משקל | ראו סעיף 2 | **L** |

### 1.1 אלמוג: מה כללי ומה תלוי נושא
**כללי, עובר למנוע כמו שהוא:**
- ספק, נתב ומטמון: `client.ts`, `provider-factory.ts`, `routing-v3.ts`, `context-budget-v2.ts`, `split-system-messages.ts`
- זיכרון: `chat-memory/*`, `memory-*`, `user-memories`, `memory-consolidation`, `memory-dossier`, `memory-recall`, `vector-memory-ingest.ts`
- סיכומים: סשן, יום, שבוע וחודש
- בקרת איכות ותיקון עצמי: `reply-quality`, `@platform/qc`
- זיהוי שינויים ודפוסים: `chat-signals.ts`, `roller-coaster.ts`, `momentum-psychology.ts`
- התאמת שפה: `writer-stance-memory.ts`, `almog-register.ts`, `hebrew-output-rules.ts`
- מסנן פרטיות: `privacy`, `onboarding-sensitive-leak.ts`

**תלוי נושא (הופך ל"חבילת נושא"):**
- `prompts.ts` ו-`prompts-v2.ts`: פרסונה, תחום ודוגמאות
- `chat-weight-intent.ts`, `chat-habit-intent.ts`, `micro-win-habit.ts`, `habit-checkpoint-llm.ts`
- `journey-*`, `orchestrator/*`: תוכנית ומשימות התחום
- `safety`/`guardian`: כללי סיכון ייחודיים לתחום (אכילה, משקל)
- `almog-avatar.ts`, `almog-voice.ts`, `almog-greeting.ts`, `almog-coaching-style.ts`
- `system-knowledge-*`: ידע התחום

**עקרון:** המנוע מקבל `CoachingTopicPack` (פרסונה, קטעי פרומפט, כוונות, כללי בטיחות, ידע). NuraWell מקבל pack שמחזיר **בדיוק** את הטקסטים של היום.

## 2. מודולים חסרים
1. **מערכת קורסים כללית (LMS):** יש בסיס (`courses`, `lessons`, `lesson_progress`, נגן, PDF, שקופיות), אבל הוא קשור למסע, לאלמוג ולמעקב משקל. חסרים:
   - מודל כללי: קורס → פרקים → שיעורים → תרגילים
   - בחנים ותעודות
   - הרשמה לפי מוצר והרשאות גישה (הכללה של `guide_access_grants`)
   - עורך תוכן ב-Ops
   - התקדמות שלא תלויה במשימות
   **מאמץ:** L, בשני שלבים: קודם חילוץ לקריאה בלבד, ואז הרחבה.
2. **תבניות מייל לכל מוצר:** שולח, לוגו וצבעים.
3. **הגדרות מוצר בזמן ריצה:** טעינת המניפסט לפי דומיין.
4. **ערכת עיצוב לכל מוצר:** היום יש פלטה אחת בלבד.
5. **אנליטיקה לכל מוצר:** משפך והחזקה, בלי פרטים מזהים.
6. **מסמכים משפטיים בתבנית:** מדיניות פרטיות ותנאים שממולאים מהמניפסט, ונבדקים משפטית לכל מוצר.

## 3. עיצוב לכל מוצר (`@platform/ui`)
- **`ProductTheme`**:
  - `palette`: סולם primary/accent/ink בגוונים 50–950
  - `surfaces`: רקע, כרטיס, זכוכית, ו-Ops
  - `fonts`: כותרת וגוף, עם פונטים עבריים ברישיון שמאפשר שימוש מסחרי
  - `radius`, `shadow`, `motion`
  - `logo`
- **`defineTheme(theme)`**: מאמת חוקים בזמן build ובבדיקה, ונכשל אם מופר חוק:
  - אין `#fff`/`#ffffff`/`white` ברקעים או במשטחים (בהרחבה של `isPureWhite` הקיימת)
  - אין גרדיאנט צהוב→ירוק: בדיקת גוון של זוגות `gradient` (hue 45–70 → 90–160)
  - אין משטח שטוח בקרם/מנטה: משטח בגוון קרם/מנטה בהיר חייב עומק (גרדיאנט, זכוכית או טקסטורה), ולא צבע אחיד
  - ניגודיות AA לטקסט ולכפתורים
- **`tokensCss(theme)`**: מייצר את אותם `--color-*`, כך שהקומפוננטות לא משתנות, ורק המשתנים מתחלפים.
- **`nurawellTheme`**: הערכים של היום, אחד לאחד. בדיקת snapshot מוודאת שה-CSS שנוצר זהה ל-`globals.css`.
- **קבוע בכל ערכה:** `dir="rtl"`, mobile-first, אותם רכיבים (קווי ההפרדה במובייל לא משתנים).
- **רכיב הנגישות** מקבל `theme` ומשתמש רק במשתני CSS. **ההתנהגות לא נוגעת**, ונבדקת בבדיקות התנהגות קיימות ובצילומי מסך.
- **הערה:** ערכה חדשה מעוצבת יחד עם דניאל, ונבדקת מול המוצר הקנוני ודף הנחיתה.

## 4. חוזה המוצר (Product Manifest)
```ts
// packages/@platform/product/src/manifest.ts
export interface ProductManifest {
  id: string;                 // 'nurawell' — תואם platform_product_registry.id
  displayName: string;        // שם מוצר בעברית
  domains: string[];          // לטעינה לפי host
  locale: 'he' | 'en';  dir: 'rtl' | 'ltr';
  theme: ProductTheme;        // @platform/ui
  db: { urlEnv: string; anonKeyEnv: string; serviceKeyEnv: string }; // שמות משתנים בלבד, אף פעם לא סודות
  encryption: { keyPurpose: string };          // field:<id>
  modules: {
    auth: { providers: ('email'|'google')[]; onboarding?: string };
    coaching?: { topicPack: string; persona: { name: string; avatar: string } };
    courses?: { enabled: boolean };
    notifications?: { channels: ('push'|'email')[]; quietHours: [string,string] };
    billing?: { plans: string };
    a11y: { enabled: true };   // תמיד פעיל, רק עיצוב משתנה
    legal: { entity: string; healthData: boolean };
  };
  copy: Record<string, string>; // טקסטים מערכתיים
}
```
- המניפסט נשמר בקוד, ב-`products/<id>/manifest.ts`, ועובר review.
- `platform_product_registry` מקבל עמודות `manifest_version`, `modules jsonb`, `theme_id` (מיגרציה חדשה; בלי סודות). סקריפט CI מסנכרן ובודק התאמה בין הקוד ל-registry.
- `/ops/products` מציג לכל מוצר: מודולים פעילים, דוגמית צבעים, נושא הליווי, גרסת המניפסט, סטטוס סנכרון, ואת המדדים הקיימים.
- **פרויקט מסד נפרד לכל מוצר:** ברירת המחדל היא מסד משותף עם `product_id` ו-RLS (שלב 5 ב-MODULAR_PLATFORM). פרויקט נפרד דורש החלטה של דניאל, כי בלי Supabase Pro יש מגבלת פרויקטים חינמיים.

## 5. אילוץ קשיח: אלמוג לא משתנה
- **רק refactor ששומר התנהגות.** לפני כל הזזה:
  1. **בדיקות זהב:** מקליטים את הפרומפט המלא (system, הודעות, כלים ופרמטרי מודל) שהקוד הקיים בונה לכ-30 תרחישים קבועים: קליטה, צ'אט רגיל, SOS, התראה, סיכומים יומי, שבועי וחודשי, ו-QC. ההקלטה דטרמיניסטית: שעון קבוע, ספק בדיקה, בלי קריאות AI.
  2. אחרי ההזזה, הבדיקה משווה **byte-for-byte**. כל הבדל מכשיל את ה-CI.
  3. **פלט:** בונים מחדש פלט של מודל מוקלט (fixtures), ובודקים שה-parse, ה-sanitize וה-QC נותנים תוצאה זהה.
  4. גם הניתוב (Luna/Terra) ומבנה המטמון (cache_control) נבדקים כחלק מהבקשה.
- אין שינוי במודלים, בפרמטרים או בטקסט. אין השוואות מודלים חדשות. אין עלות AI.
- **נגישות:** רק משתני צבע ופונט. אין שינוי ב-DOM, בקיצורים, ב-ARIA או בשמירת העדפות. בדיקת DOM snapshot לפני ואחרי.

## 6. מפת דרכים
| שלב | תוכן | תלות |
|---|---|---|
| **2a (PR ראשון)** | `ProductTheme` + `defineTheme` + `nurawellTheme` זהה + בדיקות חוקי עיצוב + חיבור רכיב הנגישות למשתני CSS בלבד | #372 |
| 2b | חבילת `@platform/product`: מניפסט, `nurawell` manifest, `sample` manifest, מיגרציה ל-registry + תצוגה ב-/ops/products | 2a |
| 3 | רתמת בדיקות זהב לאלמוג (בלי להזיז קוד) | #369–#371 ממוזגים |
| 4 | הזזת השכבה הכללית של אלמוג ל-`@platform/coaching` (ספק, נתב, מטמון, זיכרון, סיכומים, QC), ייבוא חוזר מ-apps/web, בדיקות זהב ירוקות | 3 |
| 5 | `CoachingTopicPack`: חילוץ פרסונה ופרומפטים של NuraWell ל-pack, זהה byte-for-byte; pack דוגמה במוצר הדוגמה (ספק בדיקה) | 4 |
| 6 | הצפנה לפי `key_purpose` לכל מוצר | #368, #374 |
| 7 | רישום/כניסה מוגדרים לפי מניפסט (מסד, הפניות, טקסטים, עיצוב) | 2b |
| 8 | התראות לפי מוצר (שולח, תבניות, ערוצים) | 4, 7 |
| 9 | LMS: חילוץ courses/lessons ל-`@platform/courses` (קריאה + התקדמות), ואז בחנים, תעודות ועורך ב-Ops | 2b |
| 10 | משפטי/הסכמות בתבנית + תשלומים לפי מוצר | בחירת סולק, החלטת DPO |
| 11 | אכיפת `product_id` + RLS + בדיקות הפרדה בין מוצרים | 6 |
| 12 | מוצר אמיתי שני: עיצוב עם דניאל, ואז מניפסט | כל הקודם |

### ה-PR הראשון המומלץ: `feat(ui): per-product themes (phase 2a)`
- **ב-`packages/@platform/ui`:**
  - `theme.ts`: טיפוס `ProductTheme`, `defineTheme`, `validateTheme`, `tokensCss(theme)`
  - `themes/nurawell.ts`: הערכים הקיימים
  - `themes/sample.ts`: פלטה שונה לדוגמה, למשל כחול-סגול עמוק, וממתינה לאישור דניאל
- **בדיקות:**
  - snapshot שמוכיח שה-CSS של NuraWell זהה לערכים ב-`globals.css`
  - חוקים שנכשלים על לבן, על גרדיאנט צהוב→ירוק ועל קרם/מנטה שטוח
  - ניגודיות AA
- **רכיב הנגישות:** החלפת hex קשיחים במשתני CSS בלבד, עם בדיקת DOM snapshot זהה ובדיקת צילום מסך זהה ב-NuraWell.
- `apps/sample-product` משתמש ב-`themes/sample`.
- **בלי שינוי נראה ב-NuraWell:** אפס הבדל בצילומי המסך.
- **בלי מיגרציה ובלי AI.** דיפלוי אחד.

## 7. סיכונים
- **שרשרת PR-ים לא ממוזגת** (#353→#362→#372): המסמך הזה ממתין להם.
- **קוד אלמוג גדול (~35K שורות):** הזזה בלי רתמת זהב מסוכנת, ולכן שלב 3 בא לפני כל הזזה.
- **"מסד אחר" לכל מוצר:** עולה כסף או נתקל במגבלות. ממתין להחלטה של דניאל עם מחיר.
- **תוכן הקורסים קשור היום למסע:** החילוץ עלול לגעת בחוויית המדריכים, ולכן קודם קריאה בלבד ובדיקות.
