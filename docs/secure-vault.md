# Secure vault (כספת)
- **שמירה:** `POST /api/v1/secure-vault` מצפין ב-AES-256-GCM (המפתח `SECURE_VAULT_KEY` מוגדר ב-Vercel, ה-AAD הוא מזהה הבעלים) ושומר ב-`secure_vault_items`. ה-RLS מאפשר לבעלים בלבד לקרוא ולמחוק. בצ'אט נכנסת רק ההודעה "שמרתי … פריט מסוג X". אלמוג מכיר רק את `[[VAULT:x]]`.
- **שימוש בצד השרת:** `resolveVaultRef(admin, { userId, ref, action })` ב-`lib/secure-vault/resolver.ts` (server-only).
  - מותר רק ל-action שמופיע ב-`VAULT_ACTIONS`. כרגע הרשימה **ריקה**, כי עוד אין פעולה אמיתית שצריכה את הערך.
  - הבקשה נבדקת מול הבעלים. כל ניסיון נרשם ב-`secure_vault_access_log` (בלי ערך) עם אחת התוצאות granted / denied_action / denied_owner / not_found / error.
  - **אסור** להכניס את הערך המפוענח ל-payload של AI, להיסטוריית הצ'אט, ללוגים או לאנליטיקה. הוא משמש רק בתוך הפעולה עצמה (למשל שליחת טופס לגורם מורשה).
- **הוספת פעולה:** מוסיפים שם ל-`VAULT_ACTIONS` בתוך PR שמכיל את הפעולה עצמה, ועוברים בדיקת אבטחה.
