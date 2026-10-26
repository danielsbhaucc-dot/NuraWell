/** Tamper-evident chain helper: hash = sha256(prev_hash || canonical(event)). Mirrors the Postgres trigger. */
export type AuditEvent = { kind: string; actorId: string | null; productId: string | null; target: string | null; detail: Record<string, unknown> };

export function canonical(e: AuditEvent): string {
  const sort = (v: unknown): unknown =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]))
      : v;
  return JSON.stringify(sort(e));
}

/** Verify a chain of rows ordered by seq: every row's prev_hash must equal the previous row's hash. */
export function verifyChain(rows: readonly { seq: number; prev_hash: string | null; hash: string }[]): { ok: true } | { ok: false; brokenAt: number } {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].prev_hash !== rows[i - 1].hash || rows[i].seq <= rows[i - 1].seq) return { ok: false, brokenAt: rows[i].seq };
  }
  return { ok: true };
}
