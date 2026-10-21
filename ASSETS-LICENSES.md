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
