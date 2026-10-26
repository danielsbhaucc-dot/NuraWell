# platform-central — מאגר מרכזי של חברת האם

**בקצרה (עברית):** זה מאגר נפרד וחינמי של החברה, לא של NuraWell. כאן יישבו רשימת המוצרים, הצוות וההרשאות שלו לפי מוצר, ויומן ביקורת שאי אפשר למחוק. אין כאן מידע של משתמשי המוצרים. הכול נעול: אין גישה ציבורית, אין הרשמה עצמית, ורק השרת ניגש אליו. בהמשך יתווספו כאן תיק לקוחות ומערכת תמיכה.

## Facts
- Supabase project `snvjsopfvoshddaydjlm` ("platform-central"), eu-central-1, free plan ($0/month).
- Migrations: `supabase-central/migrations/` (applied via Supabase MCP; not part of NuraWell's `supabase/migrations`).
- Keepalive: a 1-request step in `.github/workflows/db-backup.yml` (daily GitHub Actions) hits `/auth/v1/health`. Secrets: `CENTRAL_SUPABASE_URL`, `CENTRAL_SUPABASE_PUBLISHABLE_KEY` (GitHub). No Vercel env yet (not needed until the hub moves).

## What lives where
| Central (this DB) | Each product DB (e.g. NuraWell) |
|---|---|
| products registry, staff members, roles/permissions, product-scoped grants, audit log | end users, their data, product-specific settings |
| later: customers (B2B/CRM per product), support tickets | product's own end-user support context |

## Security baseline
- All tables in private schema `central` (not exposed by the Data API). `public` revoked from anon/authenticated, incl. default privileges.
- RLS enabled **and forced** on every table + restrictive `deny_api_roles` policy for anon/authenticated. Only `service_role` (server) reads/writes.
- `audit_log` append-only: triggers block UPDATE/DELETE/TRUNCATE; service_role has no UPDATE/DELETE. Every DML on other tables is auto-logged (actor from `set_config('central.actor', <staff uuid>, true)`).
- PII only as `enc:v2:` envelope (CHECK `central.is_enc_v2`), same format as NuraWell's field-envelope; **separate keys** for this DB, kept outside the DB. Lookups via app-computed blind index (`email_bidx`).
- pg_graphql dropped. Sign-ups blocked by trigger on `auth.users` unless created server-side with `app_metadata.central_invited = true`.
- Roles: `founder` (platform, all), `finance` (platform, billing only), `product_manager` (one product), `support_rep` (one product: tickets + minimal customer contact, 365-day max). A trigger enforces platform-role ⇔ no product, product-role ⇔ exactly one product.

## Not yet done (no MCP/API access from here)
Dashboard Auth settings: turn off "Allow new users to sign up", require email confirm, enable TOTP MFA; Network Restrictions (not on free tier). The signup trigger already blocks sign-ups at DB level.

## How a product connects
Product servers never get central credentials by default. The hub (server-side only) gets `CENTRAL_SUPABASE_URL` + service-role key as **sensitive** env when it moves. Products are referenced by `products.id` and `product_db_ref` (no credentials stored here).

## Migrating the hub later (Phase 1)
1. Add `central.product_registry` mirroring NuraWell `platform_product_registry`, and copy `iam_products/iam_roles` seeds (000207).
2. Point `/ops/modules` reads at central behind a flag, dual-read and compare, then switch writes.
3. Move staff grants; keep NuraWell `iam_*` read-only for one release, then drop.
Risks: two DBs to keep consistent during dual-run; extra env secret on Vercel; free-tier pause if keepalive fails (restore is manual); hub latency for cross-DB reads.

## שלב 1 — רישום מודולים ורישוי מרכזי (מיגרציות 000003–000004)

- הקטלוג, מצבי המודולים, הרישיונות והחסימות נשמרים עכשיו ב-`central` (סכמה פרטית, RLS כפוי, ללא anon, יומן ביקורת על כל שינוי).
- גישה רק דרך פונקציות `public.central_*` עם service_role.
- **הפעלה:** להגדיר ב-Vercel את `CENTRAL_SUPABASE_URL` ואת `CENTRAL_SUPABASE_SECRET_KEY` (רגיש). בלי המשתנים האלה ה-Hub ממשיך לקרוא מה-DB של NuraWell.
- המוצר לדוגמה (`apps/sample-product`, דרך `@platform/licensing/product`) נרשם, מקבל טוקן רישיון (עד מועד החיוב הבא + 3 ימי חסד), בודק קובץ סטטוס חתום כל 2 דקות, וננעל אחרי 6 שעות בלי קובץ מאומת.
- ידוע: שינוי מצב מודול מה-Hub עדיין נכתב ל-DB של NuraWell (רק הקריאה עברה).
