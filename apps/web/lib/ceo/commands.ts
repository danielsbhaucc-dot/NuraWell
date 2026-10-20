/**
 * Single source of truth for Gideon's deterministic Telegram commands (handled in webhook.ts before the AI).
 * Used for: the AI system prompt (so it never denies a capability that exists) and slash-typo suggestions.
 */
export type GideonCommand = { cmd: string; aliases: string[]; he: string; callback?: string };

export const GIDEON_COMMANDS: GideonCommand[] = [
  { cmd: '/start', aliases: [], he: 'ברכת פתיחה' },
  { cmd: '/סימולציה', aliases: ['/simulate'], he: 'מצב סימולציית זר ל-30 דקות (גם בשפה חופשית: "תעשה לי סימולציה"). יציאה: "אני מוותר" או "סיום סימולציה"', callback: 'ceo:sim:start' },
  { cmd: '/lock', aliases: ['/kill'], he: 'מתג כיבוי: מכבה את גדעון ומבטל פעולות ממתינות (גם "תכבה את עצמך"). הפעלה מחדש רק מ-Ops ← גדעון ← אבטחה עם Face ID' },
];

/** Natural-language commands that are handled in code, not by tools. */
const NATURAL = [
  'בקשת מכשיר: "החלפתי טלפון" / "נגנב לי" / "איבדתי" פותחים בקשת אישור מכשיר בלוח הבקרה',
  'כפתור "זה לא אני" באישורי התחברות ל-Ops עובד גם כשגדעון כבוי',
];

/**
 * Product capabilities Gideon must know (built features). He explains them and points to the exact Ops place;
 * write actions go only through his existing tools as drafts/owner tasks needing Daniel's approval.
 */
export type GideonCapability = { id: string; he: string; ops: string; tool?: string };
export const GIDEON_CAPABILITIES: GideonCapability[] = [
  { id: 'media_provenance', he: 'מקור מדיה וזכויות: לכל תמונה, שיר, וידאו, אייקון ופונט נרשם מקור (CC0, AI, קוד שלנו, העלאה), hash, היסטוריית git ושימושים, ברשומה חתומה עם חותמת זמן', ops: '/ops/legal?tab=media', tool: 'legal_overview' },
  { id: 'pending_licenses', he: 'רישיונות ממתינים: פריט בלי קבלה (למשל "כוס לפני האוכל" ב-Suno) מופיע ככרטיס פתוח עם כפתור העלאת קבלה; העלאה אחת שומרת ראיה קבועה ומסמנת רישיון מאושר', ops: '/ops/legal?tab=media', tool: 'legal_overview' },
  { id: 'receipts_inbound', he: 'קבלות מנויים: מיילים שמועברים ל-receipts@nurawell.ai נקלטים, מפוענחים (חוקים קודם, AI זול רק כגיבוי), משויכים לספק, מסלול ותקופה ומקושרים אוטומטית למדיה שנוצרה בתקופה. קבלה שלא שויכה מופיעה בכרטיסי הפעולות', ops: '/ops/legal?tab=media#receipts', tool: 'legal_overview' },
  { id: 'legal_search', he: 'חיפוש אחד במשפטי על מדיה, קבלות, רישיונות, הסכמות ו-hash של ראיות, עם קישורי "שייך ל" לשני הכיוונים', ops: '/ops/legal', tool: 'legal_search' },
  { id: 'evidence_export', he: 'כפתור "אני צריך ראיה": מפיק לפי דרישה PDF בעברית ו-ZIP עם הקובץ, hashes, חתימה, RFC3161, OpenTimestamps והוראות אימות; ההפקה נרשמת ביומן גישה ונמחקת אחרי 7 ימים. רק דניאל ב-Ops עם Face ID, גדעון לא מפיק בעצמו', ops: '/ops/legal' },
  { id: 'consent_evidence', he: 'ראיות הסכמה של משתמשים: שרשרת hash, חתימת Ed25519, חותמת זמן ועיגון יומי, עם צילום מסך ותיק ראיה לכל משתמש', ops: '/ops/legal?tab=consent', tool: 'legal_search' },
  { id: 'cookie_notice', he: 'הודעת העוגיות: עיצוב יער כהה עם כותרות 🍪 מתחלפות, נפתחת שוב אוטומטית כשנדרשת הסכמה מחדש', ops: '/ops/privacy' },
  { id: 'face_id_nudge', he: 'Face ID: אחרי התחברות מוצע למשתמשים להגדיר Face ID (passkey); קודי גיבוי רק למנהלים', ops: '/ops/privacy' },
  { id: 'settings_consent_explainer', he: 'בהגדרות: שורת הסבר רגועה על הסכמת מידע בריאותי ואקורדיון "איך זה עובד?" מותאם מגדר', ops: '/ops/privacy' },
  { id: 'almog_reply_qc', he: 'בקרת איכות לתשובות אלמוג: עריכות של תשובות נשמרות ונדגמות לבדיקת איכות בדוחות השבועיים', ops: '/ops/ceo', tool: 'almog_quality_sample' },
];

export function commandsManifest(): string {
  return [
    ...GIDEON_COMMANDS.map((c) => `• ${[c.cmd, ...c.aliases].join(' / ')}: ${c.he}`),
    ...NATURAL.map((n) => `• ${n}`),
    'יכולות במערכת (הסבר והפניה; פעולות כתיבה רק כטיוטה/משימה לאישור דניאל):',
    ...GIDEON_CAPABILITIES.map((c) => `• ${c.he} (Ops: ${c.ops}${c.tool ? `, כלי: ${c.tool}` : ''})`),
  ].join('\n');
}

const norm = (t: string) => t.trim().replace(/@\w+$/, '').toLowerCase();

export function isKnownCommand(text: string): boolean {
  const t = norm(text);
  return GIDEON_COMMANDS.some((c) => [c.cmd, ...c.aliases].some((x) => x.toLowerCase() === t));
}

/** "/סימו" → the /סימולציה command (unique prefix match, at least 2 chars after the slash). */
export function suggestCommand(text: string): GideonCommand | null {
  const t = norm(text);
  if (!/^\/\S{2,}$/.test(t) || isKnownCommand(t)) return null;
  const hits = GIDEON_COMMANDS.filter((c) => [c.cmd, ...c.aliases].some((x) => x.toLowerCase().startsWith(t)));
  return hits.length === 1 ? hits[0] : null;
}
