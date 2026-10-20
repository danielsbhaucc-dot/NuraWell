/**
 * Human-readable verification code for any evidence file: the first 12 hex chars of its SHA-256,
 * grouped (e.g. NW-8414-106D-0433). Reversible to a hash PREFIX for lookup.
 */
export function verifyCode(sha256: string): string {
  const h = sha256.toUpperCase().slice(0, 12);
  return `NW-${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}`;
}

/** Accepts a full sha256 or an NW-XXXX-XXXX-XXXX code; returns lowercase hex (full or 12-char prefix). */
export function parseVerifyInput(v: string | null | undefined): { hex: string; full: boolean } | null {
  const s = String(v ?? '').trim();
  if (/^[0-9a-f]{64}$/i.test(s)) return { hex: s.toLowerCase(), full: true };
  const m = /^NW-([0-9A-F]{4})-([0-9A-F]{4})-([0-9A-F]{4})$/i.exec(s);
  return m ? { hex: `${m[1]}${m[2]}${m[3]}`.toLowerCase(), full: false } : null;
}

