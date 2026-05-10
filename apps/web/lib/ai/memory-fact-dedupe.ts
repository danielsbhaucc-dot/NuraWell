import type { ExtractedMemoryFact } from './extract-memory-facts';

/**
 * מפתח להשוואת כפילויות טקסטואליות (עברית — בעיקר ריווח ו-NFC).
 */
export function normalizeFactTextForDedupe(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * מסיר כפילויות מתוך אותה תגובת חילוץ (אותו ניסוח נורמלי נשמר פעם אחת).
 */
export function dedupeExtractedFacts(facts: ExtractedMemoryFact[]): ExtractedMemoryFact[] {
  const seen = new Map<string, ExtractedMemoryFact>();
  for (const f of facts) {
    const key = normalizeFactTextForDedupe(f.text);
    if (!key) continue;
    if (!seen.has(key)) {
      seen.set(key, { ...f, text: f.text.replace(/\s+/g, ' ').trim() });
    }
  }
  return [...seen.values()];
}

/**
 * מזהה וקטור יציב לטקסט זהה (אותו משתמש + אותו מפתח נורמלי) — upsert מונע כפילות מדויקת במסד.
 */
export async function stableMemoryVectorId(userId: string, normalizedKey: string): Promise<string> {
  const payload = `${userId}|${normalizedKey}`;
  const enc = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `nw-mem-${hex.slice(0, 40)}`;
}
