import { FRICTION_META } from '../almog-commitments/friction';
import type { RiskWindow } from '../risk-window';

function firstNameFromFullName(fullName: string | null | undefined): string {
  const first = fullName?.trim().split(/\s+/)[0]?.trim();
  return first || 'שם';
}

function daypartForWindow(window: RiskWindow): string {
  const hour = Number(window.start_hhmm.slice(0, 2));
  if (!Number.isFinite(hour)) return 'הרגע הקרוב';
  if (hour >= 17 || hour < 5) return 'הערב';
  if (hour >= 12) return 'הצהריים';
  return 'הבוקר';
}

function supportiveStep(window: RiskWindow): string {
  switch (window.trigger) {
    case 'emotional':
      return 'בוא ניקח רגע נשימה אחת ארוכה ונבחר משהו קטן שמרגיע, בלי החלטות גדולות.';
    case 'physiological':
      return 'בוא נשתה מים ונבדוק בעדינות מה הגוף באמת מבקש עכשיו.';
    case 'social':
      return 'בוא נשלח הודעה קצרה למישהו קרוב או פשוט נזוז למקום רגוע יותר לדקה.';
    case 'logistical':
      return 'בוא נשנה סביבה לדקה אחת, רק כדי לשבור את האוטומט.';
    case 'motivational':
      return 'בוא נזכור במשפט אחד למה התחלת, ואז נעשה צעד של 60 שניות.';
    case 'knowledge':
      return 'בוא נבחר צעד אחד ברור לדקה הקרובה, לא תוכנית לכל היום.';
    case 'cognitive':
    default:
      return 'בוא נקטין את זה לדקה אחת פשוטה: נשימה, מים, או צעד קטן מהמקום.';
  }
}

export function buildGuardianTouch(params: {
  fullName?: string | null;
  window: RiskWindow;
  leadMin: number;
}): { title: string; body: string; iconEmoji: string } {
  const firstName = firstNameFromFullName(params.fullName);
  const meta = FRICTION_META[params.window.trigger];
  const daypart = daypartForWindow(params.window);
  const body = [
    `${firstName}, שמתי לב ש${daypart} לפעמים יכול להיות רגע קצת רגיש.`,
    `לא באתי לשמור עליך, רק להיות פה איתך רגע. ${supportiveStep(params.window)}`,
    'אתה איתי לדקה?',
  ].join(' ');

  return {
    title: `${firstName} ${meta.emoji}`,
    body,
    iconEmoji: meta.emoji,
  };
}
