/**
 * Allowed values for enum-like columns whose DB CHECK constraint was dropped because the column
 * becomes per-user encrypted (enc:v2). Enforced centrally in the server Supabase fetch wrapper
 * (field-fetch.ts) on every insert/upsert/update, before any encryption.
 */
export const COLUMN_ENUMS: Record<string, Record<string, readonly string[]>> = {
  almog_assignments: {
    schedule: ['one_time', 'daily', 'weekly'],
  },
};

/** first violation in a write body (row or array of rows), or null when valid */
export function enumViolation(table: string, body: unknown): { column: string } | null {
  const spec = COLUMN_ENUMS[table];
  if (!spec) return null;
  const rows = Array.isArray(body) ? body : [body];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const [column, allowed] of Object.entries(spec)) {
      if (!(column in row)) continue;
      const v = (row as Record<string, unknown>)[column];
      if (v === null) continue;
      if (typeof v !== 'string' || !allowed.includes(v)) return { column };
    }
  }
  return null;
}
