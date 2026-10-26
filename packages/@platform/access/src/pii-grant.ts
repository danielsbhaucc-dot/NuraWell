/**
 * Justification-gated access to one subject's personal data (Google-style "access with a written reason").
 * Pure policy: the app persists grants and calls these to decide. Every decision is server-side.
 */
export const PII_REASON_MIN = 15;
export const PII_REASON_MAX = 500;
export const PII_GRANT_TTL_MS = 30 * 60_000;
export const PII_GRANT_MAX_TTL_MS = 60 * 60_000;
const VAGUE = [/^\s*(test|בדיקה|check|בדיקת|סתם|צריך|need|look|לבדוק)\s*$/i];

export type PiiGrant = {
  id: string; productId: string; actorId: string; subjectId: string;
  reason: string; ticketRef: string | null; createdAt: number; expiresAt: number; revokedAt: number | null;
};
export type ReasonCheck = { ok: true; reason: string; ticketRef: string | null } | { ok: false; error: 'reason_too_short' | 'reason_too_long' | 'reason_vague' | 'ticket_invalid' };

export function validateJustification(reasonRaw: unknown, ticketRaw?: unknown): ReasonCheck {
  const reason = String(reasonRaw ?? '').replace(/\s+/g, ' ').trim();
  if (reason.length < PII_REASON_MIN) return { ok: false, error: 'reason_too_short' };
  if (reason.length > PII_REASON_MAX) return { ok: false, error: 'reason_too_long' };
  // repeated chars / single repeated word are not a reason
  if (new Set(reason.replace(/\s/g, '')).size < 5 || VAGUE.some((r) => r.test(reason))) return { ok: false, error: 'reason_vague' };
  const t = ticketRaw == null ? '' : String(ticketRaw).trim();
  if (t && !/^[A-Za-z0-9#._\-]{2,40}$/.test(t)) return { ok: false, error: 'ticket_invalid' };
  return { ok: true, reason, ticketRef: t || null };
}

export function grantExpiry(now: number, ttlMs = PII_GRANT_TTL_MS): number {
  return now + Math.min(Math.max(60_000, ttlMs), PII_GRANT_MAX_TTL_MS);
}

/** A grant covers exactly one (product, actor, subject) and only until it expires or is revoked. */
export function grantCovers(g: PiiGrant | null | undefined, q: { productId: string; actorId: string; subjectId: string }, now: number): boolean {
  if (!g) return false;
  if (g.revokedAt != null) return false;
  if (!(now < g.expiresAt)) return false;
  return g.productId === q.productId && g.actorId === q.actorId && g.subjectId === q.subjectId;
}
