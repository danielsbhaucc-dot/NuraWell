/**
 * Defense-in-depth scrubber for anything leaving the request path as telemetry
 * (error_events, monitoring webhooks, stderr). Removes identifiers, credentials and
 * ciphertext blobs so a log/monitoring leak can never expose user data or keys.
 */
const RULES: Array<[RegExp, string]> = [
  [/enc:v\d+:[A-Za-z0-9_\-.]+/g, '[enc]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[jwt]'],
  [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/g, '[key]'],
  [/\b(?:sk-|gsk_|sb_secret_|sb_publishable_|xox[abp]-|ghp_|github_pat_|AIza)[A-Za-z0-9_\-]{10,}/g, '[key]'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]'],
  [/([?&](?:token|code|key|secret|password|access_token|refresh_token|apikey)=)[^&\s"']+/gi, '$1[redacted]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  [/(?<![\w-])(?:\+?972[-\s]?|0)5\d(?:[-\s]?\d){7}(?![\w-])/g, '[phone]'],
  [/(?<![\w-])\+\d{1,3}[-\s]?\d(?:[-\s]?\d){6,12}(?![\w-])/g, '[phone]'],
];

export function scrubSensitive(input: string | null | undefined): string {
  if (!input) return input ?? '';
  let s = String(input);
  for (const [re, rep] of RULES) s = s.replace(re, rep);
  return s;
}

/** Postgres/PostgREST errors echo row values in "Failing row contains (...)" / "Key (...)=(...)". */
export function scrubDbEcho(input: string): string {
  return input
    .replace(/Failing row contains \([\s\S]*?\)(?=\.|$)/g, 'Failing row contains ([redacted])')
    .replace(/(Key \([^)]*\)=)\([^)]*\)/g, '$1([redacted])');
}

export function scrubTelemetry(input: string | null | undefined): string {
  return scrubSensitive(scrubDbEcho(String(input ?? '')));
}
