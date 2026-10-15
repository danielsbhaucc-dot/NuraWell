import type { OnboardingProfileForChat } from '@/lib/ai/onboarding-chat-context';
import type { OnboardingGender } from '@/lib/onboarding/types';
import { welcomeEmailCopy } from '@/lib/email/welcome-email-copy';
import { publicAppOriginSync } from '@/lib/public-app-url';
import { emailNotice, emailParagraph, emailSummaryTable, renderEmailLayout } from '@/lib/email/layout';

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

  const table = emailSummaryTable([
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
  ]);

  return renderEmailLayout({
    assetOrigin: origin,
    preheader: copy.summaryTitle,
    eyebrow: 'דולב · NuraWell',
    heading: copy.headline,
    bodyHtml: [
      emailNotice(copy.noReplyTop),
      emailParagraph(copy.intro),
      emailParagraph(`<strong>${copy.summaryTitle}</strong><br><span style="color:#5b6b62;font-size:14px">${copy.summarySubtitle}</span>`),
      table,
      emailParagraph(copy.closing, { muted: true, small: true }),
    ].join(''),
    cta: { label: copy.cta, url: `${origin}/home` },
    afterCtaHtml: emailNotice(copy.noReplyBottom),
    footerNote: 'דולב · מנהל ההרשמה · NuraWell',
  });
}

export function buildWelcomeDolevEmailText(
  firstName: string,
  gender?: OnboardingGender | null,
  appOrigin?: string
): string {
  const copy = welcomeEmailCopy(firstName, gender);
  const origin = appOrigin?.replace(/\/$/, '') || publicAppOriginSync();
  return `${copy.noReplyTop}

${copy.textPlain}

${copy.cta}: ${origin}/home

${copy.noReplyBottom}`;
}

export function welcomeDolevEmailSubject(firstName: string, gender?: OnboardingGender | null): string {
  return welcomeEmailCopy(firstName, gender).subject;
}
