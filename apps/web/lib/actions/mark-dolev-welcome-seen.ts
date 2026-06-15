'use server';

import { markWelcomeSeen } from './mark-welcome-seen';

export async function markDolevWelcomeSeen(): Promise<{ ok: boolean }> {
  const result = await markWelcomeSeen('dolev_welcome_seen_at');
  return { ok: result.ok };
}
