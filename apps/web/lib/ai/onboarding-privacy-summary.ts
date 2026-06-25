import type { OnboardingExtracted } from './onboarding-chat-llm';

type Gender = 'male' | 'female' | null;

const FIELD_ACKS: Array<{
  test: (e: OnboardingExtracted) => boolean;
  male: string;
  female: string;
  neutral: string;
}> = [
  {
    test: (e) => Boolean(e.full_name),
    male: 'סיפרת לי איך קוראים לך (נשמר בפרטיות)',
    female: 'סיפרת לי איך קוראים לך (נשמר בפרטיות)',
    neutral: 'קיבלתי את השם שלך (נשמר בפרטיות)',
  },
  {
    test: (e) => Boolean(e.gender),
    male: 'יודע איך לפנות אליך',
    female: 'יודע איך לפנות אלייך',
    neutral: 'יודע איך לפנות אליך/י',
  },
  {
    test: (e) => Boolean(e.main_goal),
    male: 'הבנו יחד מה המטרה שלך',
    female: 'הבנו יחד מה המטרה שלך',
    neutral: 'הבנו מה המטרה',
  },
  {
    test: (e) => typeof e.current_weight_kg === 'number' || typeof e.goal_weight_kg === 'number',
    male: 'עדכנת משקלים — לא אחשוף את המספרים כאן',
    female: 'עדכנת משקלים — לא אחשוף את המספרים כאן',
    neutral: 'עדכנת משקלים (הפרטים נשמרו בפרטיות)',
  },
  {
    test: (e) => Boolean(e.weakest_time_of_day),
    male: 'זיהינו מתי היום הכי קשה לך',
    female: 'זיהינו מתי היום הכי קשה לך',
    neutral: 'זיהינו את החלון הקשה ביום',
  },
  {
    test: (e) => Boolean(e.main_obstacle),
    male: 'דיברנו על מה מעכב אותך',
    female: 'דיברנו על מה מעכב אותך',
    neutral: 'דיברנו על המכשול המרכזי',
  },
  {
    test: (e) => Boolean(e.wake_up_time && e.sleep_time),
    male: 'סידרנו שעות יום (השכמה ושינה)',
    female: 'סידרנו שעות יום (השכמה ושינה)',
    neutral: 'סידרנו שעות יום',
  },
];

function pick(gender: Gender, row: (typeof FIELD_ACKS)[number]): string {
  if (gender === 'female') return row.female;
  if (gender === 'male') return row.male;
  return row.neutral;
}

/** סיכום ללא חשיפת PII — לתצוגה בהיסטוריית שיחות */
export function buildPrivacySafeProfileSummary(
  extracted: OnboardingExtracted,
  gender: Gender
): string {
  const lines = FIELD_ACKS.filter((r) => r.test(extracted)).map((r) => pick(gender, r));

  if (lines.length === 0) {
    return gender === 'female'
      ? 'עדכנו יחד את הפרופיל — בלי לחשוף פרטים כאן 🔒'
      : 'עדכנו יחד את הפרופיל — בלי לחשוף פרטים כאן 🔒';
  }

  const opener =
    gender === 'female'
      ? 'סיכום עדכון פרופיל (פרטיות):'
      : gender === 'male'
        ? 'סיכום עדכון פרופיל (פרטיות):'
        : 'סיכום עדכון פרופיל:';

  return `${opener} ${lines.join(' · ')}`;
}
