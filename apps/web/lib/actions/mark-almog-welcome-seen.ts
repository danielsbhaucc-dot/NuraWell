'use server';

import { markWelcomeSeen } from './mark-welcome-seen';

export async function markAlmogWelcomeSeen(): Promise<{ ok: boolean }> {
  const result = await markWelcomeSeen('almog_welcome_seen_at');
  if (!result.ok) return { ok: false };

  void (async () => {
    const { sendWelcomeAlmogEmail } = await import('@/lib/auth/send-welcome-almog-email');
    await sendWelcomeAlmogEmail(result.userId);
  })().catch((e) => {
    console.warn('[mark-almog-welcome-seen] email:', e);
  });

  return { ok: true };
}
