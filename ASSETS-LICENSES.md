# ASSETS-LICENSES — רישום רישיונות לנכסי דף הנחיתה החדש

כל קובץ תחת `apps/web/public/landing-v2/` חייב שורה בטבלה הזו (עמודת `path` = נתיב מלא מהשורש של הריפו).
ה-CI (`scripts/check-asset-licenses.mjs`, מורץ ע"י `apps/web/tests/asset-licenses.test.ts` בג׳וב Web tests) נכשל אם קובץ חסר שורה, או אם `commercial OK` אינו `yes`.

כללים: בלי דמויות של אנשים אמיתיים מזוהים (אלא אם יש model release), בלי לוגואים של צד שלישי, בלי תוכן מ-Grok בלי קרדיט "Created with Grok".
`proof` = קישור/נתיב לצילום תנאי הרישיון, קבלה, או דף ההורדה ביום ההורדה.


## מדיניות ויזואלים
- **סקיצות הכיוון** (`landing-brief/directions/assets/d1-hero.jpg`, `d2-hero.jpg`, `d3-hero.jpg`) נוצרו במחולל התמונות המובנה, שאי אפשר לאמת את התנאים המסחריים שלו. **סקיצת כיוון בלבד, לא לייצור.** אין להעתיק אותן אל `apps/web/public/landing-v2/`.
- **הירו ואיורים בייצור:** רק SVG שכתבנו בקוד (בבעלותנו), תמונות של OpenAI gpt-image (מותר שימוש מסחרי בלי קרדיט), או תמונות מאגר ברישיון. כל אחד מהם צריך שורה בטבלה.
- תמונות OpenAI נשמרות **עם מטא-דאטה C2PA המקורי** (לא להסיר אותו בדחיסה או בהמרה), והתיעוד כולל את ה-prompt ואת התאריך.
- Grok: לא בתוכן ציבורי, כי הוא מחייב קרדיט. Gemini: לא בשימוש מעכשיו.

## גופנים בעברית
- כל גופן שמציג עברית חייב לטעון את ה-subset העברי (`subsets: ['hebrew', 'latin']` ב-next/font, או קובץ woff2 שכולל U+0590–05FF).
- **אסור שתהיה נפילה לגופן מערכת באמצע מילה.** גופן לטיני בלבד (Cormorant Garamond, DM Sans) לא ישמש לאלמנט שיש בו עברית. המשקלים שבשימוש חייבים להיטען, בלי הדגשה מלאכותית. ב-QA בודקים בצילום מסך.

| asset | path | source URL | license | commercial OK | attribution required | date | proof |
|---|---|---|---|---|---|---|---|
| (example) Rubik font | apps/web/public/landing-v2/fonts/Rubik.woff2 | https://fonts.google.com/specimen/Rubik | SIL OFL 1.1 | yes | no | 2026-10-21 | https://openfontlicense.org/open-font-license-official-text/ |
| צילום מסך: שיחה עם אלמוג (מובייל) | apps/web/public/landing-v2/real/chat.webp | own app (NuraWell), demo account with fake data | owned (first-party product screenshot) | yes | no | 2026-10-21 | landing-brief/wow/assets/real/all (captured from our app, demo user) |
| צילום מסך: תחנה במסע (מובייל) | apps/web/public/landing-v2/real/journey.webp | own app (NuraWell), demo account with fake data | owned (first-party product screenshot) | yes | no | 2026-10-21 | landing-brief/wow/assets/real/all (captured from our app, demo user) |
| צילום מסך: התוכנית (מובייל) | apps/web/public/landing-v2/real/plan.webp | own app (NuraWell), demo account with fake data | owned (first-party product screenshot) | yes | no | 2026-10-21 | landing-brief/wow/assets/real/all (captured from our app, demo user) |
| צילום מסך: הגדרות טון ותזכורות (מובייל) | apps/web/public/landing-v2/real/reminders.webp | own app (NuraWell), demo account with fake data | owned (first-party product screenshot) | yes | no | 2026-10-21 | landing-brief/wow/assets/real/all (captured from our app, demo user) |
| צילום מסך: מסך הבית (מובייל) | apps/web/public/landing-v2/real/home.webp | own app (NuraWell), demo account with fake data | owned (first-party product screenshot) | yes | no | 2026-10-21 | landing-brief/wow/assets/real/all (captured from our app, demo user) |
| צילום מסך: מסך כניסה (מובייל) | apps/web/public/landing-v2/real/login.webp | own app (NuraWell), demo account with fake data | owned (first-party product screenshot) | yes | no | 2026-10-21 | landing-brief/wow/assets/real/all (captured from our app, demo user) |
| צילום מסך: מסך הבית (מחשב) | apps/web/public/landing-v2/real/desktop.webp | own app (NuraWell), demo account with fake data | owned (first-party product screenshot) | yes | no | 2026-10-21 | landing-brief/wow/assets/real/all (captured from our app, demo user) |
| צילום מסך: התוכנית (מחשב) | apps/web/public/landing-v2/real/d-plan.webp | own app (NuraWell), demo account with fake data | owned (first-party product screenshot) | yes | no | 2026-10-21 | landing-brief/wow/assets/real/all (captured from our app, demo user) |
| צילום מסך: המסע (מחשב) | apps/web/public/landing-v2/real/d-journey.webp | own app (NuraWell), demo account with fake data | owned (first-party product screenshot) | yes | no | 2026-10-21 | landing-brief/wow/assets/real/all (captured from our app, demo user) |
| צילום מסך: שיחה עם אלמוג (מחשב) | apps/web/public/landing-v2/real/d-chat.webp | own app (NuraWell), demo account with fake data | owned (first-party product screenshot) | yes | no | 2026-10-21 | landing-brief/wow/assets/real/all (captured from our app, demo user) |
| צילום מסך: הגדרות (מחשב) | apps/web/public/landing-v2/real/d-settings.webp | own app (NuraWell), demo/non-identifying data only | owned (first-party product screenshot) | yes | no | 2026-10-21 | landing-brief/wow/assets/real/ |
| צילום מסך: פרטיות ונתונים / ייצוא נתונים | apps/web/public/landing-v2/real/p-export.webp | own app (NuraWell), demo/non-identifying data only | owned (first-party product screenshot) | yes | no | 2026-10-21 | landing-brief/wow/assets/real/ |
| צילום מסך: הסכמה לשמירת מידע בריאותי | apps/web/public/landing-v2/real/p-consent.webp | own app (NuraWell), demo/non-identifying data only | owned (first-party product screenshot) | yes | no | 2026-10-21 | landing-brief/wow/assets/real/ |
| צילום מסך: מדיניות עוגיות (דף ציבורי) | apps/web/public/landing-v2/real/p-cookies.webp | own app (NuraWell), demo/non-identifying data only | owned (first-party product screenshot) | yes | no | 2026-10-21 | landing-brief/wow/assets/real/ |
| צילום מסך: מדיניות פרטיות (דף ציבורי) | apps/web/public/landing-v2/real/p-legal.webp | own app (NuraWell), demo/non-identifying data only | owned (first-party product screenshot) | yes | no | 2026-10-21 | landing-brief/wow/assets/real/ |
| שורות הפתיחה של אלמוג (טקסט) | apps/web/public/landing-v2/real/almog-lines.json | written in-house for NuraWell | owned (first-party copy) | yes | no | 2026-10-21 | landing-brief/wow/pool/gen.py |

> הערה: `/landing-v2` עצמו הוא HTML שמוגש מ-route (`apps/web/app/landing-v2/`), עם CSS/JS ואיורי SVG שכתבנו בקוד (בבעלותנו) וגופני Rubik ו-Assistant מוטמעים (SIL OFL 1.1, כולל subset עברי).

- **הלוגו בדף התצוגה המקדימה** (`/landing-v2`) הוא הלוגו של NuraWell מהריפו (`apps/web/public/brand/nurawell-special-on-dark.svg`, אותו קובץ שבכותרת האפליקציה), מוטמע כ-data URI. נכס שלנו.
| גופן: Fredoka (fredoka-he) | apps/web/public/landing-v2/fonts/fredoka-he.woff2 | Google Fonts (Fredoka) | SIL Open Font License 1.1 | yes | no | 2026-10-21 | landing-brief/wow/assets/fonts/ |
| גופן: Fredoka (fredoka-lat) | apps/web/public/landing-v2/fonts/fredoka-lat.woff2 | Google Fonts (Fredoka) | SIL Open Font License 1.1 | yes | no | 2026-10-21 | landing-brief/wow/assets/fonts/ |
| גופן: Frank Ruhl Libre (frank-he) | apps/web/public/landing-v2/fonts/frank-he.woff2 | Google Fonts (Frank Ruhl Libre) | SIL Open Font License 1.1 | yes | no | 2026-10-21 | landing-brief/wow/assets/fonts/ |
| גופן: Frank Ruhl Libre (frank-lat) | apps/web/public/landing-v2/fonts/frank-lat.woff2 | Google Fonts (Frank Ruhl Libre) | SIL Open Font License 1.1 | yes | no | 2026-10-21 | landing-brief/wow/assets/fonts/ |
