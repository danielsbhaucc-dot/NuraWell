/** Error log intelligence: fingerprint grouping, severity, trend sparkline, plain-Hebrew cause/impact. Pure. */
import { createHash } from 'node:crypto';

export type ErrRow = { id: string; created_at: string; severity: string; source: string | null; route: string | null; message: string; user_id: string | null };
export type IssueStatus = 'new' | 'in_progress' | 'resolved';
export type Issue = {
  fingerprint: string; source: string; sample: string; count: number; users: number; firstSeen: string; lastSeen: string;
  severity: number; spark: number[]; cause: string; impact: string; status: IssueStatus; trend: 'up' | 'down' | 'flat';
};

/** Strip volatile parts (ids, numbers, emails, quoted values) so repeats collapse. */
export function normalizeMessage(m: string): string {
  return m
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hex>')
    .replace(/\d+/g, '<n>')
    .replace(/(["'`]).*?\1/g, '<v>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export const fingerprint = (r: Pick<ErrRow, 'source' | 'route' | 'message'>) =>
  createHash('sha256').update(`${r.source ?? r.route ?? '?'}|${normalizeMessage(r.message)}`).digest('hex').slice(0, 16);

/** Display-safe sample: normalized (no emails / ids / values). */
export const safeSample = (m: string) => normalizeMessage(m);

const CAUSES: [RegExp, string, string][] = [
  [/timeout|timed out|ETIMEDOUT|aborted/i, 'שירות חיצוני לא ענה בזמן (ספק AI, מייל או מסד נתונים).', 'הפעולה נכשלה למשתמש; לרוב מסתדר בניסיון חוזר.'],
  [/rate.?limit|429|too many/i, 'חריגה ממכסת בקשות אצל ספק.', 'חלק מהבקשות נדחות עד שהמכסה מתאפסת.'],
  [/401|403|unauthori[sz]ed|forbidden|invalid api key|jwt/i, 'בעיית הרשאה או מפתח לא תקין/פג.', 'הפיצ׳ר התלוי בשירות הזה לא עובד עד תיקון המפתח.'],
  [/fetch failed|ECONNRESET|ENOTFOUND|network/i, 'תקלת רשת מול שירות חיצוני.', 'כישלון זמני; אם חוזר הרבה — השירות כנראה למטה.'],
  [/violates|duplicate key|constraint|relation .* does not exist|column/i, 'בעיה במסד הנתונים (מבנה טבלה או כפילות).', 'שמירת נתונים נכשלת — דורש תיקון קוד/מיגרציה.'],
  [/undefined|null|cannot read|is not a function|TypeError/i, 'באג בקוד — ערך חסר שלא טופל.', 'מסך או פעולה מסוימת נשברים למשתמשים.'],
  [/parse|JSON|unexpected token/i, 'תשובה בפורמט לא צפוי (לרוב מספק AI).', 'התשובה למשתמש עלולה להיות חסרה.'],
];

export function explainError(message: string): { cause: string; impact: string } {
  for (const [re, cause, impact] of CAUSES) if (re.test(message)) return { cause, impact };
  return { cause: 'שגיאה לא מסווגת.', impact: 'כדאי שאור יבדוק אם זה חוזר.' };
}

const SEV: Record<string, number> = { fatal: 9, critical: 9, error: 6, warning: 3, warn: 3, info: 1 };

export function groupIssues(rows: ErrRow[], states: Map<string, IssueStatus>, now = Date.now(), days = 7): Issue[] {
  const map = new Map<string, { rows: ErrRow[]; users: Set<string> }>();
  for (const r of rows) {
    const fp = fingerprint(r);
    const g = map.get(fp) ?? { rows: [], users: new Set<string>() };
    g.rows.push(r);
    if (r.user_id) g.users.add(r.user_id);
    map.set(fp, g);
  }
  const out: Issue[] = [];
  for (const [fp, g] of map) {
    const sorted = g.rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const spark = Array.from({ length: days }, () => 0);
    for (const r of sorted) {
      const d = Math.floor((now - Date.parse(r.created_at)) / 86_400_000);
      if (d >= 0 && d < days) spark[days - 1 - d] += 1;
    }
    const last2 = spark[days - 1] + spark[days - 2];
    const prev = spark.slice(0, days - 2).reduce((a, b) => a + b, 0) / Math.max(1, days - 2) * 2;
    const trend = last2 > prev * 1.5 + 1 ? 'up' : last2 < prev * 0.5 ? 'down' : 'flat';
    const base = Math.max(...sorted.map((r) => SEV[r.severity.toLowerCase()] ?? 4));
    const severity = Math.min(10, base + (g.users.size >= 5 ? 2 : g.users.size >= 2 ? 1 : 0) + (sorted.length >= 50 ? 1 : 0) + (trend === 'up' ? 1 : 0));
    const last = sorted[sorted.length - 1];
    const { cause, impact } = explainError(last.message);
    out.push({
      fingerprint: fp, source: last.source ?? last.route ?? '—', sample: safeSample(last.message), count: sorted.length, users: g.users.size,
      firstSeen: sorted[0].created_at, lastSeen: last.created_at, severity, spark, cause, impact, status: states.get(fp) ?? 'new', trend,
    });
  }
  return out.sort((a, b) => (a.status === 'resolved' ? 1 : 0) - (b.status === 'resolved' ? 1 : 0) || b.severity - a.severity || b.count - a.count);
}
