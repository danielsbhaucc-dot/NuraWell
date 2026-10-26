/**
 * App-side ports of the SQL title logic, so task titles can be encrypted (the DB no longer sees them):
 *  - normalizeTaskTitle  ← public.normalize_task_title (000103; the SQL trigger stays but skips enc values since 000212 — the app normalizes before sealing)
 *  - dedupeNormalize     ← public.dedupe_normalize (000100); its HMAC feeds task_definitions.title_bidx → habit_dedupe_key
 *  - titleTokens         ← public.nw_title_tokens (000108); HMACs feed almog_assignments.title_tok_bidx
 *  - tokensSimilar       ← public.nw_titles_similar / nw_tokens_similar (same thresholds)
 * Pure module (no I/O). Kept byte-for-byte equivalent to the SQL so plaintext legacy rows and new rows agree.
 */

/** 000103: trim; ש/א-imperative → infinitive; a title cut at exactly 60 chars mid-word ends on a whole word + "…". */
export function normalizeTaskTitle(t: string | null | undefined): string | null {
  if (t == null) return null;
  let s = t.trim();
  s = s.replace(/^(שתות|שתה|שתי) /u, 'לשתות ');
  s = s.replace(/^(אכול|אכלי) /u, 'לאכול ');
  if ([...s].length === 60 && !/[.!?…)]$/u.test(s) && s.includes(' ')) s = s.replace(/\s+\S*$/u, '') + '…';
  return s;
}

/** 000100 dedupe_normalize: lowercase, non-alnum (Hebrew included) → space, collapse, trim. */
export function dedupeNormalize(t: string | null | undefined): string {
  return (t ?? '').replace(/[^\p{L}\p{N}א-ת]+/gu, ' ').replace(/\s+/g, ' ').toLowerCase().trim();
}

const STOP = new Set(['של', 'את', 'על', 'עם', 'או', 'גם', 'זה', 'זו', 'היא', 'הוא', 'אני', 'כל', 'רק', 'לי', 'לך']);

/** 000108 nw_title_tokens: unique Hebrew-stem tokens (prefix ל/ה/ו/ב dropped, plural/feminine suffixes stripped). */
export function titleTokens(t: string | null | undefined): string[] {
  const out: string[] = [];
  for (const tok of (t ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ')) {
    if (!tok || STOP.has(tok)) continue;
    let s = tok;
    if ([...s].length > 3 && /^[להוב]/u.test(s)) s = s.slice(1);
    for (;;) {
      const n = [...s].length;
      if (n <= 2) break;
      if (/(יות|ות|ית|יה|ים)$/u.test(s) && n - 2 >= 2) s = s.slice(0, -2);
      else if (/[תהי]$/u.test(s)) s = s.slice(0, -1);
      else break;
    }
    if ([...s].length >= 2 && !out.includes(s)) out.push(s);
  }
  return out;
}

/** nw_titles_similar on token sets (plain stems or their HMACs): Jaccard ≥ 0.72 or overlap/min ≥ 0.85. */
export function tokensSimilar(a: readonly string[], b: readonly string[]): boolean {
  if (!a.length || !b.length) return false;
  const sb = new Set(b);
  const i = a.filter((x) => sb.has(x)).length;
  const u = a.length + b.length - i;
  return i / u >= 0.72 || i / Math.min(a.length, b.length) >= 0.85;
}
