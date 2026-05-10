# ביצועים, חולשות ובדיקות עומס — NuraWell

מסמך קצר לאיתור צווארי בקבוק ולהרצת בדיקות.

## מה כבר קיים בקוד

| אזור | חולשה / סיכון | מה כבר טופל / המלצה |
|------|----------------|----------------------|
| **GET /api/v1/notifications** | COUNT מלא על “לא נקרא” בכל קריאה | בעימוד (`cursor`) ה-COUNT **לא** רץ — רק בדף ראשון |
| **אינדקסים** | סריקות ארוכות על `notifications` | מיגרציה `000012`: `idx_notifications_user_inbox`, `idx_notifications_user_unread` |
| **צ’אט AI** | מספר קריאות רשת (embedding + Upstash ×2 + מודל) | Edge ב־`fra1`; אפשר לכבות RAG עם `AI_VECTOR_RAG_ENABLED=0` |
| **Cron מאסטר** | לולאה סדרתית על משתמשים + מודלים | הגבל `CRON_MAX_*`; שלב הניתוח על DeepSeek |
| **Realtime התראות** | ערוץ לכל משתמש מחובר | סביר למובייל; לעקוב אחר מספר חיבורים ב-Supabase |

## בדיקות אוטומטיות (מהירות CPU)

```bash
cd apps/web
npm run test
```

כוללות גם מדד זמן ל־50,000 קריאות ל־`parseInboxSearchParams` (צריך `vitest` דרך `npx` אחרי `npm install`).

## בדיקת עומס ידנית ל-API (דורש שרת + סשן)

להרחבה עתידית: [k6](https://k6.io/) או Artillery עם Cookie/JWT — לא נכלל כאן כדי לא להסתמך על סודות.

## צעדי המשך מומלצים

1. **מסד נתונים:** לאחר עשרות אלפי שורות ב־`notifications`, לשקול `VACUUM ANALYZE` תקופתי ולנטר שאילתות איטיות ב-Supabase.
2. **צ’אט:** לפרוס לוגים עם `x-debug-id` כדי למדוד p95 לטעינת RAG בלבד.
3. **CI:** workflow `web-test.yml` מריץ `npm install` + בדיקות ב-GitHub Actions.
