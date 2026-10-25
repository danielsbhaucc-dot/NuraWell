# חיבור ספק סליקה — צ'קליסט

התשתית (`packages/billing`, חבילת `@saas/billing`) לא תלויה במוצר ולא בספק. כל הכסף עובר דרך דף תשלום מתארח (Hosted) של הספק, ואנחנו לא רואים ולא שומרים נתוני כרטיס (SAQ-A).

## מצב נוכחי
- ספק פעיל: **Mock** בלבד (בלי כסף אמיתי). בפרודקשן הוא חסום אלא אם `BILLING_ALLOW_MOCK=true`.
- Cardcom / Tranzila / Grow (משולם) / PayPlus: stubs. כל מתודה זורקת `NotImplementedProviderError`, בלי הצלחה מזויפת.
- חשבוניות: Green Invoice / iCount הם stubs.
- דגל: `BILLING_PLATFORM_ENABLED` כבוי בפרודקשן, והתשתית כולה חשוכה.

## לכל ספק
| ספק | משתני סביבה | Webhook |
|---|---|---|
| Cardcom | CARDCOM_TERMINAL_NUMBER, CARDCOM_API_NAME, CARDCOM_API_PASSWORD, BILLING_WEBHOOK_SECRET | /api/v1/billing/webhook/cardcom |
| Tranzila | TRANZILA_TERMINAL, TRANZILA_APP_KEY, TRANZILA_SECRET, BILLING_WEBHOOK_SECRET | /api/v1/billing/webhook/tranzila |
| Grow | GROW_PAGE_CODE, GROW_USER_ID, GROW_API_KEY, BILLING_WEBHOOK_SECRET | /api/v1/billing/webhook/grow |
| PayPlus | PAYPLUS_API_KEY, PAYPLUS_SECRET_KEY, PAYPLUS_PAGE_UID, BILLING_WEBHOOK_SECRET | /api/v1/billing/webhook/payplus |
| Green Invoice | GREENINVOICE_API_ID, GREENINVOICE_API_SECRET | — |
| iCount | ICOUNT_COMPANY_ID, ICOUNT_USER, ICOUNT_PASS | — |

## צעדים
- [ ] דניאל בוחר ספק וחותם על הסכם. **זה כרוך בעלות ולא בוצע.**
- [ ] לממש את `PaymentProvider` ב-`packages/billing/src/providers/<name>.ts`: דף מתארח, חיוב חוזר עם טוקן, ביטול, החזר, ו-parseWebhook עם אימות חתימה לפי התיעוד של הספק.
- [ ] להגדיר את משתני הסביבה ב-Vercel רק ב-Preview תחילה.
- [ ] לבדוק בסביבת Sandbox של הספק: חתימה שגויה מחזירה 401, ושליחה כפולה מחזירה duplicate.
- [ ] להחליט אם המחירים כוללים מע"מ (`prices_include_vat`, TODO).
- [ ] גילוי מחיר ותנאי ביטול לפני תשלום (חוק הגנת הצרכן): ביטול תוך 14 יום, ודמי ביטול של עד 5% או 100 ₪, הנמוך מביניהם.
- [ ] ביטול מקוון באותו ערוץ, עם אישור.
- [ ] רק אחרי כל אלה: להדליק `BILLING_PLATFORM_ENABLED` בפרודקשן.

## אבטחה ואיומים
- זיוף webhook: HMAC עם השוואה בזמן קבוע (timingSafeEqual).
- Replay: חלון זמן של 300 שניות, ובנוסף מפתח ייחודי (product_id, provider, idempotency_key) בטבלה append-only `billing_webhook_events`. אחרי העיבוד מותר לעדכן רק את outcome.
- נשמר רק hash של ה-payload, בלי פרטים אישיים.
- כתיבה לטבלאות החיוב מותרת רק ל-service_role. המשתמשים רואים רק את התשלומים, החשבוניות והשימוש שלהם (RLS).
- Override ידני של אדמין מתועד ב-admin_audit_log. **step-up עוד לא חובר.**
- סיום מנוי (`ended`) קובע ended_at, וזה מזין את מחיקת השמירה (retention purge, PR #334).
