/**
 * Optional cheap-model context condenser (flag ALMOG_CONTEXT_CONDENSER=1, default OFF).
 *
 * The router + vector RAG already choose WHICH memory blocks enter the prompt. This step
 * condenses only the bulky "recall" sections (vector memories, dossier, cross-session
 * summaries) into a short brief. Everything else — safety/crisis, commitments, turn
 * signals, time, notifications, core state — is passed through untouched.
 *
 * Fail-safe: any error, timeout, empty or suspiciously short brief → original sections.
 * The outbound call goes through meteredFetch, which applies the same PII guard as chat.
 */
export type CondenseCall = (prompt: { system: string; user: string }, signal: AbortSignal) => Promise<string>;

export function contextCondenserEnabled(): boolean {
  return process.env.ALMOG_CONTEXT_CONDENSER === '1';
}

/** Sections the condenser may rewrite. Identified by the block's own header. */
const CONDENSABLE = [/^\[?זיכרונות רלוונטיים/, /^## ?זיכרון/, /^\[?תיק[ -]משתמש/, /^\[?סיכומי שיחות/, /dossier/i];
/** Never touched, even if a header pattern matches. */
const PROTECTED = /משבר|חירום|פגיעה עצמית|אובדנ|בטיחות|crisis|safety|סיכון/i;

export function isCondensable(section: string): boolean {
  const head = section.slice(0, 120);
  return !PROTECTED.test(section) && CONDENSABLE.some((r) => r.test(head.trim()));
}

/** Neutral delimiters + one-line instruction: background for the writer, never text to quote. */
export const CONDENSED_OPEN = '<<<רקע פנימי — לשימושך בלבד, אל תצטט ואל תעתיק ניסוח, כותרת או נקודות מכאן>>>';
export const CONDENSED_CLOSE = '<<<סוף רקע>>>';

const SYSTEM = `You prepare a context brief for a health coach. From the memory blocks, keep ONLY what helps answer the user's current message: active difficulties/blockers, recent successes and failures, commitments, relevant facts and dates. Hebrew, bullet points, max 120 words. Never invent. If unsure whether something matters, keep it.`;

export async function condenseContextSections(params: {
  sections: string[];
  userMessage: string;
  call: CondenseCall;
  timeoutMs?: number;
  minCondensableChars?: number;
  /** Caller-provided identity check (preferred over header matching). */
  condensable?: (section: string) => boolean;
}): Promise<{ sections: string[]; condensed: boolean; reason: string; savedChars: number }> {
  const { sections } = params;
  const idx = sections.map((s, i) => ((params.condensable ? params.condensable(s) && !PROTECTED.test(s) : isCondensable(s)) ? i : -1)).filter((i) => i >= 0);
  const raw = idx.map((i) => sections[i]!).join('\n\n');
  if (raw.length < (params.minCondensableChars ?? 1500)) {
    return { sections, condensed: false, reason: 'too_small', savedChars: 0 };
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), params.timeoutMs ?? 700);
  try {
    const brief = (
      await Promise.race([
        params.call({ system: SYSTEM, user: `הודעת המשתמש:\n${params.userMessage.slice(0, 800)}\n\nבלוקי זיכרון:\n${raw}` }, ctl.signal),
        new Promise<string>((_, rej) => ctl.signal.addEventListener('abort', () => rej(new Error('timeout')))),
      ])
    ).trim();
    if (brief.length < 40 || brief.length >= raw.length) {
      return { sections, condensed: false, reason: 'bad_brief', savedChars: 0 };
    }
    const first = idx[0]!;
    const out = sections.flatMap((s, i) => (i === first ? [`${CONDENSED_OPEN}\n${brief}\n${CONDENSED_CLOSE}`] : idx.includes(i) ? [] : [s]));
    return { sections: out, condensed: true, reason: 'ok', savedChars: raw.length - brief.length };
  } catch (e) {
    return { sections, condensed: false, reason: e instanceof Error && e.message === 'timeout' ? 'timeout' : 'error', savedChars: 0 };
  } finally {
    clearTimeout(timer);
  }
}
