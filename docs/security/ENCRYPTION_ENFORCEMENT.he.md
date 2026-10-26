# אכיפת הצפנה בבסיס הנתונים (enc-reject)

דרישה: כל מידע רגיש חדש נשמר מוצפן — בלי חריגים ובלי עקיפה.

## מה נבנה
- **טריגר דחייה** `zz_enc_reject_plaintext` על כל טבלה ב-`FIELD_V2_TABLES` (מיגרציה 000203, נוצרת אוטומטית מ-field-registry
  ע"י `apps/web/scripts/gen-enc-triggers.mts`). INSERT/UPDATE שכותב ערך לא-ריק בלי קידומת `enc:v1:`/`enc:v2:` לעמודה רשומה — נדחה.
  ב-UPDATE נבדקות רק עמודות שהשתנו (`IS DISTINCT FROM`). ריק מותר: NULL, `''`, `{}`, `[]`. הודעת השגיאה כוללת טבלה+עמודה בלבד.
- **דגל הפעלה לכל טבלה** `field_enc_enforcement(table_name, active)` — ברירת מחדל כבוי. ההפעלה חד-כיוונית: כיבוי או מחיקה של טבלה פעילה נחסמים.
  הפונקציה SECURITY DEFINER כדי שגם כתיבה עם JWT של משתמש תראה את הדגל.
- **מפתחות מערכת** לטבלאות בלי בעלים פרטי (audit / ops / legal): HKDF מה-root, לא נשמרים ב-user_data_keys — מחיקת חשבון לא מוחקת ראיות.
- **טבלאות append-only** (consent_evidence, consent_evidence_attestations, legal_access_log): שורות ישנות נשארות; כל שורה חדשה מוצפנת.
- **CI**: `tests/enc-reject-triggers.test.ts` נכשל אם הרשימה במיגרציה האחרונה שנוצרה לא תואמת ל-registry.
  שינוי ב-registry ← הרצת המחולל לתוך מספר מיגרציה **חדש** (שמור ב-MIGRATION_CLAIMS).
- **בדיקה לילית** (`scripts/backup/plaintext-check.sh`): כל עמודה בטבלה פעילה = enforce (נכשל + התראה). append-only: נספרות רק שורות שנוצרו אחרי ההפעלה.
  טבלה פעילה בלי טריגר (או טריגר מושבת) = כישלון.

## סדר פריסה (לכל טבלה)
1. החלת מיגרציות 000203 + 000204 (הטריגרים כבויים; 000204 מוסיפה `ai_interactions.redaction_notice`, `scheduled_reminders.source`
   ומחליפה CHECK-ים שהיו דוחים צופן). **המיגרציות לפני הקוד** — הקוד כותב לעמודות החדשות.
2. פריסת הקוד (עטיפת ההצפנה כותבת enc:v2 לכל העמודות הרשומות).
3. הרצת ה-backfill עד 0 ערכים גלויים בטבלה (append-only מדולגות).
4. אימות בבדיקה הלילית: 0 בטבלה.
5. `update public.field_enc_enforcement set active = true where table_name = '<table>';` — טבלה אחת בכל פעם, מעקב שגיאות 24 שעות.
6. הוספת הטבלה ל-`FIELD_V2_BACKFILL_COMPLETE`.

## עדיין לא מוצפן (ממתין, עם סיבה)
ר' `column-classification.ts` — כל עמודה "pending" עם הסיבה (כותבי SQL, מפתח/סינון שדורש blind index, טבלאות מחוץ לענף).
עמודות BLOCKED ב-field-registry לא מכוסות בטריגר עד שהחסם יוסר.

## סגירת עמודות ממתינות (000208–000210, gated 000211)

- **אינדקס עיוור (HMAC, מפתח HKDF מ-PII_ENCRYPTION_KEY, לא מודפס לעולם):** `challenge_success_events.title_bidx`, `notifications.meta_key_bidx` / `meta_unique_bidx` (מחליפים את אינדקסי הביטוי על metadata). מסנני `eq` על title נכתבים מחדש אוטומטית ב-`withFieldDecryption`.
- **נרשמו להצפנה:** notifications.metadata, challenge_success_events.title, user_consents.metadata (evidence_id/request_id/choice שוכפלו לעמודות רגילות לטריגר ההיסטוריה), journey_task_executions.note (הטריגר לא מעתיק עוד את ההערה ל-task_events), almog_kickoff_status, billing_events.metadata, ceo_pending_actions, notify_quality_events.
- **task_definitions:** נוספה owner_user_id (000209) + RLS. ההצפנה עצמה ממתינה לפורט של normalize_task_title / habit_dedupe_key / merge_task_assignments לאפליקציה.
- **ממצא פרטיות:** offerGuideTask כותב את params.reason של משתמש לתיאור של שורת guide משותפת.
- **IAM/admin:** `supabase/gated/000211_iam_admin_enc_prep.sql` + `GATED_AFTER_IAM_MERGE` — להחיל רק אחרי מיזוג #357–#362.
- **נשאר ממתין (SQL כותב/קורא):** almog_assignments.*, task_events.reason/metadata (+ עותקי note ישנים — ניקוי דורש אישור), admin_audit_log.detail/ip, ops_security_events.detail, auth_session_trail.ip/user_agent, עמודות CHECK/enum ב-BLOCKED, iam_audit_log, iam_grants.reason, ops_probe_daily.country.
