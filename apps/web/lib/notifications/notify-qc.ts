/**
 * LLM copy-editor for Almog notifications (natural Hebrew, grammar, gender).
 *
 * Runs (1) at generation time, right after the deterministic gate passed, so bad text is fixed
 * before it is stored/pushed, and (2) from the nightly sweep for stored rows the lint flags.
 * Cheap tier (same model as the chat reply QC, ~$0.0001/check), daily USD cap, fail-open
 * (any error → the original text, which already passed validateNotifyText).
 * Privacy: the recipient's first name is masked as [NAME] before the call; nothing else identifying is sent.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { meteredFetch } from '@/lib/ai/usage-meter';
import { REPLY_QC_MODEL, parseReplyQcVerdict, validateReplyQcFix } from '@/lib/ai/reply-quality/core';
import { lintNotifyHebrew, type NotifyGender } from './notify-hebrew-lint';

export const NOTIFY_QC_FEATURE = 'almog_notify_qc';
const NOTIFY_QC_TIMEOUT_MS = 8_000;
const DEFAULT_DAILY_CAP_USD = 0.5;

export function notifyQcEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.ALMOG_NOTIFY_QC ?? '').trim().toLowerCase();
  return !(v === '0' || v === 'off' || v === 'false');
}

export function notifyQcDailyCapUsd(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.ALMOG_NOTIFY_QC_DAILY_USD);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_CAP_USD;
}

function genderLine(g: NotifyGender): string {
  if (g === 'female') return 'Recipient: female. Address her in feminine singular everywhere.';
  if (g === 'male') return 'Recipient: male. Address him in masculine singular everywhere.';
  return 'Recipient gender: unknown. Do not switch gender forms that are already consistent; gendered pet names (אחי, אלוף, אלופה) are a defect; rephrase neutrally. Never use slash forms.';
}

export const NOTIFY_QC_SYSTEM = `You are a native Israeli Hebrew copy-editor for short push notifications written by "אלמוג", a warm, casual male coach (he speaks about himself in masculine).
Light natural slang ("וואלה", "סבבה", "יאללה") is the intended style. Keep it. Fix ONLY clear defects:
1. Grammar: number/noun gender ("שני כוסות" → "שתי כוסות"; "כוס" is feminine), wrong construct state, missing subject that makes it sound broken ("איך מרגיש?" → "איך זה מרגיש?" / "איך אתה מרגיש?").
2. Awkward literal translations or invented phrases no Israeli would say. Examples of the fix: "הזריקת המים" → "שתיית המים"; "תרים 2 כוסות" → "תשתה שתי כוסות"; "השתיים של המים" → "שתי כוסות המים"; "מה תופס אותך" → "מה עובר עליך"; "איזה קצב בעניין?" → "איך זה הולך?"; "איך היה היום בשבילך" → "איך היה לך היום".
3. Wrong or inconsistent gender toward the recipient; slash forms (את/ה).
4. A greeting that uses a name other than [NAME], or two greetings in one message.
5. Elongated words ("דניאללל", "בוקר אורר"), "!!", nonsense or factual mix-ups inside the sentence.
6. Logically broken sentences ("רגע קשה עם הרגע הקשה").
Do not touch correct greetings ("בוקר אור", "וואלה") or anything that is already fine. Keep meaning, length, emojis and tokens like [NAME] exactly. Never add advice, facts or numbers. If it is already natural and correct, answer {"ok":true}. When unsure: {"ok":true}.
Otherwise answer {"ok":false,"fixed":"<the full corrected notification>"}. Hebrew only. JSON only.`;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function maskName(text: string, firstName?: string | null): string {
  const n = firstName?.trim();
  if (!n || n.length < 2) return text;
  return text.replace(new RegExp(escapeRe(n), 'gu'), '[NAME]');
}

export function unmaskName(text: string, firstName?: string | null): string {
  const n = firstName?.trim();
  return n ? text.replace(/\[NAME\]/g, n) : text;
}

let capCache: { day: string; spent: number; at: number } | null = null;

function israelDay(d = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

async function overCap(admin: SupabaseClient | null): Promise<boolean> {
  const cap = notifyQcDailyCapUsd();
  if (cap <= 0) return true;
  const day = israelDay();
  if (capCache && capCache.day === day && Date.now() - capCache.at < 60_000) return capCache.spent >= cap;
  if (!admin) return capCache ? capCache.day === day && capCache.spent >= cap : false;
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data, error } = await admin.from('ai_usage_events').select('cost_usd').eq('feature', NOTIFY_QC_FEATURE).gte('created_at', since).limit(20000);
  if (error) return false;
  const spent = (data ?? []).reduce((s, r) => s + Number((r as { cost_usd?: number }).cost_usd ?? 0), 0);
  capCache = { day, spent, at: Date.now() };
  return spent >= cap;
}

export type NotifyQcResult = { text: string; status: 'ok' | 'edited' | 'rejected' | 'no_verdict' | 'disabled' | 'cap' | 'error' };

/**
 * Review one notification body. Returns the (possibly) corrected text; never throws.
 */
export async function qcNotifyText(
  text: string,
  opts: { firstName?: string | null; gender?: NotifyGender; userId?: string | null; admin?: SupabaseClient | null; fetchImpl?: typeof fetch }
): Promise<NotifyQcResult> {
  try {
    if (!notifyQcEnabled()) return { text, status: 'disabled' };
    const key = process.env.OPENROUTER_API_KEY?.trim();
    if (!key) return { text, status: 'disabled' };
    if (await overCap(opts.admin ?? null)) return { text, status: 'cap' };
    const masked = maskName(text, opts.firstName);
    const f = opts.fetchImpl ?? meteredFetch(fetch, { userId: opts.userId ?? null, feature: NOTIFY_QC_FEATURE });
    const res = await f('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(NOTIFY_QC_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: REPLY_QC_MODEL,
        reasoning: { effort: 'minimal', exclude: true },
        temperature: 0,
        max_tokens: Math.min(600, Math.ceil(masked.length / 1.5) + 80),
        response_format: { type: 'json_object' },
        usage: { include: true },
        messages: [
          { role: 'system', content: NOTIFY_QC_SYSTEM },
          { role: 'user', content: `${genderLine(opts.gender)}\n\nNOTIFICATION:\n${masked}` },
        ],
      }),
    });
    if (!res.ok) return { text, status: 'error' };
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { cost?: number } };
    if (capCache && typeof j.usage?.cost === 'number') capCache.spent += j.usage.cost;
    const verdict = parseReplyQcVerdict(j.choices?.[0]?.message?.content ?? '');
    if (!verdict) return { text, status: 'no_verdict' };
    if (verdict.ok) return { text, status: 'ok' };
    const v = validateReplyQcFix(masked, verdict.fixed, { healthConsentOff: false });
    if (!v.ok) return { text, status: 'rejected' };
    const fixed = unmaskName(v.fixed, opts.firstName);
    const lint = lintNotifyHebrew(fixed, { firstName: opts.firstName, gender: opts.gender });
    if (lint.issues.length) return { text, status: 'rejected' };
    return { text: lint.text, status: 'edited' };
  } catch {
    return { text, status: 'error' };
  }
}
