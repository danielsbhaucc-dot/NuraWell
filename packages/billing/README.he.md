# @saas/billing

מודול חיוב ומנויים כללי לכל מוצר SaaS. אין בו שום דבר ספציפי ל-NuraWell: התוכניות, המחירים, הספק והתלות במסד מוזרקים מבחוץ.

- `types.ts`: מודל נתונים עם `productId` בכל ישות.
- `state-machine.ts`: מעברי סטטוס מנוי (trialing / active / past_due / canceled / ended) וקביעת `endedAt`.
- `pricing.ts`: מחיר, קופונים, יחסיות (proration) בשדרוג/שנמוך, מע״מ.
- `entitlements.ts`: מה מותר לכל תוכנית (צד שרת).
- `consumer-law.ts`: זכות ביטול 14 יום ודמי ביטול לפי חוק הגנת הצרכן.
- `dunning.ts`: לוח ניסיונות חיוב חוזרים.
- `webhooks.ts`: אימות חתימה (HMAC), חלון זמן נגד הקלטה חוזרת, מפתח אידמפוטנטיות.
- `retention.ts`: מה קורה למידע כשהמנוי נגמר.
- `providers/`: ממשק `PaymentProvider` ו-`InvoiceProvider`, ספק Mock מלא, ותבניות לספקים אמיתיים (לא ממומשות, זורקות שגיאה).

שכבת החיבור של כל מוצר יושבת באפליקציה עצמה (ב-NuraWell: `apps/web/lib/billing/`).
