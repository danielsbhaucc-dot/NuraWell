import 'server-only';
import { backfillFieldV2 } from '@/lib/security/field-backfill';

/**
 * Seal a user's auth_session_trail rows right after sign-in (write-time path).
 * The auth.sessions trigger (000189) runs inside Postgres without the per-user key, so it can only stage the row;
 * every app sign-in path calls this immediately after the session is minted, so ip/user_agent become enc:v2 and
 * ip_bidx is filled within the same request. The daily session-trail-seal cron is only a backstop
 * (direct auth-API sign-ins that never touch the app). Best-effort, never throws, counts only.
 */
export async function sealSessionTrailFor(userId: string | null | undefined): Promise<number> {
  if (!userId) return 0;
  try {
    const r = await backfillFieldV2(8_000, ['auth_session_trail'], { col: 'user_id', value: userId });
    return r.auth_session_trail?.rows ?? 0;
  } catch {
    return 0;
  }
}
