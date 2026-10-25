# סקירת שמירה ומחיקה

## מחיקת חשבון (`lib/privacy/delete-user-account.ts`)
1. מחיקת וקטורי זיכרון ב-Upstash. 2. מחיקה ידנית מטבלאות בלי CASCADE. 3. `auth.admin.deleteUser` → CASCADE על כל הטבלאות המקושרות.

**ממצא שתוקן בסבב זה:** `ai_interaction_edits` (מכיל תוכן שיחה) ו-`ai_usage_monthly` לא היו מקושרים ב-CASCADE ולא נמחקו → נוספו לרשימת המחיקה הידנית. (בדיקה בפרוד: 0 שורות יתומות כרגע.)

**נשמר בכוונה אחרי מחיקה:** consent_evidence(_blobs), consent_history, legal_access_log (ראיה להסכמה), billing_events עם user_id=NULL (חשבונאות), admin_audit_log. יש לתעד במדיניות הפרטיות את הבסיס והתקופה (מומלץ: 7 שנים לחשבונאות, 3–7 שנים להסכמות — לאשר עם עו"ד).

## מחיקה אוטומטית (`purge_expired_personal_data`, מיגרציה 000144)
| נתון | תקופה |
|---|---|
| webauthn_challenges, ops_handoff_tokens | יום אחרי פקיעה |
| ops_login_requests, demo_access_sessions, error_events, gideon_outbox | 30 יום |
| IP ב-admin_audit_log | מוסר אחרי 30 יום |
| admin_audit_log, ops_security_events | 24 חודשים (מיגרציה 000177) |
| chat_perf_timings | 90 יום |
| pending_almog_commitment_jobs, pending_chat_logs (מעובדים) | 7 ימים |
| notifications שנקראו | 180 יום |

## גיבויים
גיבוי לילי מוצפן age ב-R2, נמחק אחרי 30 יום → משתמש שנמחק נשאר בגיבויים עד 30 יום. יש לציין זאת במדיניות. הצפנת מעטפה (מחיקה קריפטוגרפית) תסגור את הפער.

## ייצוא (`export-user-data.ts`)
קיים ייצוא נתונים למשתמש (זכות עיון). מומלץ לוודא שהוא כולל גם את הטבלאות החדשות שיתווספו בעתיד — להוסיף לרשימת הבדיקה בכל מיגרציה.

## המלצות פתוחות
- מדיניות שמירה לשיחות AI ולזיכרון (כרגע ללא תפוגה) — **החלטת מוצר**.
- notifications שלא נקראו — ללא תפוגה.
