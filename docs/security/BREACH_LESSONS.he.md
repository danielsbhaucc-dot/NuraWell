# טבלת לקחים מפריצות מוכרות

| פריצה | מה קרה | הלקח | מצב ב-NuraWell |
|---|---|---|---|
| Vastaamo (פינלנד 2020) | מאגר טיפולים נפשיים לא מוצפן נגנב, סחיטת מטופלים | הצפנת שדות בריאות; מחיקה קריפטוגרפית | ⚠️ חלקי — הצפנת מעטפה מתוכננת וממתינה לאישור |
| Uber 2016 | מפתחות AWS בריפו ב-GitHub | סודות לעולם לא בקוד | ✅ gitleaks + TruffleHog + secret scanning |
| Codecov 2021 | סקריפט CI הושחת, גנב סודות | הצמדת Actions ל-SHA, הרשאות מינימליות | ✅ default token=read; לוודא pinning לכל Action |
| CircleCI 2023 | גניבת טוקני סשן ממחשב עובד | סיבוב סודות, טוקנים קצרי חיים | ⚠️ אין רוטציה מתוזמנת |
| Okta 2023 | קבצי HAR עם cookies בתמיכה | לא לשתף לוגים עם סשנים | ✅ scrubber ללוגים |
| LastPass 2022 | גיבויים מוצפנים נגנבו + מפתחות חלשים | גיבוי מוצפן, מפתח פרטי מחוץ לענן | ✅ age, מפתח פרטי לא בענן |
| 23andMe 2023 | credential stuffing | הגנת סיסמאות דלופות, MFA, rate limit | ⚠️ leaked-password protection דורש הפעלה ידנית בדשבורד |
| Snowflake/Ticketmaster 2024 | חשבונות ענן בלי MFA | MFA על כל חשבון ענן | ⚠️ לאמת ידנית (ACCOUNT_POSTURE) |
| Optus 2022 | API ללא אימות + מזהים עוקבים | כל API מאומת; IDOR | ✅ בדיקת CI לכל נתיב אדמין, RLS |
| Facebook 2019 | סיסמאות בלוגים | לא לרשום מידע רגיש | ✅ בדיקת CI ל-console.* |
| Capital One 2019 | SSRF למטא-דאטה | הגבלת fetch יוצא | ✅ proxy: redirect ידני, allowlist סוגים, timeout |
| xz-utils 2024 / event-stream 2018 | תלות זדונית | lockfile, audit, Snyk | ✅ 0 פגיעויות, Snyk |
| Supabase RLS misconfig (מקרים רבים 2024–25) | טבלאות פתוחות ל-anon | RLS על הכל + advisors | ✅ + הרשאות עמודה (000176) |
