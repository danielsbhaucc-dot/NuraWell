# @platform/security-crypto — הצפנת שדות לכל משתמש (enc:v2)

**מטרה:** הצפנת עמודות רגישות במסד. לכל משתמש יש מפתח נתונים משלו, והוא עטוף במפתח-אב שהמוצר מזריק. כל ערך קשור לטבלה, לעמודה ולשורה שלו, ולכן אי אפשר להעתיק ערך מוצפן למקום אחר. מחיקת המפתח של משתמש מוחקת קריפטוגרפית את כל המידע שלו, כולל גיבויים.

**דרגה:** shareable. **תמיד פעיל:** לא ניתן לכיבוי.

## API ציבורי
- `newDataKey`, `unwrapDataKey`, `rewrapDataKey`: מפתח נתונים לכל משתמש
- `encryptField`, `decryptField`, `migrateValue`: הצפנה, פענוח והמרה מ-enc:v1/טקסט גלוי
- `fieldAad`, `dekScope`: מחרוזות הקשירה
- `blindIndex`, `blindIndexEquals`: חיפוש שוויון על מידע מוצפן

## הגדרות ו-env
- **env:** אין. המודול לא קורא משתני סביבה, לא פונה ל-KMS ולא פונה למסד.
- **מפתחות:** המוצר מזריק את המפתחות כ-Buffer של 32 בתים. ב-NuraWell הם מגיעים מ-`lib/security/kms-envelope.ts`.

## מיגרציות
אין. טריגרי הדחייה והבדיקה הלילית שייכים למודול `data-classification`, בשלב 2b.

## בדיקות
`apps/web/tests/platform-security-crypto.test.ts`. וקטורים קבועים שנוצרו מהקוד המקורי לפני ההזזה מוכיחים שהפורמט לא השתנה.

## התקנה במוצר חדש
`node scripts/modules/install.mjs security-crypto --target <repo>`. אחר כך מוסיפים שורה למניפסט, ומזריקים מפתח-אב מ-KMS.

## לא לשנות
פורמט `enc:v2` ומחרוזות ה-AAD (`nurawell:`). זה מה שהמידע ב-prod מוצפן איתו. שינוי בהם הוא major, ודורש תוכנית המרה.

## תרומה חזרה
PR לריפו NuraWell. הוא חייב:
- עדכון CHANGELOG ו-version
- `node scripts/modules/check.mjs` ירוק
- בדיקות ירוקות
- review אבטחה
