# תוכנית פלטפורמה רב-מוצרית — NuraWell כמוצר הראשון

> מסמך תכנון בלבד. אין כאן שינוי קוד. ההעברה עצמה תתחיל רק אחרי שעבודת ההצפנה תסתיים.
> החלק הראשון כתוב בעברית פשוטה. בסוף יש נספח טכני באנגלית.

## בקצרה
- **המטרה:** כל שכבה כללית (אבטחה, הצפנה, יומנים, משפטי, עלויות, תשלומים, התראות, AI, כניסה, לוח בקרה ועיצוב) תהפוך ל"חבילה" עצמאית. מוצר חדש ירכיב את החבילות האלה, ויכתוב רק את מה שייחודי לו.
- **לוח בקרה אחד לכל המוצרים:** אתר ניהול מרכזי שמציג עלויות, יומנים, משימות משפטיות, תשלומים ואירועי אבטחה של כל המוצרים. הוא רואה רק סיכומים, ואף פעם לא מידע אישי של משתמשים.
- **הפרדה בין מוצרים:** לכל מוצר יש מסד נתונים נפרד ומפתח הצפנה נפרד. דליפה במוצר אחד לא חושפת את המוצרים האחרים.
- **עלות:** התוכנית לא עולה כסף היום. כל מה שעולה כסף מסומן ב-💰 ויחכה לאישור.

## 0. הדגם: ככה גוגל עושה את זה
לגוגל יש עשרות מוצרים (Gmail, YouTube, Drive), וכולם יושבים על שלושה דברים משותפים:
1. **חשבון אחד (Google Account):** נרשמים פעם אחת, ומאותו מקום מנהלים כניסה, אבטחה, פרטיות ותשלומים בכל המוצרים.
2. **פלטפורמות פנימיות משותפות:** הצפנה, יומנים, תשלומים, התראות ו-AI נבנים פעם אחת, וכל מוצר משתמש בהם.
3. **קונסולת ניהול אחת:** מקום אחד שבו רואים ומנהלים את כל המוצרים.

**אצלנו זה יהיה:**
- **"חשבון NuraWell" אחד:** כניסה אחת לכל המוצרים, עם מסך אחד לאבטחה, לפרטיות ולמנוי. לצורך ההפרדה, החשבון המרכזי מחזיק רק את מה שצריך לכניסה. המידע הבריאותי או הפיננסי של כל מוצר נשאר במוצר עצמו, ומוצפן במפתח שלו. זה מה שגוגל עושה בפנים: חשבון אחד, ומידע מבודד לפי שירות.
- **חבילות משותפות:** החבילות `@platform/*` שבסעיף 1.
- **לוח בקרה מרכזי:** סעיף 3.

**איפה אנחנו היום, בכנות:** מוצר אחד. כל השכבות בנויות בתוכו, וחלקן כבר כתובות כמעט כלליות. עוד אין חשבון משותף, אין חבילות ואין לוח מרכזי. הכניסה עצמה כבר ברמה גבוהה (אימות נוסף ומפתחות גיבוי), אבל היא שייכת ל-NuraWell בלבד. 💰 כניסה אחת לכמה מוצרים תדרוש מסד זהות מרכזי, כלומר פרויקט Supabase נוסף. בתוכנית החינמית אפשר עד 2 פרויקטים, ולכן זה יחכה למוצר השני.

## איפה כל מודול עומד היום
| מודול | מצב היום |
|---|---|
| כניסה, הרשמה וקליטה, אימות נוסף, מפתחות גיבוי | חלקית מודולרי. עובר מיילים של אלמוג/דולב |
| הצפנת שדות ו-KMS | חלקית מודולרי. הקידומת ורשימת השדות של NuraWell בפנים |
| יומנים ומחיקה אוטומטית | כמעט מודולרי |
| תגובה לאירועי אבטחה | חלקית מודולרי. קשור לגדעון. כתוב לפי שלב 0 |
| פרטיות: הסכמה, שמירה, מחיקה, מפת מידע, בקשות עיון | מובנה במוצר |
| משפטי ומשימות | חלקית מודולרי |
| עלויות | חלקית מודולרי. רשימת הספקים קבועה בקוד |
| תשלומים ומנויים | חלקית מודולרי. היכולות של NuraWell בפנים. כתוב לפי שלב 0 |
| התראות | מובנה במוצר. רוב הקוד הוא לוגיקה של אלמוג |
| אלמוג (מנוע סוכן) | מובנה במוצר |
| גדעון (סוכן ניהול ותפעול) | מובנה במוצר |
| נגישות | מובנה במוצר, אבל מרוכז בתיקייה אחת (`lib/a11y`) |
| עיצוב ומסגרת ניהול | מובנה במוצר |

## סדר ההוצאה: מהיסוד כלפי מעלה
1. **אבטחה:** כניסה, אימות נוסף, מפתחות גיבוי, הצפנת שדות ו-KMS, יומנים, תגובה לאירועים.
2. **פרטיות:** הסכמה, זמני שמירה, מחיקה, מפת מידע, בקשות עיון במידע.
3. **יכולות:** הרשמה וקליטה, תשלומים, התראות, עלויות, משפטי, AI, נגישות, עיצוב.

כל מודול ייבנה כך שאפשר "להדביק" אותו במוצר חדש: מתקינים את החבילה, ממלאים קובץ הגדרות אחד, וזה עובד.

## יכולות כמודולים לשימוש חוזר
- **נגישות (`@platform/a11y-widget`):** וידג'ט אחד שמתחבר לכל פרויקט, וכתוב כך שאפשר יהיה למכור אותו בנפרד בעתיד. הוא מוטמע בשורה אחת, עם הגדרות משלו (שפה, צבעים, אילו כלים מוצגים), בלי שום תלות ב-NuraWell, ועם "ווים" לרישוי ולהפעלת יכולות. **זה תכנון בלבד:** לא משנים כלום בהתנהגות הנגישות עד שתסביר את הדרישות.
- **אלמוג כמנוע סוכנים (`@platform/agent`):** המנוע מורכב מאישיות, זיכרון ותיק אישי, ניתוב בין מודלים, כלים ובטיחות. כל אלה מוגדרים לפי תחום. אותו מנוע יוכל להפעיל, למשל, יועץ השקעות: מחליפים את האישיות, את הידע, את הכלים ואת כללי הבטיחות, בלי לבנות מחדש.
- **גדעון כסוכן מנכ"ל ותפעול כללי:** אותו מנוע, עם הגדרה של "מנהל תפעול". הוא מחובר ללוח הבקרה המרכזי ומשרת את כל המוצרים.
- **הרשמה, קליטה וכניסה:** מודול אחד משותף. שלבי הקליטה מוגדרים לפי מוצר.
- **תשלומים, התראות, עלויות ומשפטי:** כמו בסעיף 1.

## 1. המבנה הרצוי
המאגר כבר בנוי כ-monorepo (Turborepo, ו-npm workspaces עם `apps/*` ו-`packages/*`), אבל תיקיית `packages/` עוד ריקה. כל הקוד יושב היום בתוך `apps/web`.

```
apps/
  nurawell/        ← המוצר הנוכחי (היום apps/web), רק מה שייחודי לו
  control-plane/   ← לוח הבקרה המרכזי (בעתיד)
  <מוצר-הבא>/
packages/
  config  crypto  security  auth  logs  compliance  privacy
  costs   billing  notifications  ai  admin-shell  ui  testing
```

| חבילה | מה היא עושה | מה המוצר מזין לה | מה נשאר במוצר |
|---|---|---|---|
| `@platform/config` | הגדרות של מוצר: מזהה, שם, דומיין, משתני סביבה מאומתים | קובץ `product.config.ts` | הערכים עצמם |
| `@platform/crypto` | הצפנת שדות במפתח אישי לכל משתמש, ומעטפת KMS | רשימת השדות המוצפנים, מפתח ה-KMS של המוצר | רשימת השדות של NuraWell (משקל, זיכרונות וכו') |
| `@platform/security` | זיהוי מכשירים, חסימות, נעילת חירום, אירועי אבטחה | ספי חסימה, ערוצי התראה | — |
| `@platform/auth` | כניסה, אימות נוסף, מפתחות גיבוי וקודי שחזור | שמות תפקידים, נתיבי חזרה | מיילי ברוכים הבאים של אלמוג/דולב |
| `@platform/logs` | יומנים, מדיניות שמירה, מחיקה לילית, ניטור מקום | טבלת זמני שמירה | סוגי יומנים מיוחדים למוצר |
| `@platform/compliance` | משימות משפטיות, ראיות הסכמה, חותמות זמן | רשימת משימות לפי מוצר | נוסחי ההסכמה של NuraWell |
| `@platform/privacy` | מחיקת חשבון, ייצוא מידע, בחירת זמן שמירה | "ממפה" שאומר אילו טבלאות שייכות למשתמש | רשימת הטבלאות |
| `@platform/costs` | יומן עלויות, קבלות, עלות למשתמש | רשימת ספקים | — |
| `@platform/billing` | מסלולים, מנויים, חיובים, ביטול מקוון | המסלולים והיכולות | שמות היכולות (למשל "צ'אט עם אלמוג") |
| `@platform/notifications` | שליחה, תזמון, ערוצים, מניעת הצפה | תבניות | כל הלוגיקה של אלמוג |
| `@platform/ai` | ניתוב בין מודלים, תקציב, ניקוי מידע מזהה, תשתית סוכנים | מודלים ותקציבים | האישיות, הידע וההנחיות של אלמוג וגדעון |
| `@platform/admin-shell` | מסגרת לוח הבקרה, ניווט, הרשאות, אימות לפעולות רגישות | רשימת מסכים | מסכי ניהול מיוחדים למוצר |
| `@platform/identity` | חשבון מרכזי וכניסה אחת לכל המוצרים (בעתיד) | רשימת מוצרים | — |
| `@platform/agent` | מנוע הסוכנים: אישיות, זיכרון, כלים, בטיחות | הגדרת התחום | אלמוג וגדעון כ"הגדרות" |
| `@platform/a11y-widget` | וידג'ט נגישות עצמאי, עם ווים לרישוי | הגדרות הווידג'ט | — |
| `@platform/ui` | מערכת העיצוב: צבעים, רכיבים, נגישות | ערכת צבעים של המוצר | — |

**כלל הברזל:** חבילה אף פעם לא מייבאת קוד מהמוצר. המוצר "מזריק" לחבילה את מה שהיא צריכה.

## 2. מידע של כמה מוצרים
**ההמלצה (הכי חזקה, ובחינם היום):**
- **מסד נפרד לכל מוצר.** המשתמשים, המידע הבריאותי וההצפנה של כל מוצר נשארים במסד שלו. ככה מוצר אחד לא יכול לדלוף מידע של מוצר אחר, גם אם תהיה בו תקלה בקוד.
- **מפתח הצפנה נפרד לכל מוצר.** לכל מוצר יש מפתח ראשי משלו ב-KMS, עם הרשאה נפרדת. מזהה המוצר נכנס גם ל"חתימה" של כל ערך מוצפן, כך שערך ממוצר אחד לא ייפתח במוצר אחר.
- **מסד ניהול מרכזי קטן**, שמכיל רק נתונים מסוכמים בלי שום פרט מזהה: עלויות, ספירות של אירועים, סטטוס משימות משפטיות, הכנסות ותקלות.
- בכל טבלה משותפת תהיה עמודת `product_id`, כבר מההתחלה.

**מה עולה כסף (💰, לא עכשיו):**
- בתוכנית החינמית של Supabase אפשר להחזיק 2 פרויקטים פעילים. מוצר שלישי ידרוש שדרוג (כ-25$ לחודש לארגון) או חשבון נוסף. **עד אז** אפשר להשתמש במסד ניהול מרכזי שיושב כסכמה נפרדת (`control`) בתוך המסד של NuraWell, עם הרשאות נפרדות. זה בחינם, אבל פחות מבודד, ולכן מתאים רק לשלב הביניים.
- KMS: כ-0.06$ לחודש לכל מפתח נוסף. זניח, אבל מסומן.
- דומיין לאתר הניהול: אפשר להשתמש בכתובת החינמית של Vercel.

**לא מומלץ:** מסד משותף לכל המוצרים עם `product_id` בכל טבלה. זה זול יותר, אבל טעות אחת בהרשאות תחשוף מידע בין מוצרים.

## 3. לוח הבקרה המרכזי
- כל מוצר **שולח** ללוח הבקרה סיכומים בלבד (בכיוון אחד), כל 15 דקות ובזמן אירוע. הלוח לא מקבל גישה למסד של המוצר.
- כל מוצר חותם על מה שהוא שולח, כך שאף אחד לא יכול לזייף נתונים.
- הלוח רואה מספרים, סטטוסים ומזהים אקראיים, ואף פעם לא שמות, טלפונים או תוכן שיחות.
- **"לרדת לפרטים":** לחיצה על אירוע מעבירה אותך ללוח הניהול של המוצר עצמו, עם אימות נוסף. רק שם רואים פרטים, וכל צפייה נרשמת.
- **פעולות חירום** (נעילה, ניתוק): הלוח שולח בקשה חתומה, והמוצר מבצע אותה רק אחרי אימות נוסף שלך.
- תמיכה (support) תתחבר לאותו מבנה בעתיד. לא בונים אותה עכשיו.

## 4. איפה הקוד מעורבב היום (מהקל לקשה)
| # | איפה | הבעיה | מאמץ | סיכון |
|---|---|---|---|---|
| 1 | `lib/security/field-envelope.ts` | הקידומת `nurawell:` קבועה בקוד בתוך הצפנת השדות | קטן | **גבוה**: נוגע בהצפנה. חייבים לשמור על תאימות למידע הקיים |
| 2 | `lib/security/field-registry.ts`, `lib/crypto/pii-fields.ts` | המנגנון הכללי ורשימת השדות של NuraWell (משקל, אלמוג, שיעורים) באותו קובץ | בינוני | בינוני |
| 3 | `lib/crypto/pii-seal.ts` | זיהוי "מידע בריאותי" כתוב בתוך שכבת ההצפנה הכללית | קטן | בינוני |
| 4 | `lib/billing/tiers.ts`, `gate.ts`, `retention-job.ts` | יכולות של אלמוג ושל "תחנות במסע" כתובות בתוך התשלומים | קטן | נמוך (עוד לא באוויר) |
| 5 | `lib/admin/cost-*` | יומן העלויות כללי, אבל רשימת הספקים קבועה בקוד | קטן | נמוך |
| 6 | `lib/logs/*`, `lib/logging/*` | כמעט כללי. רק זמני השמירה וסוגי היומנים קבועים בקוד | קטן | נמוך |
| 7 | `lib/ops/*` | מכשירים ואירועי אבטחה כלליים, אבל ההתראות קשורות לגדעון | בינוני | בינוני |
| 8 | `lib/auth/*` | אימות נוסף ומפתחות גיבוי מעורבבים עם מיילים של אלמוג/דולב | בינוני | **גבוה**: נוגע בכניסה |
| 9 | `lib/privacy/delete-user-account.ts` | מחיקת חשבון מכירה ישירות את הטבלאות של NuraWell | בינוני | **גבוה**: מחיקת מידע |
| 10 | `lib/legal/*` (50 קבצים) | ראיות וחותמות זמן כלליות, מעורבבות עם נוסחים של NuraWell ועם AI | גדול | בינוני |
| 11 | `lib/notifications/*` (32 קבצים) | רוב הקוד הוא לוגיקה של אלמוג. רק ערוצי השליחה והתזמון כלליים | גדול | בינוני |
| 12 | `lib/ai/*` | הנתב והתקציב מעורבבים עם האישיות של אלמוג | גדול | בינוני |
| 13 | `components/`, ערכת עיצוב | רכיבים כלליים לצד רכיבים של המוצר | גדול | נמוך |
| 14 | מיגרציות `supabase/` | אין `product_id`, וטבלאות כלליות וטבלאות מוצר באותה סכמה | בינוני | גבוה |

## 5. שלבי ההעברה (כל שלב הוא PR קטן עם בדיקות מקצה לקצה, בלי לשבור את האתר)
- **שלב 0 (עכשיו, כלל):** כל קוד **חדש** נכתב כמודול כללי, שמקבל הגדרות מבחוץ ולא מייבא קוד של המוצר. כך כבר נכתבים התשלומים, תגובה לאירועי אבטחה ומפתחות הגיבוי.
- **— מחכים לסיום ההצפנה —**
- **שלב 1 (S):** יוצרים `packages/config` ו-`packages/testing`, ומפעילים את בדיקת התלויות במצב אזהרה.
- **שלב 2 (S):** `logs`. זה יסוד האבטחה, והוא הכי פחות מסוכן.
- **שלב 3 (M, זהירות גבוהה):** `crypto`. הקידומת `nurawell:` נשארת כברירת המחדל של NuraWell, כדי שכל המידע הקיים ימשיך להיפתח. מוצרים חדשים יקבלו קידומת משלהם. בודקים שכל ערך קיים נפתח לפני ואחרי.
- **שלב 4 (M, זהירות גבוהה):** `security` ו-`auth`, כולל אימות נוסף, מפתחות גיבוי, תגובה לאירועים, הרשמה וקליטה.
- **שלב 5 (M):** `privacy`: הסכמה, זמני שמירה, מחיקה, מפת מידע ובקשות עיון, עם "ממפה" שהמוצר מספק.
- **שלב 6 (M):** `billing`, `costs` ו-`compliance`.
- **שלב 7 (L):** `notifications` ו-`agent`: אלמוג וגדעון הופכים ל"הגדרות" של המנוע. `a11y-widget` עובר כמו שהוא, בלי שינוי התנהגות. בדיקת התלויות עוברת ממצב אזהרה לחסימה.
- **שלב 8 (L):** `ui` ו-`admin-shell`, ושינוי שם `apps/web` ל-`apps/nurawell`.
- **שלב 9 (M):** `identity`: חשבון מרכזי (💰 כשיגיע מוצר שני). לוח בקרה מרכזי במצב קריאה בלבד, שמקבל סיכומים מ-NuraWell.
- **שלב 10 (S):** "מוצר ריק" לדוגמה, שמוכיח שאפשר להקים מוצר חדש מהחבילות בפחות מיום.

גודל משוער: S = יום, M = 2–3 ימים, L = שבוע. בסך הכול כ-5–6 שבועות עבודה, בחלקים קטנים.

## 6. שמירה על הסדר
- נוסף קובץ `.dependency-cruiser.cjs` במצב **אזהרה בלבד**. הוא לא מחובר לבדיקות האוטומטיות ולא מכשיל שום דבר. הוא בודק:
  - שחבילות לא מייבאות קוד של המוצר;
  - ששכבות כלליות (אבטחה, הצפנה, יומנים, תשלומים) לא מייבאות את אלמוג, את המסע או את הקורס;
  - שאין תלויות מעגליות.
- בשלב 7 האזהרות יהפכו לחסימה, אחרי שהקוד יהיה נקי.

---

## Appendix A — Technical (English)

**Current state.** Turborepo + npm workspaces (`apps/*`, `packages/*`); only `apps/web` exists. `db:generate` targets the non-existent `packages/shared`. All generic layers are under `apps/web/lib/*`, imported via the `@/` alias.

**Package contract pattern.** Each package exports a factory taking injected deps, never reading `process.env` or importing `@/`:
```ts
export function createFieldCrypto(cfg: {
  productId: string;              // AAD/scope prefix; NuraWell = 'nurawell' (frozen, back-compat)
  kms: KmsAdapter;                // per-product KEK (GCP KMS today)
  db: ServiceRoleDb;              // user_data_keys access
  registry: FieldRegistry;        // product-supplied table/column map
}): FieldCrypto
```
Same for `createLogs({ retention, db })`, `createBilling({ plans, features, provider })`, `createCostLedger({ vendors, fx })`, `createPrivacy({ userDataMap })`, `createStepUp({ rpId, roles })`, `createNotifier({ channels, rateLimits })`, `createAiRouter({ models, budgets, redactor })`.

**Crypto back-compat (critical).** `dekScope` = `nurawell:dek:user:<id>` and `fieldAad` = `nurawell:field:<t>:<c>:<row>` are bound into existing ciphertexts. The prefix must become `cfg.productId` with NuraWell fixed to `'nurawell'`; never rewrite. Phase 4 gate: decrypt-all-rows dry run on prod (read-only) before and after deploy, with zero failures.

**Data model.** One Supabase project per product (user data, `user_data_keys`, per-product KEK `projects/<kms>/keyRings/<product>/cryptoKeys/<product>-kek`, separate service accounts). Control-plane DB holds aggregates only: `products`, `cost_entries(product_id…)`, `incident_summaries`, `compliance_task_status`, `billing_mrr_daily`, `log_volume_daily`; no PII, user ids replaced by HMAC(product_secret, user_id). Interim (free tier limit is 2 active projects): `control` schema in the NuraWell DB, with a dedicated role that has no grants on `public`. 💰 Supabase Pro (~$25/org/mo) is needed when product #3 needs its own project. KMS key ≈ $0.06/mo per active version.

**Control plane.** Push model: product cron → signed (Ed25519, per-product key) JSON → control-plane ingest endpoint, idempotent by `(product_id, kind, period)`. Drill-down = deep link into the product admin with step-up. Commands (lockdown, revoke) = signed command → product verifies signature + owner step-up + audit. The control plane holds no product DB credentials.

**Coupling hot spots (grep evidence).** `security/field-envelope.ts:34-35` (hardcoded prefix); `security/field-registry.ts` (NuraWell tables: almog_*, lesson_progress, weight); `crypto/pii-seal.ts:55` (health heuristic); `billing/tiers.ts` (almog_unlimited_chat, journey features), `billing/gate.ts` (lesson steps), `billing/retention-job.ts`, `privacy/delete-user-account.ts`, `crypto/backfill-derived.ts`, `legal/media/ai.ts` import product domains; `auth/send-welcome-{almog,dolev}-email.ts`; `notifications/` 26/32 files mention Almog; `kms-envelope.ts` reads `process.env` directly (8 refs).

**Identity (Google-Account model).** Central IdP project holds auth.users + MFA/WebAuthn only; products trust it via OIDC (Supabase third-party auth / JWT), map to a per-product pairwise subject id. Deferred until product #2 (💰 3rd project).

**Agent engine.** `createAgent({ persona, memorySchema, tools, safetyPolicy, router, redactor })`; Almog/Gideon become config packages in apps. **A11y widget:** framework-agnostic web component + React wrapper, `init({ locale, theme, features, licenseKey?, flags })`, zero app imports; behavior frozen until requirements are given.

**Order:** logs → crypto → security/auth/IR/onboarding → privacy → billing/costs/compliance → notifications/agent/a11y → ui/admin-shell → control plane/identity.

**Guardrails.** `.dependency-cruiser.cjs` (warn-only, not in CI). Phase 7: add `npm run depcruise` to CI with `severity: 'error'`, plus an ESLint `no-restricted-imports` ban on `@/` inside `packages/**`.

**Per-phase e2e gate.** Existing vitest + Playwright signed-in-mobile suite green; for crypto/auth/privacy phases, also the decrypt dry-run, step-up flow, and delete-account against the test account.
