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
| ספקים חיצוניים | ספקי AI, Upstash, R2 (גיבויים מוצפנים age), Vercel, Supabase | — | כל קריאה לספק AI עוברת במסנן המזהים המרכזי (שם/טלפון/מייל/ת"ז → פסאודונים), בכל המודלים; נאכף בבדיקת CI | — |

## פערי טקסט גלוי (יעד להצפנת מעטפה — מחכה לאישור דניאל)
user_memory_dossier · pending_almog_commitment_jobs · profiles.ai_context · periodic_summaries.ai_insight · הערות/תשובות journey · notifications.body / scheduled_reminders · הערות בקשות תמלול · ai_interaction_edits (תוכן) · 2 שורות legacy ב-ai_interactions.
