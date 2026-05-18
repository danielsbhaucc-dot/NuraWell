import { createAdminClient } from '@/lib/supabase/admin';
import { sendResendEmail } from '@/lib/email/resend';
import {
  buildWelcomeDolevEmailHtml,
  buildWelcomeDolevEmailText,
} from '@/lib/email/templates/welcome-dolev';
import type { OnboardingProfileForChat } from '@/lib/ai/onboarding-chat-context';

export type SendWelcomeDolevResult =
  | { ok: true; sent: boolean }
  | { ok: false; reason: string };

/**
 * שולח מייל ברכה מדולב עם סיכום פרופיל (פעם אחת למשתמש).
 * דורש RESEND_API_KEY + RESEND_FROM (מומלץ: Dolev <dolev@nurawell.ai>)
 */
export async function sendWelcomeDolevEmail(userId: string): Promise<SendWelcomeDolevResult> {
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (admin as any)
    .from('profiles')
    .select(
      `full_name, gender, main_goal, current_weight_kg, goal_weight_kg,
      weakest_time_of_day, main_obstacle, wake_up_time, sleep_time, meal_schedule,
      welcome_email_sent_at, onboarding_completed`
    )
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.onboarding_completed) {
    return { ok: false, reason: 'onboarding_incomplete' };
  }
  if (profile.welcome_email_sent_at) {
    return { ok: true, sent: false };
  }

  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const email = authUser?.user?.email;
  if (!email) {
    return { ok: false, reason: 'no_email' };
  }
  if (!authUser.user.email_confirmed_at) {
    return { ok: false, reason: 'email_not_confirmed' };
  }

  const firstName = (profile.full_name as string)?.trim().split(/\s+/)[0] || 'חבר/ה';
  const html = buildWelcomeDolevEmailHtml(firstName, profile as OnboardingProfileForChat);
  const text = buildWelcomeDolevEmailText(firstName);

  const emailResult = await sendResendEmail({
    to: email,
    subject: `${firstName}, ברוך/ה הבא/ה ל-NuraWell — דולב כאן`,
    html,
    text,
  });

  if (!emailResult.ok) {
    console.warn('[welcome-dolev] Resend failed:', emailResult.error);
    return { ok: false, reason: emailResult.error };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('profiles')
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq('id', userId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from('notifications').insert({
    user_id: userId,
    type: 'ai_message',
    title: `היי ${firstName} · מדולב`,
    body: `שמחתי לאשר את האימייל שלך! קיבלתי את כל מה שמילאת — מכאן אלמוג איתך בקצב שלך. נתראה באפליקציה 🌿`,
    icon_emoji: '🌿',
    action_url: '/courses',
    is_read: false,
    is_sent: false,
  });

  return { ok: true, sent: true };
}
