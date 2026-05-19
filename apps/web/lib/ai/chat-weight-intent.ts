/**
 * זיהוי משקל מהודעת צ'אט — עדכון user_measurements בלי טופס.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** 35–250 ק"ג — טווח סביר לבוגרים */
const MIN_KG = 35;
const MAX_KG = 250;

const WEIGHT_CONTEXT_RE =
  /(?:משקל|שוקל|שוקלת|אני\s+על|עכשיו\s+על|היום\s+על|עדכנתי\s+ל|ירדתי\s+ל|עליתי\s+ל)/i;

const KG_NUMBER_RE = /(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:ק["']?\s*ג|קילו|kg|קג)?/gi;

export function parseWeightKgFromMessage(userMessage: string): number | null {
  const msg = userMessage.replace(/\s+/g, ' ').trim();
  if (msg.length < 3) return null;

  const hasContext = WEIGHT_CONTEXT_RE.test(msg) || /^\d{2,3}(?:[.,]\d{1,2})?\s*(?:ק|kg)?$/i.test(msg);

  let best: number | null = null;
  for (const m of msg.matchAll(KG_NUMBER_RE)) {
    const raw = m[1]?.replace(',', '.');
    if (!raw) continue;
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n) || n < MIN_KG || n > MAX_KG) continue;
    if (!hasContext && msg.length > 12) continue;
    best = Math.round(n * 10) / 10;
  }
  return best;
}

export async function applyWeightFromUserMessage(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string
): Promise<{ logged: boolean; weightKg?: number }> {
  const weightKg = parseWeightKgFromMessage(userMessage);
  if (weightKg == null) return { logged: false };

  const measuredAt = new Date().toISOString().slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('user_measurements').insert({
    user_id: userId,
    measured_at: measuredAt,
    weight_kg: weightKg,
    notes: 'מצ׳אט',
  });

  if (error) {
    return { logged: false };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('profiles')
    .update({ current_weight_kg: weightKg })
    .eq('id', userId);

  return { logged: true, weightKg };
}
