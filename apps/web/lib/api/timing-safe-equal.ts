/**
 * השוואת מחרוזות בזמן (כמעט) קבוע — למניעת timing side-channel על סודות
 * (למשל `CRON_SECRET`). מימוש ב-JS טהור כדי לעבוד גם ב-Edge וגם ב-Node
 * בלי תלות ב-`node:crypto`.
 *
 * הערה: אורך המחרוזות עדיין עשוי לדלוף (יציאה מוקדמת על אי-התאמת אורך),
 * אבל תוכן הסוד מושווה ב-XOR מלא ללא יציאה מוקדמת.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}
