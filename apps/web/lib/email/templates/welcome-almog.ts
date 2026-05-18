import type { OnboardingProfileForChat } from '@/lib/ai/onboarding-chat-context';

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

function row(label: string, value: string): string {
  return `<tr><td style="padding:8px 12px;color:#6b7280;font-size:14px;white-space:nowrap">${label}</td><td style="padding:8px 12px;color:#064e3b;font-size:14px;font-weight:600">${value}</td></tr>`;
}

export function buildWelcomeAlmogEmailHtml(
  firstName: string,
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
  >
): string {
  const meals =
    profile.meal_schedule?.length ?
      profile.meal_schedule.map((m) => `${m.time} (${m.label})`).join(', ')
    : 'לפי לוח כללי';

  const table = [
    row('מטרה', profile.main_goal ? (GOAL_HE[profile.main_goal] ?? profile.main_goal) : '—'),
    row('משקל נוכחי', profile.current_weight_kg ? `${profile.current_weight_kg} ק״ג` : '—'),
    row('משקל יעד', profile.goal_weight_kg ? `${profile.goal_weight_kg} ק״ג` : '—'),
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
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;background:#ecfdf5;font-family:Rubik,Heebo,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf5;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 12px 40px rgba(6,78,59,0.12)">
        <tr><td style="background:linear-gradient(135deg,#047857,#0d9488);padding:28px 24px">
          <p style="margin:0;color:#d1fae5;font-size:13px">NuraWell · אלמוג</p>
          <h1 style="margin:8px 0 0;color:#fff;font-size:22px">שלום ${firstName} 🌿</h1>
        </td></tr>
        <tr><td style="padding:24px">
          <p style="margin:0 0 16px;color:#1e293b;font-size:16px;line-height:1.6">
            איזה כיף שהצטרפת! קיבלתי את כל מה שמילאת בהרשמה — ואני כבר מתכנן איך ללוות אותך בקצב שלך, בלי שיפוט ובלי לחץ.
          </p>
          <p style="margin:0 0 12px;color:#047857;font-size:14px;font-weight:700">מה ששמרתי עליך:</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0">${table}</table>
          <p style="margin:20px 0 0;color:#64748b;font-size:14px;line-height:1.55">
            בקרוב תקבל/י ממני גם הודעות באפליקציה בזמנים שמתאימים לך — במיוחד לפני הרגעים הקשים.
          </p>
          <p style="margin:24px 0 0;text-align:center">
            <a href="https://nurawell.ai/home" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;font-size:15px">כניסה לאפליקציה</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0">
          <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center">אלמוג · המנטור האישי שלך ב-NuraWell</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildWelcomeAlmogEmailText(firstName: string): string {
  return `שלום ${firstName},

איזה כיף שהצטרפת ל-NuraWell! אני אלמוג — קיבלתי את מה שמילאת בהרשמה ואלווה אותך בקצב שלך.

כניסה לאפליקציה: https://nurawell.ai/home

— אלמוג`;
}
