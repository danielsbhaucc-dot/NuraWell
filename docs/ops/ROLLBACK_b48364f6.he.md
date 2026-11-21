# חזרה לגרסה `b48364f6` (פריסה `dpl_JCmRRr69iwAoDu85TcogszfFie2V`)

נכתב ב־21 בנובמבר 2026, שעון ישראל. המסמך מתאר איך מחזירים את NuraWell בייצור לגרסה של PR ‏#498, ומה בודקים אחרי זה.

## נקודת היעד

| שדה | ערך |
|---|---|
| פריסה | `dpl_JCmRRr69iwAoDu85TcogszfFie2V` |
| קומיט | `b48364f6a592f1d0b7f86fb3fb842ceaead79df9` (‏#498: «המנוי שלי», `/pricing` מקושר לרכישה בחשבון האם, ניסיון כבוי) |
| נוצרה | 20.11, 19:59. מוכנה ב־20:04 שעון ישראל |
| כתובת קבועה | `nurawell-gbs3n3gaz-danielsbhaucc-2308s-projects.vercel.app` |
| פרויקט | `nurawell` (`prj_qVOo079U9GJB7O9o9cg0V7MUSqoc`), אזור `fra1` |
| גרסת `/api/health` שמצופה אחרי החזרה | `"sha":"b48364f6a592"`, ו־`version` מסתיים ב־`JCmRRr69iwAoDu85TcogszfFie2V` |

### מה בא אחריה (נכון ל־21.11, 08:30)
- `f3273c20` (‏#499, פריסה `dpl_EdotZ9RanwDp6NSJLYTX1f5EamiR`, חיה מ־01:54 ב־21.11). השינוי בקוד הריצה מצומצם ל־`lib/auth/password-policy.ts` ול־`lib/privacy/pii-grant-fields-backfill.ts`. כל השאר הוא בדיקות ומסמכים.
- בין הגרסאות אין מיגרציות, אין שינוי ב־`vercel.json` ואין שינוי במשתני הסביבה. משתנה הסביבה האחרון עודכן ב־3.11.
- כל מיזוג נוסף (למשל המיזוג המשותף של סבב הסריקה, ענף קטלוג המחירים ועדכוני Dependabot) מוסיף פריסה. רשמו כאן את מזהה הפריסה ואת הקומיט שלה לפני המיזוג.

## מגבלת Hobby שחייבים לדעת
בתוכנית Hobby, **Instant Rollback** מחזיר רק לפריסת הייצור **הקודמת מיד**. אם אחרי `dpl_EdotZ9…` תעלה פריסה נוספת, `dpl_JCmRRr…` כבר לא תהיה «הקודמת», והפקודה `vercel rollback` תיכשל עם השגיאה ‏`To rollback further than the previous production deployment, upgrade to pro`. במקרה כזה משתמשים בנתיב ב׳ (promote) או בנתיב ג׳ (git revert). לא עוברים ל־Pro בגלל זה.

## נתיב א׳: Instant Rollback (רק כשהיעד הוא הפריסה הקודמת)
1. מוודאים שזו באמת הפריסה הקודמת: Vercel → nurawell → Deployments, עם סינון Production. הפריסה השנייה מלמעלה צריכה להיות `JCmRRr…`.
2. בממשק: לוחצים על הפריסה הנוכחית ואז על **Instant Rollback**, ובוחרים את `JCmRRr…`. בשורת הפקודה: `vercel rollback dpl_JCmRRr69iwAoDu85TcogszfFie2V`, ואחר כך `vercel rollback status`.
3. המעבר קורה בשכבת הניתוב, תוך שניות, ובלי בנייה מחדש.
4. **חשוב:** אחרי rollback, Vercel מפסיק לשייך דומיינים אוטומטית לפריסות חדשות. מיזוג הבא ל־main ייבנה, אבל לא יעלה לאוויר עד `vercel promote <הפריסה החדשה>`.

## נתיב ב׳: Promote של הפריסה הקיימת (בלי בנייה)
1. בממשק: פותחים את `dpl_JCmRRr…`, לוחצים על ⋯ ואז על **Promote to Production**. בשורת הפקודה: `vercel promote dpl_JCmRRr69iwAoDu85TcogszfFie2V`, ואחר כך `vercel promote status`.
2. זו אותה פריסה שכבר נבנתה, ולכן אין צריכת דקות בנייה.
3. כדי לבטל: מקדמים שוב (promote) את הפריסה העדכנית.

## נתיב ג׳: git revert (קבוע, דרך main)
מתאים כשרוצים שגם `main` יחזור, או כשנתיבים א׳ ו־ב׳ לא זמינים.
```bash
git fetch origin && git switch -c revert/to-b48364f6 origin/main
# מבטלים כל מיזוג שאחרי b48364f6, מהחדש לישן. מיזוג squash הוא קומיט רגיל:
git revert --no-edit $(git rev-list --reverse b48364f6..origin/main | tac)
# בדיקה שהקוד זהה ליעד, חוץ ממה שהתווסף בכוונה:
git diff b48364f6 --stat
```
- פותחים PR, ומחכים לבדיקות `test`, ‏`build`, ‏`gitleaks` ו־CodeQL. ממזגים פעם אחת, וזו פריסה אחת.
- אם יש מיגרציה בין הקומיטים, **לא** מבטלים את קובץ המיגרציה. ראו את הסעיף הבא.

## המסד לא חוזר אחורה
- חזרת Vercel ו־`git revert` מחזירות **קוד בלבד**. מיגרציות שכבר הוחלו על `csxsxvzowlswahmfcsjk` (NuraWell) או על המסד המרכזי `snvjsopfvoshddaydjlm` נשארות.
- נכון ל־21.11, בין `b48364f6` לבין `main` אין מיגרציה. מיגרציה האחרונה בקוד היא `000262`, ובייצור רשומות גם הפעלות האכיפה היומיות (`enc_enforce_*`). שתיהן תואמות את הקוד של `b48364f6`.
- אם לפני החזרה הוחלה מיגרציה חדשה, צריך לוודא שהקוד הישן עובד מולה, כי עמודות חדשות ו־CHECK מחמיר עלולים לשבור כתיבה. אם הוא לא עובד, כותבים מיגרציה מתקנת קדימה. אסור לבצע `DROP` או מחיקת נתונים בלי גיבוי ובלי אישור של דניאל.
- הפעלת אכיפת הצפנה (`field_enc_enforcement.active`) היא שינוי נתונים ולא קוד. החזרת קוד לא מכבה אותה.
- מתגים במסד (`platform_link_settings`, מתגי ה־AI של האם) לא חוזרים יחד עם הקוד.

## בדיקות אחרי החזרה (בלי כניסה ובלי חשבון ייצור)
```bash
R="--resolve nurawell.vercel.app:443:216.198.79.67"
curl -s $R https://nurawell.vercel.app/api/health          # ok:true, sha b48364f6a592
for p in / /login /register /pricing /contact /terms /privacy; do curl -s $R -o /dev/null -w "$p %{http_code}\n" https://nurawell.vercel.app$p; done   # הכול 200
for p in /settings/subscription /license-required; do curl -s $R -o /dev/null -w "$p %{http_code}\n" https://nurawell.vercel.app$p; done            # 307 לכניסה
curl -s $R https://nurawell.vercel.app/pricing | grep -o 'platform-core-preview.vercel.app/products/nurawell/?plan=[a-z]*' | sort -u   # שלושת המסלולים
```
- ב־Vercel → Logs → Production, ב־15 הדקות הראשונות: אין קפיצה ב־5xx.
- `ops.nurawell.ai` מחזיר את אותו מסך כניסה. לא נכנסים איתו.
- ניטור מרכזי: האות הבא מ־`/api/health` ירוק, ולא נפתחה התראת release.
- Cron: ‏`vercel.json` זהה, ולכן ה־cron של field-backfill (‏13:40 שעון ישראל) ממשיך כרגיל.
- שימו לב: ה־cron של log-retention (‏`23 1 * * *` UTC, כלומר 03:23 שעון ישראל) מוגדר, אבל בפרודקשן אף פעם לא נרשמה ריצה אמיתית ב־`log_retention_runs`. נרשמו רק 2 הרצות dry, האחרונה ב־26.10. ה־PR של סריקת התוכנית מוסיף גיבוי בתוך master היומי (`runLogRetentionIfStale`). חזרה ל־b48364f6 אחרי המיזוג תסיר את הגיבוי הזה, ומחיקת הלוגים הישנים תיעצר שוב.

## מי מבצע
החזרה בייצור היא פעולה של מי שמחזיק בהרשאת Vercel, ונעשית רק בהחלטה מפורשת. המסמך הזה לא מבצע אותה.
