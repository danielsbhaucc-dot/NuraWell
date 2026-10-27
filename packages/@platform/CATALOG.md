# Module catalog

| id | package | version | distribution | one-liner |
|---|---|---|---|---|
| access | @platform/access | 0.1.0 | shareable | כללים שמחליטים מתי מנהל רשאי לראות מידע אישי של משתמש: רק עם סיבה כתובה, לזמן קצר, ועם רישום |
| ai-engine | @platform/ai-engine | 0.1.0 | shareable | שכבה אחת שדרכה כל מוצר שולח בקשות למודל AI |
| auth | @platform/auth | 0.1.0 | shareable | בודק מי המשתמש המחובר והאם הוא שייך למוצר |
| iam | @platform/iam | 0.1.0 | shareable | קובע מי רשאי לעשות מה, בכל מוצר בנפרד |
| licensing | @platform/licensing | 0.2.0 | shareable | מוכרים מודול במנוי חודשי: הוא מגיע נעול, עובד רק עם רישיון בתוקף, ואפשר לחסום או לשחרר אותו בלחיצה |
| module-library-ui | @platform/module-library-ui | 0.2.0 | internal | לוח הבקרה הראשי בסגנון Finder: כל המוצרים בצד, סקירה, ספריית הרכיבים, הפעלה וכיבוי לכל מוצר, שיתוף ומכירה של רכיב |
| qc | @platform/qc | 0.1.0 | shareable | מסך אחד שמראה אם המוצר תקין: כל מוצר מגדיר בדיקות, והמודול מריץ אותן ומציג תקין, אזהרה או תקלה |
| security-crypto | @platform/security-crypto | 0.1.0 | shareable | מצפין מידע רגיש במסד |
| ui | @platform/ui | 0.1.0 | internal | פלטת הצבעים והמשטחים של NuraWell במקום אחד, כך שכל מוצר חדש נראה עקבי |

## App-area modules (NuraWell app, `modules/<id>/`)

- a11y: Accessibility preferences and tools (behavior unchanged)
- agent: The Almog agent engine: chat, routing, prompts, memory, safety, voice
- alerts: Security and ops alerting
- app-shell: App shell: layout, navigation, shared UI, data clients, loading/error/404
- audit-log: Append-only audit trail and session-trail sealing
- auth-signup: Sign-up, login, onboarding and profile settings
- billing: Subscriptions, perpetual licenses, plans and module gating
- costs: AI and infra cost tracking and caps
- field-encryption: Field-level PII encryption and backfill
- gideon: Gideon, the owner's CEO bot
- iam: Permissions and the console shell: roles, module toggles, product picker, admin/ops screens
- incident-response: Incident response: security events, lockdown, CEO security view
- journey: Journey, guides, challenge, course and tasks
- legal: Terms, legal evidence and anchoring
- logs: Structured logs, error capture and retention
- notifications: Event-driven email, Telegram, WhatsApp and push
- privacy-retention: Consents, retention, export and deletion (never without approval)
- qc: Quality-control checks screen
- reminders: Reminders, follow-ups and re-engagement with stale-expiry
- security-core: Security core: step-up 2FA, trusted-device approval, key backup, nightly security scan, demo access
- site-content: Site content, media library, storage and CDN

## fx-* modules (repo: platform-core)
Visual effects owned by the parent-site workstream (particle words, torch reveal, horizontal reel, encryption demo, a11y switch, chat demo, Finder console). Same schema, `repo: platform-core`, tagged `@platform/fx-<name>@<version>` there; a product pulls them the same way as LIBRARY.md 'Other repo'.
