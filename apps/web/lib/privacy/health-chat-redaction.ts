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

/** Almog's reply — never echoes the content. */
export function almogRedactionReply(gender: string | null | undefined): string {
  const f = gender === 'female';
  const m = gender === 'male';
  const g = (fem: string, mas: string, neu: string) => (f ? fem : m ? mas : neu);
  return [
    `מחקתי את ההודעה הזאת מיד 🙏 ${g('לא נתת', 'לא נתת', 'אין לי')} ${f || m ? 'לי ' : ''}הסכמה לשמירת מידע בריאותי, אז את הנושא הזה אני לא יכול לגעת בו.`,
    'היא באמת נמחקה — לא נשמרה אצלנו בשום מקום ולא עברה הלאה.',
    `אם אי פעם ${g('תרצי', 'תרצה', 'יתאים לך')}, אפשר להפעיל את ההסכמה בהגדרות הפרטיות. בינתיים — ${g('ספרי', 'ספר', 'אפשר לספר')} לי על כל דבר אחר, אני כאן.`,
  ].join('\n');
}

/** System-prompt block for users without consent. */
export const HEALTH_CONSENT_OFF_PROMPT = `\n[הסכמה למידע בריאותי: לא פעילה]
- אסור לך לדון, לשאול, להסיק, לזכור או לתעד שום דבר על משקל, מדדים, תזונה/מעקב אכילה, מצב רפואי, תרופות או בריאות גופנית.
- אם המשתמש פונה לנושא כזה: סרב בעדינות ובתוקף — "בלי הסכמה אני לא יכול לגעת בנושא הזה" — בלי ללחוץ עליו לתת הסכמה ובלי לחזור על מה שכתב.
- אל תשתמש בשום מידע בריאותי מהעבר.`;

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
  const reply = almogRedactionReply(gender);
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
