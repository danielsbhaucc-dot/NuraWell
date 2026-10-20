import { authorizeCronRequest } from './authorize-cron';
import { timingSafeEqualStr } from './timing-safe-equal';

/** Nightly DB backup workflow: dedicated Bearer DB_BACKUP_SECRET, else regular cron auth. */
export async function authorizeDbBackupRequest(request: Request) {
  const dedicated = process.env.DB_BACKUP_SECRET?.trim();
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '');
  if (dedicated && dedicated.length >= 32 && m && timingSafeEqualStr(m[1]!.trim(), dedicated)) return null;
  return authorizeCronRequest(request);
}
