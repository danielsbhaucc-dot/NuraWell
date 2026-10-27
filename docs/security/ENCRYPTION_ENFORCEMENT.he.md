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

## 000212 — סגירת עמודות המשימות (sec/enc-close-2)
- offerGuideTask כבר לא כותב את סיבת המשתמש לשורת מדריך משותפת; הסיבה נשמרת מוצפנת ב-user_task_assignments.reason. שורות guide קיימות שכבר מכילות טקסט משתמש — נדרש אישור דניאל לניקוי (לא בוצע).
- task_dup_candidates / merge_task_assignments הועברו לאפליקציה (lib/almog/task-dup-candidates.ts); ב-SQL נשאר רק merge_task_assignment_state (מזהים ורמות בלבד).
- dedupe/דמיון כותרות: title_bidx / title_tok_bidx (HMAC). task_definitions (שורות בעלים), almog_assignments, task_events, challenge_enrollments, chat_task_proposals.title — מוצפנים; שורות משותפות (owner NULL) נשארות תוכן צוות גלוי.
- עמודות קוד קבוע שנשארות גלויות: almog_assignments.schedule, almog_interventions.barrier_type, chat_sessions.topic (CHECK NOT VALID חדש), churn_feedback.reason (CHECK קיים), outcome של sos/interventions, ops_enroll_blocks.reason ('wrong_number' בלבד).
- admin_audit_log.ip מוצפן עם ip_bidx.
- עדיין פתוח: admin_audit_log.detail, ops_security_events.detail, auth_session_trail.ip/user_agent, habit_key/stable_key ישנים של ai_daily (000092) שמכילים כותרת.

## 000214 — יומני ביקורת, מסלול סשנים, מפתחות HMAC לכל משתמש (sec/enc-close-2)
- **HMAC לכותרות:** שורות בבעלות משתמש (task_definitions עם owner, almog_assignments, chat_task_proposals) משתמשות במפתח נגזר לכל משתמש (HKDF, salt=user_id) — אותה כותרת אצל שני משתמשים לא נותנת אותו אינדקס. מפתח גלובלי נשאר רק לשורות צוות משותפות (owner NULL) שהן תוכן צוות גלוי ממילא. מגבלה: כפילות מדויקת בין שורה משותפת לשורה פרטית כבר לא מתנגשת ב-SQL; ה-buildDupCandidates הלילי באפליקציה מכסה את זה.
- **admin_audit_log / ops_security_events:** עמודה חדשה `facts jsonb` גלויה — מזהים, קודים קבועים, ספירות ותאריכים בלבד (SQL ו-dedupe: alertOnce, retention, anomaly). `detail` מוצפן (enc:v2, מפתח מערכת audit). כותב ה-rate-limit עובר דרך עטיפת ההצפנה; ops_break_glass_reset ו-run_data_retention כותבים רק ל-facts. legal_db_audit_window מחזיר facts ומחפש ב-facts/actor_id.
- **auth_session_trail.ip/user_agent:** נכתבות ע"י טריגר על auth.sessions (אין מפתח ב-DB) ← cron אפליקטיבי `/api/v1/ai/cron/session-trail-seal` כל 5 דקות מצפין שורות חדשות ומוסיף ip_bidx. ops_session_trail מסנן לפי p_ip_bidx (+ ענף גלוי לשורות שעוד לא נאטמו). הבדיקה הלילית נכשלת על ערך גלוי שגילו מעל 15 דקות. אין טריגר דחייה בטבלה הזו (הוא היה מפיל את כתיבת הטריגר).
  נבחר cron ולא sealed box ב-DB: pgsodium מוצא משימוש ב-Supabase; pgcrypto pgp_pub_encrypt חינמי, אבל ה-DB לא יכול לחשב ip_bidx (דורש את הסוד), וזה פורמט מעטפה שני מחוץ ל-enc:v2 / DEK לכל משתמש.
- **הורץ (2026-10-26, באישור דניאל):** `supabase/migrations/000215_ai_daily_legacy_keys.sql` — habit_key/stable_key ישנים של ai_daily (000092) שמכילים כותרת ← מפתחות מבוססי id. 2 שורות, 0 נותרו.
- **ניקוי שורת guide משותפת (אושר, לא הורץ):** `apps/web/scripts/guide-reason-cleanup.ts` — מעביר את הסיבה לשורת user_task_assignments של המשתמש (מוצפן) ומאפס את התיאור המשותף. `--dry-run` = ספירות בלבד; אימות: 0 שורות נותרות והסיבות מפוענחות.
- **סדר פריסה:** 000212 ← 000214 ← קוד ← cron session-trail-seal רץ ← guide-reason-cleanup (--dry-run, ואז הרצה).

## 000222–000224 — שלוש העמודות האחרונות (fix/enc-last-three)
- **iam_grants.reason:** נאטם בנתיב הכתיבה של האפליקציה (enc:v2, מפתח מערכת audit). טריגר ה-audit מעתיק את הערך האטום כמו שהוא. ops_break_glass_reset כותב reason = NULL. עדכון חד-פעמי של reason בלבד (גלוי ← enc:v2) מותר ב-guard ונרשם כ-`grant_reseal` בלי תוכן. טריגר דחייה רגיל (000223).
- **iam_audit_log.detail/target:** שורות שהאפליקציה כותבת (deny) נאטמות לפני ה-INSERT, והשרשרת מגבבת את הצופן השמור. שורות של טריגרי SQL (grant/revoke/module/break_glass) מכילות רק הפניות (מזהים, קודים, ספירות, reason אטום) — נבדק ב-`iam_audit_row_ok`. טריגר דחייה ייעודי `zz_enc_reject_plaintext` (רץ אחרי iam_audit_chain).
- **שורות היסטוריות — checkpoint מתועד, לא שכתוב שקט:** `iam_audit_reseal_apply` (פעם אחת): מאמת את השרשרת, מוודא שכל ערך שמור = הגלוי שנשלח ושה-hash שלו תואם, מוסיף קודם שורת `audit_epoch` (`reseal_v1`: מספר שורות, head_seq/head_hash, digest של seq:hash), ואז מחליף target/detail בצופן ומסמן `hash_input='plain_v1'`. hash ו-prev_hash לא משתנים. `iam_audit_immutable` מתיר רק את המעבר הזה (GUC מקומי בתוך הפונקציה); DELETE/TRUNCATE נשארים חסומים.
- **אימות:** `iam_audit_verify` בודק קישורים לכל השורות ו-hash לשורות `stored`; לשורות `plain_v1` האפליקציה מפענחת ו-`iam_audit_hash_check` מחשב מחדש את ה-hash המקורי (פעולת `iam_audit_verify` ב-field-backfill).
- **שמירה (retention) 24 חודשים:** ללא שינוי — שום שורה לא נמחקת ולא נוספת מלבד ה-checkpoint.
- **media_receipts.search_text:** העמודה המחוללת (עותק גלוי של vendor/plan/subject/currency/amount) הוחלפה ב-`search_bidx` — טוקני HMAC מקוצרים (n-grams 1..3 ו-trigrams בסגנון pg_trgm) במפתח ה-blind-index. החיפוש: סינון מועמדים לפי טוקנים ← אותו פרדיקט ישן על הטקסט המפוענח באפליקציה; ציון fuzzy מ-`legal_word_similarity` (pg_trgm על ערכים שהאפליקציה שולחת). 000224 מסירה את ענף הקבלות מ-legal_hub_fuzzy ומוחקת את העמודה — רק אחרי פריסה, backfill ובדיקת שוויון תוצאות (`receipt_search_parity`).
- **הבדל ידוע:** subject היה מוצפן גם קודם, כך שהחיפוש הישן לא מצא לפי נושא; החדש מוצא (על-קבוצה). סכומים: String(number) ב-JS משמיט אפסים בסוף (12.50 ← 12.5).

## 000225 — הצפנה חד-פעמית של ראיות משפטיות ישנות (reseal)
- טבלאות: consent_evidence, consent_evidence_attestations, legal_access_log (append-only).
- לפני כל תא: sha256 של הערך המקורי נרשם ב-legal_reseal_checkpoint (append-only, האשים בלבד, ללא תוכן) + שורת batch עם digest על כל הפריטים וראש השרשרת.
- טריגר ה-append-only נשאר חוסם UPDATE/DELETE/TRUNCATE. חריג יחיד: בתוך legal_reseal_apply (GUC legal.reseal מקומי), עמודה רשומה אחת עוברת מטקסט גלוי ל-enc:v2 וכל השאר זהה.
- record_hash / prev_hash / signature לא משתנים (הם מכסים את ה-plaintext) ומאומתים מחדש אחרי פענוח (verifyChain).
- אימות: `?action=legal_verify` — digest זהה של כל השורות המפוענחות לפני/אחרי, 0 mismatch מול ה-checkpoint, 0 תאים גלויים.
- media_receipts: `?action=media_receipts_probe` — כתיבה אמיתית דרך נתיב האפליקציה, בתוך טרנזקציה שמתגלגלת לאחור, עם אכיפה פעילה; האכיפה הופעלה רק אחרי 'accepted'.
