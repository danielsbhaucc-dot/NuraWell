import { createAdminClient } from '@/lib/supabase/admin';
import { sendResendEmail } from '@/lib/email/resend';
import {
  buildWelcomeAlmogEmailHtml,
  buildWelcomeAlmogEmailText,
} from '@/lib/email/templates/welcome-almog';
import type { OnboardingProfileForChat } from '@/lib/ai/onboarding-chat-context';
import type { OnboardingGender } from '@/lib/onboarding/types';
export type SendWelcomeAlmogResult =
  | { ok: true; sent: boolean }
  | { ok: false; reason: string };

export function welcomeAlmogEmailSubject(firstName: string): string {
  return `${firstName}, אלמוג כאן — נתחיל בקצב שלך 🌿`;
}

/**
 * מייל היכרות מאלמוג — פעם אחת, אחרי מגירת הברכה הראשונה.
 */
export async function sendWelcomeAlmogEmail(userId: string): Promise<SendWelcomeAlmogResult> {
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await admin
    .from('profiles')
    .select(
      `full_name, gender, main_goal, current_weight_kg, goal_weight_kg,
      weakest_time_of_day, main_obstacle, wake_up_time, sleep_time, meal_schedule,
      almog_intro_email_sent_at, onboarding_completed, dolev_welcome_seen_at`
    )
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.onboarding_completed) {
    return { ok: false, reason: 'onboarding_incomplete' };
  }
  if (!profile.dolev_welcome_seen_at) {
    return { ok: false, reason: 'dolev_welcome_pending' };
  }
  if (profile.almog_intro_email_sent_at) {
    return { ok: true, sent: false };
  }

  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const email = authUser?.user?.email;
  if (!email) {
    return { ok: false, reason: 'no_email' };
  }

  const gender = (profile.gender as OnboardingGender | null) ?? null;
  const firstName = (profile.full_name as string)?.trim().split(/\s+/)[0] || 'חבר/ה';

  const html = buildWelcomeAlmogEmailHtml(
    firstName,
    gender,
    profile as unknown as OnboardingProfileForChat
  );
  const text = buildWelcomeAlmogEmailText(firstName);

  const emailResult = await sendResendEmail({
    to: email,
    subject: welcomeAlmogEmailSubject(firstName),
    html,
    text,
    sender: 'almog',
  });

  if (!emailResult.ok) {
    console.warn('[welcome-almog] Resend failed:', emailResult.error);
    return { ok: false, reason: emailResult.error };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await admin
    .from('profiles')
    .update({ almog_intro_email_sent_at: new Date().toISOString() })
    .eq('id', userId);

  const notifyBody = `היי ${firstName} 👋 אני אלמוג — מכאן אני איתך בצ'אט ובהתראות, בקצב שלך. ספר לי במשפט מה הכי חשוב לך השבוע?`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const title = `${firstName} · מאלמוג`;
  await admin.from('notifications').insert({
    user_id: userId,
    type: 'ai_message',
    title,
    body: notifyBody,
    metadata: { mentor: 'almog', source: 'almog_intro_welcome' },
  });

  const { afterAlmogInAppNotification } = await import('../notifications/after-almog-insert');
  afterAlmogInAppNotification(userId, title, notifyBody);

  return { ok: true, sent: true };
}
