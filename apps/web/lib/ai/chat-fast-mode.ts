/**
 * מצב "מהיר" לצ'אט של אלמוג — כבוי כברירת מחדל (AI_CHAT_FAST_MODE=1 מפעיל).
 * 1. מדלג על LLM הנתב בכל תור שאינו משבר ומשתמש בהחלטה היוריסטית (אותה רשת ביטחון
 *    שמשמשת כשהנתב נכשל/איטי). חוסך ~2–3 שנ׳ TTFT.
 * 2. מנקה כפילויות בפרומפט המערכת: פסקאות זהות שחוזרות, ושורות ריקות עודפות.
 *    שום כלל לא נמחק — רק עותק שני זהה של אותו טקסט. פרסונה/בטיחות/לא-דיאטן/PII נשארים.
 */
export function isChatFastModeEnabled(): boolean {
  const v = process.env.AI_CHAT_FAST_MODE?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

export function dedupeSystemPrompt(text: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const para of text.split(/\n{2,}/)) {
    const key = para.replace(/\s+/g, ' ').trim();
    if (!key) continue;
    // רק פסקאות משמעותיות נספרות לכפילות; קצרות (כותרות/מפרידים) נשמרות תמיד.
    if (key.length >= 40) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(para.replace(/[ \t]+$/gm, ''));
  }
  return out.join('\n\n');
}
