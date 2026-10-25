# מצב אבטחת חשבונות

## GitHub (נבדק אוטומטית)
- ✅ Branch protection על main: PR חובה, בדיקות חובה (test, gitleaks, CodeQL JS/TS, Vercel), חל גם על אדמין, חסימת force-push ומחיקה.
- ✅ משתתף יחיד (danielsbhaucc-dot, admin). ✅ 0 deploy keys. ✅ webhook יחיד (Snyk).
- ✅ הרשאת GITHUB_TOKEN ברירת מחדל: read; Actions לא יכולים לאשר PR.
- ⚠️ הריפו **ציבורי** — החלטה פתוחה (עלויות ב-PAID_OPTIONS).
- ⏳ ידני: לוודא 2FA עם passkey/מפתח חומרה; לעבור על Settings → Applications ו-Personal access tokens ולמחוק ישנים.

## Vercel / Supabase / Google (ידני — אין גישה אוטומטית)
| חשבון | לבדוק |
|---|---|
| Vercel | 2FA; Tokens ישנים; Deployment Protection על Preview; Git fork protection |
| Supabase | 2FA; אין חברי צוות מיותרים; **Auth → leaked password protection ON**; Access tokens |
| Google (Workspace/Cloud) | 2FA עם passkey; Advanced Protection; מי בעל IAM על פרויקט ה-KMS; Budget alert |
| Cloudflare (R2) | 2FA; API tokens מוגבלים לבאקט |
| מייל ראשי | 2FA, מייל שחזור, זה המפתח לכל השאר |
