import type { OnboardingProfileForChat } from '@/lib/ai/onboarding-chat-context';
import { genderCopy } from '@/lib/onboarding/gender-copy';
import { publicAppOriginSync } from '@/lib/public-app-url';
import { emailParagraph, emailSummaryTable, escapeHtml, renderEmailLayout } from '@/lib/email/layout';
import type { OnboardingGender } from '@/lib/onboarding/types';

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


export function buildWelcomeAlmogEmailHtml(
  firstName: string,
  gender: OnboardingGender | null | undefined,
  profile: Pick<
    OnboardingProfileForChat,
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
  const origin = appOrigin?.replace(/\/$/, '') || publicAppOriginSync();
  const name = escapeHtml(firstName);
  const gc = genderCopy(gender ?? '');
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
    'מה שאני כבר יודע עליך'
  );

  return renderEmailLayout({
    assetOrigin: origin,
    preheader: 'קיבלתי את מה שמילאת בהרשמה, הנה הסיכום שלך',
    eyebrow: 'אלמוג · NuraWell',
    heading: `שלום ${name}, אלמוג כאן 🌿`,
    subheading: 'נעים להכיר, באמת',
    introHtml: emailParagraph('דולב העביר לי את התיק שלך (בעדינות, אל דאגה). אני כבר מתכנן איך ללוות אותך בקצב שלך, בלי שיפוט ובלי לחץ. ובלי הרצאות, מבטיח.'),
    bodyHtml: [
            table,
      emailParagraph(`בקרוב ${gc.willReceive} ממני גם הודעות באפליקציה בזמנים שמתאימים לך, במיוחד לפני הרגעים הקשים.`, { muted: true }),
    ].join(''),
    cta: { label: 'כניסה לאפליקציה', url: `${origin}/home` },
  });
}

export function buildWelcomeAlmogEmailText(firstName: string, appOrigin?: string): string {
  const origin = appOrigin?.replace(/\/$/, '') || publicAppOriginSync();
  return `שלום ${firstName},

איזה כיף שהצטרפת ל-NuraWell! אני אלמוג — קיבלתי את מה שמילאת בהרשמה ואלווה אותך בקצב שלך.

כניסה לאפליקציה: ${origin}/home

— אלמוג`;
}
