import { createAdminClient } from '@/lib/supabase/admin';
import { sendResendEmail } from '@/lib/email/resend';
import {
  buildWelcomeDolevEmailHtml,
  buildWelcomeDolevEmailText,
  welcomeDolevEmailSubject,
} from '@/lib/email/templates/welcome-dolev';
import type { OnboardingProfileForChat } from '@/lib/ai/onboarding-chat-context';
import type { OnboardingGender } from '@/lib/onboarding/types';
import { publicAppOriginSync } from '@/lib/public-app-url';

export type SendWelcomeDolevResult =
  | { ok: true; sent: boolean }
  | { ok: false; reason: string };

/**
 * שולח מייל ברכה מדולב עם סיכום פרופיל (פעם אחת למשתמש).
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
  if (!authUser.user?.email_confirmed_at) {
    return { ok: false, reason: 'email_not_confirmed' };
  }

  const gender = (profile.gender as OnboardingGender | null) ?? null;
  const firstName = (profile.full_name as string)?.trim().split(/\s+/)[0] || 'חבר/ה';
  const appOrigin = publicAppOriginSync();

  const html = buildWelcomeDolevEmailHtml(firstName, profile as OnboardingProfileForChat, appOrigin);
  const text = buildWelcomeDolevEmailText(firstName, gender, appOrigin);

  const emailResult = await sendResendEmail({
    to: email,
    subject: welcomeDolevEmailSubject(firstName, gender),
    html,
    text,
    sender: 'dolev',
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

  const notifyBody =
    gender === 'male'
      ? `שמחתי לאשר את האימייל שלך! קיבלתי את כל מה שמילאת — מכאן אלמוג איתך בקצב שלך. נתראה באפליקציה 🌿`
      : gender === 'female'
        ? `שמחתי לאשר את האימייל שלך! קיבלתי את כל מה שמילאת — מכאן אלמוג איתך בקצב שלך. נתראה באפליקציה 🌿`
        : `שמחתי לאשר את האימייל שלך! קיבלתי את כל מה שמילאת — מכאן אלמוג איתך בקצב שלך. נתראה באפליקציה 🌿`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from('notifications').insert({
    user_id: userId,
    type: 'ai_message',
    title: `היי ${firstName} · מדולב`,
    body: notifyBody,
    icon_emoji: '🌿',
    action_url: '/home',
    is_read: false,
    is_sent: false,
    metadata: { mentor: 'dolev', source: 'dolev_welcome' },
  });

  return { ok: true, sent: true };
}
