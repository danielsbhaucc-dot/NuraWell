/**
 * Live chat redaction for users without an active health-data consent.
 * Deterministic and local: the text is never sent to any model/provider to classify it,
 * and is never logged. Ambiguous messages are treated as health (fail closed).
 */
import { isHealthText } from './health-text';

export const REDACTED_PLACEHOLDER = 'ההודעה נמחקה על ידי אלמוג';
export const REDACTION_REASON = 'מידע בריאותי — אין הסכמה לשמירה';
export const REDACTED_CONTENT = `${REDACTED_PLACEHOLDER} · ${REDACTION_REASON}`;

const NUMERIC_HEALTH_RE =
  /\d+(?:[.,]\d+)?\s*(?:ק["״']?ג|קילו|קג|kg|kilo|lbs?|ס["״']?מ|cm|קלוריות|kcal|cal\b|מ["״']?ג|mg|יחידות\s*אינסולין|mmhg)/i;
const EXTRA_HEALTH_RE =
  /(שוקל|שוקלת|משקל|השמנ|רזי|דיאט|BMI|לחץ\s*דם|סוכר(?:ת)?|כולסטרול|תרופ|כדור(?:ים)?\s*(?:ל|נגד)|אבחנ|אבחו|רופא|בדיק(?:ת|ות)\s*דם|הריון|מחזור|ניתוח|מחל[הת]|כאב|אלרגי|צליאק|קלוריות|גרם\s*(?:חלבון|פחמימ)|blood\s*pressure|diabet|cholesterol|medication|diagnos|pregnan|surgery|allerg|calorie|weigh)/i;

export function isHealthChatMessage(text: string): boolean {
  const t = String(text ?? '');
  if (!t.trim()) return false;
  return NUMERIC_HEALTH_RE.test(t) || EXTRA_HEALTH_RE.test(t) || isHealthText(t);
}

export function isRedactedContent(text: unknown): boolean {
  return typeof text === 'string' && text.startsWith(REDACTED_PLACEHOLDER);
}

/**
 * Almog's reply — never echoes the content. Warm, short, gender-matched, no slash forms.
 * `variant` = number of redaction notices already stored in this session (server-side count).
 * - variant 0 (first notice in the session): calmly says the message was deleted because there is
 *   no explicit consent ("ללא הסכמה מפורשת"), one line on why (privacy) and how (settings / ask Almog).
 * - variant ≥ 1: no consent mention at all — short, warm, rotating, encourages habits/tasks/plan.
 */
export function almogRedactionReply(gender: string | null | undefined, opts: { variant?: number } = {}): string {
  const f = gender === 'female';
  const m = gender === 'male';
  const g = (fem: string, mas: string, neu: string) => (f ? fem : m ? mas : neu);
  const n = Math.max(0, Math.floor(opts.variant ?? 0));
  if (n === 0) {
    return [
      'אני שומע אותך, ואני כאן איתך 💛',
      'את ההודעה מחקתי, כי מידע בריאותי אני לא שומר ללא הסכמה מפורשת ממך.',
      `זה נועד להגן על הפרטיות שלך, ואם ${g('תרצי', 'תרצה', 'זה מתאים')}, אפשר לאשר בהגדרות או פשוט לבקש ממני.`,
      `בינתיים, ${g('ספרי לי', 'ספר לי', 'אשמח לשמוע')} מה הולך טוב השבוע בתוכנית שלך?`,
    ].join(' ');
  }
  const followUps = [
    [
      'גם את זה מחקתי, כדי לשמור על הפרטיות שלך 💛',
      `${g('בואי נמשיך', 'בוא נמשיך', 'אפשר להמשיך')} עם התוכנית: איזו משימה מהיום הכי קל לסמן עכשיו?`,
    ],
    [
      'ההודעה הזאת נמחקה, ואני כאן איתך.',
      `${g('ספרי לי', 'ספר לי', 'אשמח לשמוע')} על ההרגלים שלך: מה עבד הכי טוב בשגרה השבוע?`,
    ],
    [
      'שמרתי על הפרטיות שלך, וההודעה נמחקה.',
      `מה ההרגל הקטן הבא ש${g('היית רוצה', 'היית רוצה', 'כדאי')} להוסיף לתוכנית? אני ${g('איתך', 'איתך', 'כאן')} בזה 🌱`,
    ],
  ];
  return followUps[(n - 1) % followUps.length].join(' ');
}

/** System-prompt block for users without consent. */
export const HEALTH_CONSENT_OFF_PROMPT = `\n[הסכמה למידע בריאותי: לא פעילה]
- אל תדון, תשאל, תסיק, תזכור או תתעד מידע בריאותי: משקל, מדדים, תזונה ודיאטות, דפוסי אכילה (כולל אכילה רגשית), דימוי גוף, מצב רפואי או נפשי, תרופות.
- אל תשתמש בשום מידע בריאותי מהעבר.
- כשהשיחה נוגעת בזה: תגובה חמה ואנושית, 2–3 משפטים. הכר ברגש באמפתיה בלי להיכנס לתוכן, ובחום הזמן אותו לדבר על ההרגלים והתוכנית שלו ב-NuraWell (המשימות, השגרה, המטרות, מה הולך טוב השבוע), תוך שימוש בהקשר של השיחה.
- אל תציע הסכמה ואל תזכיר אותה ביוזמתך — אפס לחץ (ההודעה האוטומטית הראשונה בשיחה כבר הסבירה זאת פעם אחת).
- שאלות על ההסכמה עצמה ("הסכמה של מה?", "למה?", "מי קבע?", "זה מעיק") הן לא מידע בריאותי — רק כשהוא שואל, ענה באמת, בחום ובניסוח משתנה: זה כדי להגן עליו, מידע בריאותי רגיש במיוחד לפי חוק הגנת הפרטיות, ההחלטה רק שלו, ואם ירצה אפשר להפעיל אותה בהגדרות או לבקש ממך. אחר כך חזור בטבעיות להרגלים ולתוכנית.
- אסור להשתמש ב"אסור לי", "כללי השירות קובעים", "אני לא יכול לגעת בנושא" או בכל ניסוח ביורוקרטי; אל תאשים חוקים. אל תחזור על אותו משפט או אותה הצעה פעמיים בשיחה — גוון והתייחס להקשר.
- פנה למשתמש לפי המגדר שלו, בלי לוכסנים.`;

type Msg = { role?: string; parts?: Array<{ type?: string; text?: string }>; content?: unknown };

/** Replaces health content in any incoming user message (client history resend / crafted bodies). */
export function sanitizeIncomingMessages<T extends Msg>(messages: T[]): { messages: T[]; redacted: number } {
  let redacted = 0;
  const out = messages.map((m) => {
    if (m.role !== 'user') return m;
    const text =
      typeof m.content === 'string'
        ? m.content
        : (m.parts ?? []).filter((p) => p.type === 'text').map((p) => p.text ?? '').join('\n');
    if (isRedactedContent(text) || !isHealthChatMessage(text)) return m;
    redacted++;
    return { ...m, content: typeof m.content === 'string' ? REDACTED_CONTENT : m.content, parts: [{ type: 'text', text: REDACTED_CONTENT }] } as T;
  });
  return { messages: out, redacted };
}

type InsertRow = { user_id: string; session_id: string; role: 'user' | 'assistant'; content: string; metadata?: Record<string, unknown> };

/**
 * Persists ONLY the placeholder + Almog's notice and returns his reply.
 * The original text is not a parameter here on purpose — it cannot reach storage or logs.
 */
export async function respondWithHealthRedaction(p: {
  supabase: unknown;
  admin: { from: (t: string) => unknown };
  userId: string;
  sessionId: string;
  debugId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ensureSession: (sb: any, a: { sessionId: string; userId: string }) => Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert: (sb: any, row: InsertRow) => Promise<void>;
}): Promise<Response> {
  let gender: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (p.admin.from('profiles') as any).select('gender').eq('id', p.userId).maybeSingle();
    gender = (data as { gender?: string | null } | null)?.gender ?? null;
  } catch {
    /* neutral wording */
  }
  let priorNotices = 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (p.admin.from('ai_interactions') as any)
      .select('id', { count: 'exact', head: true })
      .eq('session_id', p.sessionId)
      .eq('user_id', p.userId)
      .contains('metadata', { redaction_notice: true });
    priorNotices = Number(count ?? 0);
  } catch {
    /* treat as first notice */
  }
  const reply = almogRedactionReply(gender, { variant: priorNotices });
  try {
    await p.ensureSession(p.supabase, { sessionId: p.sessionId, userId: p.userId });
    await p.insert(p.supabase, {
      user_id: p.userId, session_id: p.sessionId, role: 'user', content: REDACTED_CONTENT,
      metadata: { redacted: true, reason: 'health_consent_inactive' },
    });
    await p.insert(p.supabase, {
      user_id: p.userId, session_id: p.sessionId, role: 'assistant', content: reply,
      metadata: { redaction_notice: true },
    });
  } catch {
    console.warn('[ai/chat]', { debug_id: p.debugId, stage: 'health_redaction_persist_failed' });
  }
  return new Response(reply, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'x-session-id': p.sessionId,
      'x-debug-id': p.debugId,
      'x-ai-writer': 'health-redaction',
      'x-almog-redacted': '1',
    },
  });
}
