export type ChallengeIntroLine = {
  text: string;
  emphasis?: boolean;
};

export type ChallengeEatingWindowLesson = {
  title: string;
  body_html: string;
  video_url: string | null;
};

export const DEFAULT_EATING_WINDOW_LESSON: ChallengeEatingWindowLesson = {
  title: 'חלון אכילה 12:12 — למה זה עובד',
  body_html:
    '<p>אוכלים בתוך חלון קבוע עוזר לגוף לשרוף שומן בצורה טבעית — בלי להרעיב.</p><p><strong>12 שעות אכילה, 12 שעות מנוחה</strong> — מותאם לשעות שלך.</p><p>במהלך האתגר, אלמוג יעזור לך לעמוד בזה — זו לא דיאטה, זו הרגל.</p>',
  video_url: null,
};

export type ChallengeInterviewTurn = { role: 'user' | 'assistant'; content: string };

export type ChallengeInterviewInsights = {
  motivation?: string;
  core_struggles?: string;
  success_definition?: string;
  language_baseline?: string;
  emotional_triggers?: string;
  registration_why?: string;
};

export function parseChallengeIntroLines(raw: unknown): ChallengeIntroLine[] {
  if (!Array.isArray(raw)) return DEFAULT_INTRO_LINES;
  const lines: ChallengeIntroLine[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      lines.push({ text: item.trim() });
      continue;
    }
    if (item && typeof item === 'object' && 'text' in item) {
      const text = String((item as { text: unknown }).text ?? '').trim();
      if (text) {
        lines.push({
          text,
          emphasis: Boolean((item as { emphasis?: boolean }).emphasis),
        });
      }
    }
  }
  return lines.length ? lines : DEFAULT_INTRO_LINES;
}

export function renderIntroLine(template: string, firstName: string): string {
  return template.replace(/\{firstName\}/g, firstName);
}

export const DEFAULT_INTRO_LINES: ChallengeIntroLine[] = [
  { text: 'היי {firstName}, נעים להכיר — אני אלמוג!' },
  {
    text: 'ב-14 הימים הקרובים אני איתך צעד-צעד — בלי דיאטות קיצוניות, רק שינוי אמיתי.',
    emphasis: true,
  },
  {
    text: 'כל יום תקבל/י משימות קטנות שמוכחות שעובדות. ההצלחה שלך לא נמדדת רק במשקל.',
    emphasis: true,
  },
  { text: 'מוכן/ה? בוא/י נתחיל.' },
];

export const INTERVIEW_OPENING =
  'היי! לפני שמתחילים — בוא/י נדבר רגע. אני רוצה להכיר אותך באמת, כדי שאוכל לזהות את ההצלחות שלך לאורך הדרך.';

export const INTERVIEW_MIN_TURNS = 4;
