import type { OnboardingProfileForChat } from '@/lib/ai/onboarding-chat-context';
import type { OnboardingGender } from '@/lib/onboarding/types';
import { formatWeightRangeKg } from '@/lib/onboarding/format-weight-range';
import { welcomeEmailCopy } from '@/lib/email/welcome-email-copy';
import { publicAppOriginSync } from '@/lib/public-app-url';

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

function row(label: string, value: string, ltr = false): string {
  const valStyle = ltr
    ? 'padding:8px 12px;color:#064e3b;font-size:14px;font-weight:600;text-align:left;direction:ltr;unicode-bidi:embed'
    : 'padding:8px 12px;color:#064e3b;font-size:14px;font-weight:600;text-align:right;direction:rtl';
  const valCell = ltr
    ? `<td dir="ltr" style="${valStyle}">${value}</td>`
    : `<td dir="rtl" style="${valStyle}">${value}</td>`;
  return `<tr><td dir="rtl" style="padding:8px 12px;color:#6b7280;font-size:14px;white-space:nowrap;text-align:right">${label}</td>${valCell}</tr>`;
}

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

  const table = [
    row('מטרה', profile.main_goal ? (GOAL_HE[profile.main_goal] ?? profile.main_goal) : '—'),
    row(
      'משקל (נוכחי → יעד)',
      formatWeightRangeKg(profile.current_weight_kg, profile.goal_weight_kg),
      true
    ),
    row(
      'חלון קשה',
      profile.weakest_time_of_day ? (WEAKEST_HE[profile.weakest_time_of_day] ?? profile.weakest_time_of_day) : '—'
    ),
    row(
      'מכשול עיקרי',
      profile.main_obstacle ? (OBSTACLE_HE[profile.main_obstacle] ?? profile.main_obstacle) : '—'
    ),
    row('השכמה / שינה', `${profile.wake_up_time ?? '—'} · ${profile.sleep_time ?? '—'}`),
    row('ארוחות', meals),
  ].join('');

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width"/>
</head>
<body dir="rtl" style="margin:0;background:#ecfdf5;font-family:Rubik,Heebo,Arial,sans-serif;direction:rtl;text-align:right">
  <table dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf5;padding:32px 16px;direction:rtl">
    <tr><td align="center" dir="rtl">
      <table dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 12px 40px rgba(6,78,59,0.12);direction:rtl">
        <tr><td dir="rtl" style="background:linear-gradient(135deg,#0f766e,#047857);padding:28px 24px;text-align:right">
          <p style="margin:0;color:#d1fae5;font-size:13px;direction:rtl;text-align:right">Dolev NuraWell.ai</p>
          <h1 style="margin:8px 0 0;color:#fff;font-size:22px;direction:rtl;text-align:right">${copy.headline}</h1>
        </td></tr>
        <tr><td dir="rtl" style="padding:24px;text-align:right;direction:rtl">
          <div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;margin:0 0 20px;text-align:center;direction:rtl">
            <p style="margin:0;color:#92400e;font-size:15px;font-weight:800;line-height:1.45;direction:rtl">${copy.noReplyTop}</p>
          </div>
          <p style="margin:0 0 16px;color:#1e293b;font-size:16px;line-height:1.65;direction:rtl;text-align:right">${copy.intro}</p>
          <p style="margin:0 0 8px;color:#047857;font-size:15px;font-weight:800;direction:rtl;text-align:right">${copy.summaryTitle}</p>
          <p style="margin:0 0 12px;color:#64748b;font-size:13px;direction:rtl;text-align:right">${copy.summarySubtitle}</p>
          <table dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;direction:rtl">${table}</table>
          <p style="margin:20px 0 0;color:#64748b;font-size:14px;line-height:1.55;direction:rtl;text-align:right">${copy.closing}</p>
          <p style="margin:24px 0 0;text-align:center;direction:rtl">
            <a href="${origin}/home" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;font-size:15px">${copy.cta}</a>
          </p>
          <p style="margin:24px 0 0;padding:14px 16px;background:#fef3c7;border:2px solid #f59e0b;border-radius:12px;color:#92400e;font-size:14px;font-weight:800;text-align:center;line-height:1.45;direction:rtl">${copy.noReplyBottom}</p>
        </td></tr>
        <tr><td dir="rtl" style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
          <p style="margin:0;color:#94a3b8;font-size:12px;direction:rtl">דולב · מנטור הקליטה · NuraWell</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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
