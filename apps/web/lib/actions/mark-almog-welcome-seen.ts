'use server';

import { createClient } from '@/lib/supabase/server';

export async function markAlmogWelcomeSeen(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase
    .from('profiles')
    .update({ almog_welcome_seen_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) {
    return { ok: false };
  }

  void (async () => {
    const { sendWelcomeAlmogEmail } = await import('@/lib/auth/send-welcome-almog-email');
    await sendWelcomeAlmogEmail(user.id);
  })().catch((e) => {
    console.warn('[mark-almog-welcome-seen] email:', e);
  });

  return { ok: true };
}
