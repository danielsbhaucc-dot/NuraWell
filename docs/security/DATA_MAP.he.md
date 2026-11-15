# מפת נתונים וסיווג

סיווג: **S3** = מידע רגיש (בריאות/נפשי/גוף, תקנות 2017 "רמת אבטחה בינונית" לפחות) · **S2** = מזהה אישי · **S1** = תפעולי · **S0** = ציבורי.

| תחום | טבלאות עיקריות | סיווג | הגנה כיום | פער |
|---|---|---|---|---|
| זהות | auth.users, profiles (שם, טלפון, מייל, גיל, מגדר) | S2 | RLS; שדות PII מוצפנים `enc:v1` (PII_ENCRYPTION_KEY) | `profiles.ai_context` טקסט גלוי |
| בריאות ומדדים | measurements, health consent, health memory | S3 | RLS + הצפנת שדות חלקית | ראו טבלת פערים |
| שיחות AI | ai_interactions, pending_chat_logs, ai_interaction_edits | S3 | RLS; ai_interactions מוצפן | 2 שורות ישנות גלויות ב-ai_interactions; `ai_interaction_edits.original_content/edited_content` גלוי |
| זיכרון AI | user_memory_dossier, וקטורים ב-Upstash | S3 | RLS; וקטורים נמחקים במחיקת חשבון | dossier בטקסט גלוי |
| מסע/שאלונים | journey notes/answers | S3 | RLS | טקסט גלוי |
| סיכומים | periodic_summaries.ai_insight | S3 | RLS | טקסט גלוי |
| התראות | notifications.body, scheduled_reminders | S2–S3 | RLS | body גלוי |
| כספת | secure_vault_items | S3 | AES-256-GCM, iv/tag נפרדים, AAD=userId, מפתח SECURE_VAULT_KEY | תקין |
| הסכמות ומשפטי | consent_evidence(_blobs), consent_history, legal_access_log | S2 | נשמר בכוונה לאחר מחיקה (ראיה משפטית) | לתעד בסיס חוקי ותקופה |
| חיוב | billing_events | S2 | user_id→NULL במחיקה | — |
| מנוי ושמירה אחרי סיום | subscriptions, profiles.post_sub_retention, user_consents (post_subscription_retention), billing_* (000188) | S2 | RLS; לפי בחירת המשתמש: מחיקה מיד או 24 חודשים מסיום המנוי (ברירת מחדל לחשבונות ותיקים: 24 חודשים); תיעוד הבחירה 7 שנים | — |
| אדמין/אבטחה | admin_audit_log, ops_security_events, error_events | S1 | IP מוסר אחרי 30 יום; מחיקה אחרי 365 | — |
| עמוד ציבורי | site_settings | S0 | מיגרציה 000176: עמודת demo_default_target_user_id חסומה ל-anon/authenticated | תוקן |
| קישור לחברת האם (רישיון וכניסה) | auth.users.app_metadata: ‏pl_lic (מזהה רישיון), pl_sub (מזהה משתמש אצל האם, שונה לכל מוצר), pl_claim, pl_enforce_test; platform_link_settings | S2 | נכתב רק בצד השרת (משתמש לא יכול לערוך app_metadata); מזהים בלבד, בלי תוכן בריאותי, ולכן לא מוצפנים בנפרד; platform_link_settings: RLS בלי מדיניות, service role בלבד. לחברת האם נשלח (שרת לשרת, עם סוד לקוח) רק המייל המאומת של משתמש עם רישיון, והיא שומרת ממנו רק אינדקס מוצפן. אין שם, טלפון או מידע בריאותי | — |
| כניסה והרשמה דרך חברת האם (מ-9.11.2026) | parent_session_grants (מזהה משתמש, מזהה סשן, מזהה אצל האם, זמני תוקף), parent_signup_claims (מייל, מזהה אצל האם, nonce) | S2 | RLS בלי מדיניות, service role בלבד, אין הרשאות ל-anon/authenticated; המייל נשמר מוצפן `enc:v2` עם אינדקס HMAC לחיפוש (000251); 0 שורות גלויות (15.11.2026) | — |
| שדות שהוצפנו השבוע (9–14.11.2026) | profiles.date_of_birth / birth_date (הפכו לטקסט כדי לשאת `enc:v2`, 000233); admin_passkeys.telegram_user_id ו-gideon_device_requests.chat_id (‏`enc:v2` + אינדקס HMAC, 000253); pii_access_log.country / resource, access_audit_*, ops_device_enroll facts, pii_access_grants (ciphertext, 000235–000249) | S2 | הצפנה בכתיבה; בדיקת לילה סופרת שורות גלויות (ספירה בלבד); 0 שורות גלויות בשדות החדשים (15.11.2026) | — |
| ספקים חיצוניים | ספקי AI, Upstash, R2 (גיבויים מוצפנים age), Vercel, Supabase | — | כל קריאה לספק AI עוברת במסנן המזהים המרכזי (שם/טלפון/מייל/ת"ז → פסאודונים), בכל המודלים; נאכף בבדיקת CI | — |

## פערי טקסט גלוי (יעד להצפנת מעטפה — מחכה לאישור דניאל)
user_memory_dossier · pending_almog_commitment_jobs · profiles.ai_context · periodic_summaries.ai_insight · הערות/תשובות journey · notifications.body / scheduled_reminders · הערות בקשות תמלול · ai_interaction_edits (תוכן) · 2 שורות legacy ב-ai_interactions.
