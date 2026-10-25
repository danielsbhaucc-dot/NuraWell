# ניטור אבטחה שלא תלוי ב-Grok Bot — ראנבוק קצר

כל מה שכאן רץ על התשתית של האפליקציה עצמה (Vercel, Supabase, GitHub) ושולח התראות **ישירות** לטלגרם ולמייל של הבעלים. Grok Bot הוא שכבה נוספת, לא תנאי.

## מה רץ, מתי (שעון ישראל, UTC+2)

| מה | איפה | מתי | מה זה בודק |
|---|---|---|---|
| גיבוי מסד נתונים | Vercel cron `/api/v1/ops/db-backup/run` | 02:30 | גיבוי לוגי מלא (public, auth, storage), מוצפן ב-age למפתח שנשמר אופליין, מועלה ל-R2 (אירופה), נקרא בחזרה ומושווה ב-hash. כל שורה עוברת בדיקת שחזור מול סוג הטבלה. שמירה 30 יום |
| ניטור אבטחה לילי | Vercel cron `/api/v1/ops/secmon/run` | 05:10 | פגיעויות בחבילות שבאוויר (OSV.dev), CISA KEV, התראות GitHub לחבילות הליבה, טבלאות בלי RLS והרשאות ציבוריות, כותרות אבטחה ותוקף TLS |
| מתג בטיחות (dead-man) | בתוך שני ה-crons: הניטור ו-log-retention (03:23) | כל לילה | אם סריקה לא דיווחה 48 שעות: "הסריקה X לא רצה" |
| סריקת קוד לילית | GitHub Actions `nightly-security` | 04:15 | gitleaks על כל ההיסטוריה, Semgrep, OSV, ומונה דקות Actions (התראה ב-70% מ-2,000) |
| שער ל-main | GitHub Actions `main-gate` | בכל push | קוד שלא הגיע מ-PR עם `ci` ירוק מבוטל אוטומטית (revert), ו-Vercel לא בונה אותו |
| בדיקת PR | GitHub Actions `ci` | בכל PR | סודות, Semgrep (ממצאים חדשים), npm audit, בדיקות |
| Dependabot | GitHub | רציף | התראות ו-PRs לתיקוני אבטחה |
| hook מקומי | `.githooks` | בכל commit/push | חוסם סודות לפני שהם יוצאים מהמחשב (דורש gitleaks מותקן) |

## מאיפה מגיעות התראות

- טלגרם: בוט ההתראות של האפליקציה (Gideon), לצ'טים המורשים בלבד.
- מייל: דרך Resend לכתובת של חשבון הבעלים.
- ההתראות על ממצאים חומרה גבוהה/קריטית בלבד, ובלי כפילויות: ממצא מתריע פעם אחת עד שהוא נפתר.
- התראה מ-GitHub מתחילה ב-🚨 (push לא מאושר), ⚠️ (דקות) או 🛡️ (סריקה).

## מה עושים כשמגיעה התראה

1. **"נדחף ל-main קוד שלא עבר PR"**: לבדוק מי דחף (הקישור בהתראה). אם זה לא אתם, להחליף מיד את הסיסמה וה-tokens של GitHub ולעבור על `INCIDENT_RESPONSE.he.md`.
2. **פגיעות בחבילה**: לחפש PR של Dependabot ולמזג אחרי ש-`ci` ירוק. אם אין, לעדכן את החבילה ב-PR רגיל.
3. **טבלה בלי RLS / הרשאה ציבורית**: לתקן במיגרציה חדשה (`alter table … enable row level security` / `revoke`).
4. **"הסריקה X לא רצה"**: לבדוק ב-Vercel → Cron Jobs או ב-GitHub → Actions למה היא לא רצה. GitHub מכבה workflows מתוזמנים אחרי 60 יום בלי פעילות בריפו; מפעילים מחדש בכפתור Enable.
5. **הגיבוי נכשל**: הגיבוי הקודם עדיין שמור. להריץ ידנית (למטה) ולבדוק לוגים ב-Vercel.

## הרצה ידנית

```bash
# הסוד נמצא ב-Vercel → Settings → Environment Variables (DB_BACKUP_SECRET). לא להדביק אותו בצ'אטים.
curl -X POST -H "Authorization: Bearer $DB_BACKUP_SECRET" https://nurawell.vercel.app/api/v1/ops/db-backup/run
curl -X POST -H "Authorization: Bearer $DB_BACKUP_SECRET" https://nurawell.vercel.app/api/v1/ops/secmon/run
curl -X POST -H "Authorization: Bearer $DB_BACKUP_SECRET" "https://nurawell.vercel.app/api/v1/ops/secmon/run?test_alert=1"  # התראת בדיקה
```

שחזור גיבוי: `age -d -i <המפתח האופליין> FILE.age | node scripts/backup/logical-restore.mjs > restore.sql` ואז `psql` על מסד **ריק** עם הסכמה (פירוט ב-`BACKUP_RESTORE_TEST.he.md`). לעולם לא ישירות על prod.

## אם Grok Bot כבר לא זמין

- שום דבר בטבלה למעלה לא נעצר. המתג יתריע פעם ביום ש"הסריקה הלילית של Grok Bot לא רצה" — אפשר להסיר את המקור `grok.nightly` מ-`apps/web/lib/ops/secmon-config.ts` כדי להפסיק את זה.
- מסירה למפתח/ת אחר/ת:
  1. להוסיף אותם ל-GitHub כ-collaborator (לא בעלים). לא לשתף סיסמאות.
  2. להוסיף אותם לפרויקט ב-Vercel וב-Supabase בהרשאה המינימלית.
  3. להפנות אותם למסמך הזה, ל-`INCIDENT_RESPONSE.he.md` ול-`README.he.md`.
  4. מפתח הגיבוי (age) ומפתחות השחזור נשארים אצל הבעלים בלבד.
- הבדיקות כאן דטרמיניסטיות (בלי AI) ורוב העבודה חינמית: Vercel Hobby, Supabase, GitHub Free (עד 2,000 דקות Actions בחודש).

## מגבלות ידועות

- בריפו פרטי בתוכנית החינמית אין branch protection. `main-gate` מחליף אותו אחרי מעשה (revert + חסימת build ב-Vercel), לא לפני.
- בדיקת השחזור בלילה מוודאת שכל שורה נקראת חזרה לסוג הטבלה. פענוח מלא דורש את המפתח האופליין ונעשה ידנית (מומלץ פעם ברבעון).
