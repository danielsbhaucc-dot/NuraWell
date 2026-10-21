# ASSETS-LICENSES — רישום רישיונות לנכסי דף הנחיתה החדש

כל קובץ תחת `apps/web/public/landing-v2/` חייב שורה בטבלה הזו (עמודת `path` = נתיב מלא מהשורש של הריפו).
ה-CI (`scripts/check-asset-licenses.mjs`, מורץ ע"י `apps/web/tests/asset-licenses.test.ts` בג׳וב Web tests) נכשל אם קובץ חסר שורה, או אם `commercial OK` אינו `yes`.

כללים: בלי דמויות של אנשים אמיתיים מזוהים (אלא אם יש model release), בלי לוגואים של צד שלישי, בלי תוכן מ-Grok בלי קרדיט "Created with Grok".
`proof` = קישור/נתיב לצילום תנאי הרישיון, קבלה, או דף ההורדה ביום ההורדה.

| asset | path | source URL | license | commercial OK | attribution required | date | proof |
|---|---|---|---|---|---|---|---|
| (example) Rubik font | apps/web/public/landing-v2/fonts/Rubik.woff2 | https://fonts.google.com/specimen/Rubik | SIL OFL 1.1 | yes | no | 2026-10-21 | https://openfontlicense.org/open-font-license-official-text/ |
