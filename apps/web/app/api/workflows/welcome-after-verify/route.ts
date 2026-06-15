import { serve } from '@upstash/workflow/nextjs';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireQstashConfigured } from '@/lib/workflows/require-qstash-configured';
import { sendWelcomeDolevEmail } from '@/lib/auth/send-welcome-dolev-email';
import type { OnboardingProfileForChat } from '@/lib/ai/onboarding-chat-context';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

type Body = { userId: string };

const { POST: workflowPost } = serve<Body>(async (context) => {
  const { userId } = context.requestPayload;
  if (!userId || typeof userId !== 'string') {
    return { skipped: true as const, reason: 'invalid_user' };
  }

  const gate = await context.run('gate', async () => {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await admin
      .from('profiles')
      .select(
        `full_name, gender, main_goal, current_weight_kg, goal_weight_kg,
        weakest_time_of_day, main_obstacle, wake_up_time, sleep_time, meal_schedule,
        welcome_email_sent_at, onboarding_completed`
      )
      .eq('id', userId)
      .maybeSingle();

    if (!profile?.onboarding_completed) {
      return { ok: false as const, reason: 'onboarding_incomplete' };
    }
    if (profile.welcome_email_sent_at) {
      return { ok: false as const, reason: 'already_sent' };
    }

    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    const email = authUser?.user?.email;
    if (!email) {
      return { ok: false as const, reason: 'no_email' };
    }
    if (!authUser.user?.email_confirmed_at) {
      return { ok: false as const, reason: 'email_not_confirmed' };
    }

    return {
      ok: true as const,
      email,
      firstName: (profile.full_name as string)?.trim().split(/\s+/)[0] || 'חבר/ה',
      profile: profile as unknown as OnboardingProfileForChat,
    };
  });

  if (!gate.ok) {
    return { skipped: true as const, reason: gate.reason };
  }

  await context.run('notify-and-email', async () => {
    await sendWelcomeDolevEmail(userId);
  });

  return { ok: true as const };
});

export const POST = requireQstashConfigured(workflowPost);
