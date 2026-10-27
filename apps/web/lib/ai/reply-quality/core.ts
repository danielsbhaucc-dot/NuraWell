/**
 * Almog post-send reply quality check — pure logic (prompt, verdict parsing, guardrails).
 * Runs only after the reply was streamed and persisted (zero added latency); see ./run.ts.
 */
import { applyPiiDetectors } from '../privacy/pii-patterns';
import { maskName, unmaskName } from '../privacy/name-mask';
import { isHealthChatMessage, isRedactedContent } from '@/lib/module-api/privacy-retention/lib-privacy-health-chat-redaction';

export const REPLY_QC_FEATURE = 'almog_reply_qc';
/**
 * Cheap + fast tier on OpenRouter: $0.25 / $1.50 per 1M tokens in/out (~$0.00014 per check, measured).
 * gemini-2.5-flash-lite is ~3x cheaper but produced garbled/NUL-byte fixes in Hebrew — rejected.
 */
export const REPLY_QC_MODEL = 'google/gemini-3.1-flash-lite';
/** Only edit a reply that is at most this old (ms since it was stored). */
export const REPLY_QC_MAX_AGE_MS = 60_000;
export const REPLY_QC_TIMEOUT_MS = 8_000;
export const REPLY_QC_DEFAULT_DAILY_CAP_USD = 1;

export type ReplyQcGender = 'male' | 'female' | null | undefined;

export type ReplyQcInput = {
  reply: string;
  lastUserText: string;
  /** up to the last 2 earlier Almog replies, oldest first */
  previousReplies: string[];
  gender: ReplyQcGender;
  healthConsentOff: boolean;
};

export type ReplyQcSkipReason =
  | 'empty'
  | 'too_short'
  | 'too_long'
  | 'redacted_turn'
  | 'health_gate'
  | 'crisis';

/** Decide whether the check may run at all. Fail closed on anything health-gated. */
export function replyQcSkipReason(input: ReplyQcInput & { crisis?: boolean }): ReplyQcSkipReason | null {
  const reply = input.reply.trim();
  if (!reply) return 'empty';
  if (input.crisis) return 'crisis';
  if (reply.length < 25) return 'too_short';
  if (reply.length > 2500) return 'too_long';
  const ctx = [input.lastUserText, ...input.previousReplies, reply];
  if (ctx.some((t) => isRedactedContent(t))) return 'redacted_turn';
  if (input.healthConsentOff && ctx.some((t) => isHealthChatMessage(t))) return 'health_gate';
  return null;
}

function genderLine(g: ReplyQcGender): string {
  if (g === 'female') return 'User gender: female. Almog must address her in feminine singular. Slash forms (את/ה, מוכן/ה, רוצה/ה) are a defect.';
  if (g === 'male') return 'User gender: male. Almog must address him in masculine singular. Slash forms (את/ה, מוכן/ה) are a defect.';
  return 'User gender: unknown. Do not change gender forms; slash forms like את/ה are still a defect (rephrase neutrally).';
}

export const REPLY_QC_SYSTEM = `You are a strict but minimal Hebrew copy-editor for "אלמוג", a warm, friendly Hebrew-speaking coach chatbot.
Almog is MALE: when he speaks about himself he always uses masculine forms ("אני שומע", "אני מבין", "שמח") — never change those. Gender rules apply ONLY to words addressing the user.
Review ONLY the LATEST reply. Flag it only for CLEAR defects:
1. It repeats (near-verbatim) a sentence or the core message of a previous Almog reply.
2. Cold / bureaucratic tone (e.g. "אסור לי", "כללי השירות קובעים", "המערכת לא מאפשרת").
3. Wrong gender form for the user, or slash forms.
4. It contradicts itself or a previous Almog reply.
5. Broken or cut-off text (ends mid-sentence/word, garbled words, mixed-up language).
6. Dietitian-like advice (diet plans, calorie/portion prescriptions) or specific weight numbers.
If there is no clear defect, answer {"ok":true}. Style preferences are NOT defects. When unsure: {"ok":true}.
If there is a defect, answer {"ok":false,"fixed":"<the full corrected reply>"} with the SMALLEST possible edit:
change or remove only the defective words/sentence; keep everything else verbatim (wording, emojis, line breaks, markdown,
and any tokens like [NAME] or ⟦...⟧ exactly). Never add new content, advice, facts or numbers. Hebrew only. JSON only.`;

/**
 * Privacy: before the QC call, mask the user's first name as [NAME] and every PII match
 * (same detectors as notifications) as ⟦P1⟧, ⟦P2⟧… The model is told to keep tokens verbatim;
 * restore() puts the real values back into the fixed text.
 */
export function maskReplyQcInput(
  input: ReplyQcInput,
  firstName?: string | null
): { masked: ReplyQcInput; restore: (text: string) => string } {
  const values: string[] = [];
  const mask = (t: string) =>
    applyPiiDetectors(maskName(t ?? '', firstName), (v) => {
      let i = values.indexOf(v);
      if (i < 0) i = values.push(v) - 1;
      return `⟦P${i + 1}⟧`;
    });
  const masked: ReplyQcInput = {
    ...input,
    reply: mask(input.reply),
    lastUserText: mask(input.lastUserText),
    previousReplies: input.previousReplies.map(mask),
  };
  const restore = (text: string) =>
    unmaskName(text.replace(/⟦P(\d+)⟧/g, (m, n) => values[Number(n) - 1] ?? m), firstName);
  return { masked, restore };
}

export function buildReplyQcMessages(input: ReplyQcInput): Array<{ role: 'system' | 'user'; content: string }> {
  const prev = input.previousReplies.slice(-2);
  const parts = [
    genderLine(input.gender),
    prev.length ? prev.map((p, i) => `PREVIOUS ALMOG REPLY ${i + 1}:\n${p}`).join('\n\n') : 'PREVIOUS ALMOG REPLIES: none',
    `LAST USER MESSAGE:\n${input.lastUserText || '(none)'}`,
    `LATEST ALMOG REPLY (review this):\n${input.reply}`,
  ];
  return [
    { role: 'system', content: REPLY_QC_SYSTEM },
    { role: 'user', content: parts.join('\n\n') },
  ];
}

export type ReplyQcVerdict = { ok: true } | { ok: false; fixed: string };

/** Strict parse; anything unexpected → null (= do nothing). */
export function parseReplyQcVerdict(raw: string): ReplyQcVerdict | null {
  let s = String(raw ?? '').trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) s = fence[1]!.trim();
  // some cheap models append junk after the object in JSON mode → take the first balanced object
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let end = -1;
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  s = s.slice(start, end + 1);
  try {
    const j = JSON.parse(s) as { ok?: unknown; fixed?: unknown };
    if (j.ok === true) return { ok: true };
    if (j.ok === false && typeof j.fixed === 'string' && j.fixed.trim()) return { ok: false, fixed: j.fixed };
    return null;
  } catch {
    return null;
  }
}

/** Levenshtein distance (bounded inputs: replies ≤ 2500 chars). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j += 1) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length]!;
}

const TOKEN_RE = /⟦[^⟧]*⟧|\[[A-Z][A-Z0-9_]*\]/g;
const WEIGHT_NUM_RE = /\d+(?:[.,]\d+)?\s*(?:ק["״']?ג|קילו|kg|קלוריות|kcal)/i;

export type ReplyQcRejectReason =
  | 'unchanged'
  | 'length_change'
  | 'too_many_changes'
  | 'tokens_changed'
  | 'adds_numbers'
  | 'adds_health'
  | 'garbled'
  | 'not_hebrew';

/** Guardrails on the proposed fix: small edits only, nothing new introduced. */
export function validateReplyQcFix(
  original: string,
  fixedRaw: string,
  opts: { healthConsentOff: boolean }
): { ok: true; fixed: string } | { ok: false; reason: ReplyQcRejectReason } {
  const o = original.trim();
  const f = fixedRaw.trim();
  if (!f || f === o) return { ok: false, reason: 'unchanged' };
  // length: may shrink up to 40% (removing a repeated/bad sentence), grow at most 15%
  if (f.length < o.length * 0.6 || f.length > o.length * 1.15 + 10) return { ok: false, reason: 'length_change' };
  const dist = editDistance(o, f);
  if (dist > Math.max(30, Math.round(o.length * 0.4))) return { ok: false, reason: 'too_many_changes' };
  const tok = (s: string) => (s.match(TOKEN_RE) ?? []).sort().join('|');
  if (tok(o) !== tok(f)) return { ok: false, reason: 'tokens_changed' };
  const digits = (s: string) => (s.match(/\d/g) ?? []).length;
  if (digits(f) > digits(o) || (WEIGHT_NUM_RE.test(f) && !WEIGHT_NUM_RE.test(o))) return { ok: false, reason: 'adds_numbers' };
  if (opts.healthConsentOff && isHealthChatMessage(f) && !isHealthChatMessage(o)) return { ok: false, reason: 'adds_health' };
  // garbled output guard: new double spaces or orphan single letters that weren't there
  const orphans = (x: string) => (x.match(/(?:^|\s)[\u05D0-\u05EA](?=\s|$)/g) ?? []).length;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/.test(f)) return { ok: false, reason: 'garbled' };
  if ((f.includes('  ') && !o.includes('  ')) || orphans(f) > orphans(o)) return { ok: false, reason: 'garbled' };
  const heb = (f.match(/[\u0590-\u05FF]/g) ?? []).length;
  const lat = (f.match(/[A-Za-z]/g) ?? []).length;
  if (heb < lat) return { ok: false, reason: 'not_hebrew' };
  return { ok: true, fixed: f };
}

/** Feature flag: default ON in code, env kill-switch ALMOG_REPLY_QC=0|off|false. */
export function replyQcEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.ALMOG_REPLY_QC ?? '').trim().toLowerCase();
  if (v === '0' || v === 'off' || v === 'false') return false;
  if (v === '1' || v === 'on' || v === 'true') return true;
  return REPLY_QC_DEFAULT_ON;
}
/** Flipped only after the measurement gate passed (see PR). */
export const REPLY_QC_DEFAULT_ON = true;

export function replyQcDailyCapUsd(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.ALMOG_REPLY_QC_DAILY_USD);
  return Number.isFinite(n) && n >= 0 ? n : REPLY_QC_DEFAULT_DAILY_CAP_USD;
}
