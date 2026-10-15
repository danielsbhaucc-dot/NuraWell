import type { OnboardingProfileForChat } from '@/lib/ai/onboarding-chat-context';
import type { OnboardingGender } from '@/lib/onboarding/types';
import { welcomeEmailCopy } from '@/lib/email/welcome-email-copy';
import { publicAppOriginSync } from '@/lib/public-app-url';
import { dolevSignature, EMAIL_SUPPORT_ADDRESS, emailParagraph, emailSummaryTable, escapeHtml, renderEmailLayout } from '@/lib/email/layout';

const GOAL_HE: Record<string, string> = {
  weight_loss: 'ירידה במשקל',
  healthy_lifestyle: 'אורח חיים בריא',
  both: 'משקל + אורח חיים',
};

const WEAKEST_HE: Record<string, string> = {
  morning: 'בוקר',
  noon: 'צהריים',
  afternoon: 'אחר הצהריים',
  evening_night: 'ערב/לילה',
};

const OBSTACLE_HE: Record<string, string> = {
  no_time: 'חוסר זמן',
  emotional_eating: 'אכילה רגשית',
  lack_of_consistency: 'קושי להתמיד',
  no_support: 'חוסר תמיכה',
  other: 'אחר',
};


export function buildWelcomeDolevEmailHtml(
  firstName: string,
  profile: Pick<
    OnboardingProfileForChat,
    | 'gender'
    | 'main_goal'
    | 'current_weight_kg'
    | 'goal_weight_kg'
    | 'weakest_time_of_day'
    | 'main_obstacle'
    | 'wake_up_time'
    | 'sleep_time'
    | 'meal_schedule'
  >,
  appOrigin?: string
): string {
  const copy = welcomeEmailCopy(firstName, profile.gender as OnboardingGender | undefined);
  const origin = appOrigin?.replace(/\/$/, '') || publicAppOriginSync();

  const meals =
    profile.meal_schedule?.length ?
      profile.meal_schedule.map((m) => `${m.time} (${m.label})`).join(', ')
    : 'לפי לוח כללי';

  const table = emailSummaryTable(
    [
    ['מטרה', profile.main_goal ? (GOAL_HE[profile.main_goal] ?? profile.main_goal) : '—'],
    [
      'חלון קשה',
      profile.weakest_time_of_day ? (WEAKEST_HE[profile.weakest_time_of_day] ?? profile.weakest_time_of_day) : '—'
    ],
    [
      'מכשול עיקרי',
      profile.main_obstacle ? (OBSTACLE_HE[profile.main_obstacle] ?? profile.main_obstacle) : '—'
    ],
    ['השכמה / שינה', `${profile.wake_up_time ?? '—'} · ${profile.sleep_time ?? '—'}`],
    ['ארוחות', meals],
  ],
    copy.summaryTitle
  );

  return renderEmailLayout({
    assetOrigin: origin,
    preheader: copy.preheader,
    eyebrow: 'דולב · NuraWell',
    heading: escapeHtml(copy.headline),
    subheading: copy.subheading,
    bodyHtml: [emailParagraph(escapeHtml(copy.intro)), table, emailParagraph(escapeHtml(copy.closing))].join(''),
    cta: { label: copy.cta, url: `${origin}/home` },
    signatureHtml: dolevSignature(copy.signature),
  });
}

export function buildWelcomeDolevEmailText(
  firstName: string,
  gender?: OnboardingGender | null,
  appOrigin?: string
): string {
  const copy = welcomeEmailCopy(firstName, gender);
  const origin = appOrigin?.replace(/\/$/, '') || publicAppOriginSync();
  return `${copy.textPlain}

${copy.cta}: ${origin}/home

את התיבה הזאת אף אחד לא קורא. שאלות? ${EMAIL_SUPPORT_ADDRESS}`;
}

export function welcomeDolevEmailSubject(firstName: string, gender?: OnboardingGender | null): string {
  return welcomeEmailCopy(firstName, gender).subject;
}
