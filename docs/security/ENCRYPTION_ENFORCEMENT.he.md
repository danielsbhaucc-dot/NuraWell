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
