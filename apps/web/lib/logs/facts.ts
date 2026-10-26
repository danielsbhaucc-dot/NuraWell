/**
 * admin_audit_log / ops_security_events split (migration 000214):
 *   facts  — plain jsonb, ONLY ids / fixed codes / counts / dates (SQL writers such as ops_break_glass_reset and
 *            run_data_retention, and the app's dedupe keys `.contains('facts', { key | day })`)
 *   detail — everything else, sealed enc:v2 under the system 'audit' key by the fetch wrapper (registered column)
 * Readers see one object: facts overlaid by the decrypted detail.
 */
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);

export function logDetail(r: { facts?: unknown; detail?: unknown }): Obj | null {
  const f = obj(r.facts);
  const d = obj(r.detail);
  if (!f && !d) return null;
  return { ...(f ?? {}), ...(d ?? {}) };
}
