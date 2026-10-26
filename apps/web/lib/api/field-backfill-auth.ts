import { timingSafeEqualStr } from './timing-safe-equal';

/**
 * Dedicated manual-trigger secret for the enc:v2 backfill route only (Bearer header only,
 * constant-time). Independent of CRON_SECRET so rotating one never breaks the other.
 */
export function hasFieldBackfillSecret(request: Request): boolean {
  const secret = process.env.FIELD_BACKFILL_SECRET?.trim();
  if (!secret || secret.length < 32) return false;
  const auth = request.headers.get('authorization');
  return !!auth && timingSafeEqualStr(auth, `Bearer ${secret}`);
}
