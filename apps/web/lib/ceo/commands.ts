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

export function commandsManifest(): string {
  return [
    ...GIDEON_COMMANDS.map((c) => `• ${[c.cmd, ...c.aliases].join(' / ')}: ${c.he}`),
    ...NATURAL.map((n) => `• ${n}`),
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
