/** Post-login passkey offer policy. Pure + server helpers. */
export const NUDGE_MAX_SHOWS = 3;
export const NUDGE_COOLDOWN_DAYS = 30;

export type NudgeState = { shown_count: number; last_shown_at: string | null; last_outcome: string | null } | null;

export function nudgeEligible(
  input: { isAdmin: boolean; isDemo: boolean; passkeyCount: number; state: NudgeState },
  now = Date.now(),
): boolean {
  if (input.isAdmin || input.isDemo || input.passkeyCount > 0) return false;
  const s = input.state;
  if (!s) return true;
  if (s.last_outcome === 'enrolled') return false;
  if (s.shown_count >= NUDGE_MAX_SHOWS) return false;
  if (s.last_shown_at && now - Date.parse(s.last_shown_at) < NUDGE_COOLDOWN_DAYS * 86_400_000) return false;
  return true;
}

export const isPasskeyNudgeEnabled = () => process.env.NEXT_PUBLIC_PASSKEY_NUDGE === '1';

export const AFTER_LOGIN_KEY = 'nw.pkNudge.afterPasswordLogin';
