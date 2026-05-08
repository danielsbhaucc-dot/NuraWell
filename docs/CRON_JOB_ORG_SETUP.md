# הגדרת cron-job.org ל-NuraWell AI

המטרה: להפעיל את `GET /api/v1/ai/cron/master` דרך `cron-job.org` בצורה מאובטחת, בלי Vercel Cron.

## 1) הגדרת משתני סביבה ב-Vercel

בפרויקט `apps/web`:

- `CRON_JOB_ORG_TOKEN` = ערך סודי ארוך ואקראי.
- `SUPABASE_SERVICE_ROLE_KEY` = כבר נדרש ל-cron.
- מומלץ להשאיר גם `CRON_SECRET` כגיבוי ידני להפעלה דרך Postman/curl.

## 2) יצירת Job ב-cron-job.org

ב-UI של cron-job.org:

- **URL**: `https://<your-domain>/api/v1/ai/cron/master`
- **Method**: `GET`
- **Schedule**: פעם ביום (למשל 07:00 UTC)
- **Custom Header**:
  - Name: `x-cron-job-org-token`
  - Value: הערך של `CRON_JOB_ORG_TOKEN`

אין צורך ב-request body.

## 3) בדיקת תקינות ראשונית

אחרי שמירה והרצה ידנית של ה-job:

- סטטוס צריך להיות `200`.
- גוף תגובה צפוי לכלול:
  - `ok: true`
  - מונים כמו `analyzed`, `nudged`, `analysis_skipped`, `nudge_skipped`
- אם מתקבל `401`: הטוקן בכותרת לא תואם ל-`CRON_JOB_ORG_TOKEN`.
- אם מתקבל `500`: לרוב חסר env (`SUPABASE_SERVICE_ROLE_KEY` או טוקן cron).

## 4) טיונינג כדי לעמוד במגבלת זמן

`cron-job.org` סוגר בקשה סביב 30 שניות, לכן להתחיל שמרני:

- `CRON_MAX_ANALYSIS_USERS=20`
- `CRON_MAX_NUDGE_USERS=20`
- `CRON_NUDGE_COOLDOWN_HOURS=48`

אם אתה רואה timeout, מורידים קודם את `CRON_MAX_ANALYSIS_USERS`.

## 5) הרצה ידנית לגיבוי (ללא cron-job.org)

אפשר לבדוק ידנית עם `CRON_SECRET`:

```bash
curl -X GET "https://<your-domain>/api/v1/ai/cron/master" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

כך אפשר להפריד בין בעיית scheduler לבעיית שרת.
