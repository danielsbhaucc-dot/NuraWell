/** חילוץ JSON ממודל נתב — Llama לעיתים עוטף פרוזה או fences. */
export function parseLlmJsonObject(raw: string): unknown | null {
  const cleaned = raw.replace(/```json|```/gi, '').trim();
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned);
  } catch {
    /* continue */
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}
