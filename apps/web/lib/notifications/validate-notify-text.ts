/**
 * Quality gate for LLM-generated notification text (Almog voice, Hebrew).
 *
 * Root causes this guards against (observed in prod-like runs):
 *  - truncated replies accepted when finish_reason === 'length' (reasoning tokens ate the budget)
 *  - reasoning/thinking leakage ("<think>", "We need to…", analysis in English)
 *  - gibberish at high temperature: Latin/CJK/Cyrillic runs, repeated tokens, broken words
 *  - meta/JSON/markdown wrappers instead of the message itself
 *  - Almog speaking about himself in the feminine ("אני מבינה")
 *
 * Returns a cleaned string or a rejection reason, so callers can retry / fall back.
 */
import { truncateAtWordBoundary } from '../text/truncate-graphemes';

export type NotifyValidation =
  | { ok: true; text: string }
  | { ok: false; reason: string };

export type NotifyValidateOptions = {
  finishReason?: string | null;
  /** final max length (graphemes) — cut at a sentence/word boundary, never mid-word */
  maxChars?: number;
  minChars?: number;
};

const HEBREW = /[\u0590-\u05FF]/g;
const LATIN_WORD = /[A-Za-z]{2,}/g;
const FOREIGN_SCRIPT = /[\u0400-\u04FF\u0600-\u06FF\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;
/** allowed Latin tokens inside Hebrew text (brand / common chat words) */
const LATIN_ALLOW = new Set(['nurawell', 'ok', 'app', 'ai', 'sos', 'pdf', 'wow', 'ok!']);
/** feminine first-person self-reference by Almog (he is male) */
const ALMOG_FEMININE_SELF =
  /(?:^|[\s,.!?"'״])אני\s+(?:ממש\s+|כל\s+כך\s+|לגמרי\s+)?(?:מבינה|שמחה|בטוחה|יודעת|חושבת|מרגישה|מאמינה|סקרנית|זמינה|אוהבת|גאה\s+בך\s+ושמחה)(?=[\s,.!?…]|$)/u;

export function stripReasoningArtifacts(raw: string): string {
  let t = raw ?? '';
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '');
  t = t.replace(/<\/?(?:think|analysis|final|answer)>/gi, '');
  t = t.replace(/^```[a-z]*\s*|```$/gim, '');
  t = t.replace(/^\s*(?:final(?: answer)?|answer|הודעה|תשובה|טקסט)\s*[:：]\s*/i, '');
  t = t.trim().replace(/^["'״׳`]+|["'״׳`]+$/g, '').trim();
  return t;
}

/** cut to maxChars preferring the last full sentence; otherwise a word boundary with … */
export function truncateNotifyText(text: string, maxChars: number): string {
  const t = text.trim();
  if ([...t].length <= maxChars) return t;
  const head = truncateAtWordBoundary(t, maxChars).replace(/…$/u, '').trimEnd();
  const m = head.match(/^[\s\S]*[.!?](?=\s|$)/u);
  if (m && [...m[0]].length >= Math.floor(maxChars * 0.5)) return m[0].trim();
  return head.replace(/[\s,;:\-–—]+$/u, '').replace(/…?$/, '…');
}

export function validateNotifyText(raw: string, opts: NotifyValidateOptions = {}): NotifyValidation {
  const minChars = opts.minChars ?? 12;
  const maxChars = opts.maxChars ?? 320;
  if (opts.finishReason === 'length') return { ok: false, reason: 'truncated (finish_reason=length)' };

  let text = stripReasoningArtifacts(raw).replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if ([...text].length < minChars) return { ok: false, reason: `too short (${text.length})` };
  if (/^[{[]/.test(text)) return { ok: false, reason: 'json/structured output' };
  if (FOREIGN_SCRIPT.test(text)) return { ok: false, reason: 'foreign script' };
  if (/\uFFFD/.test(text)) return { ok: false, reason: 'encoding replacement char' };

  const hebrewCount = (text.match(HEBREW) ?? []).length;
  const latinWords = (text.match(LATIN_WORD) ?? []).filter((w) => !LATIN_ALLOW.has(w.toLowerCase()));
  const latinChars = latinWords.join('').length;
  if (hebrewCount < 8) return { ok: false, reason: 'not Hebrew' };
  if (latinWords.length > 3 || latinChars > hebrewCount * 0.15) {
    return { ok: false, reason: `too much Latin (${latinWords.slice(0, 4).join(' ')})` };
  }
  if (/\b(?:we need|the user|let's|analysis|assistant|in hebrew|respond)\b/i.test(text)) {
    return { ok: false, reason: 'reasoning leakage' };
  }
  // repeated token loops ("מה מה מה מה", "!!!!!!!!")
  if (/(\S{2,})(?:\s+\1){3,}/u.test(text) || /([^\s\p{Extended_Pictographic}])\1{5,}/u.test(text)) {
    return { ok: false, reason: 'repetition loop' };
  }
  // a Hebrew "word" absurdly long without spaces = garbage
  if (/[\u0590-\u05FF]{18,}/.test(text)) return { ok: false, reason: 'garbled word' };
  if (ALMOG_FEMININE_SELF.test(text)) return { ok: false, reason: 'Almog feminine self-reference' };
  if (/\[(?:PERSON_NAME|USER_FIRST_NAME|FIRST_NAME|שם|Task|TASK|task|משימה)\]|\{\{|\}\}/i.test(text)) {
    return { ok: false, reason: 'unresolved placeholder' };
  }

  text = truncateNotifyText(text, maxChars);
  return { ok: true, text };
}
