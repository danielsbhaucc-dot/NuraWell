import type { OnboardingGender } from '../onboarding/types';

export type LessonGenderCopy = {
  letsStartTogether: string;
  videoIntro: string;
  watchedContinue: string;
  watchedToQuestions: string;
  quizLetsCheck: string;
  quizContinueTogether: string;
  quizAnsweredCorrect: (score: number, total: number) => string;
  quizMapSubtitle: string;
  gameLetsCheck: string;
  gameCompleteSubtitle: string;
  gameMapSubtitle: string;
  commitmentLetsTalk: string;
  summaryLetsSummarize: string;
  summaryLearnSubtitle: string;
  youAnswered: string;
  youMarked: string;
};

export function lessonGenderCopy(
  gender: OnboardingGender | 'male' | 'female' | '' | null | undefined
): LessonGenderCopy {
  if (gender === 'male') {
    return {
      letsStartTogether: 'בוא נתחיל יחד',
      videoIntro: 'אני מלווה אותך בסרטון — תרגיש בנוח, קח נשימה, ונמשיך בקצב שלך.',
      watchedContinue: 'צפיתי, בוא נמשיך יחד!',
      watchedToQuestions: 'מעולה — בוא לשאלות',
      quizLetsCheck: 'שאלות הבנה — בוא נבדוק יחד',
      quizContinueTogether: 'אני כאן איתך — בוא נמשיך יחד',
      quizAnsweredCorrect: (score, total) =>
        `ענית נכון על ${score} מתוך ${total} — אני גאה בך.`,
      quizMapSubtitle: 'ככה אני רואה את מה שענית בכל שאלה',
      gameLetsCheck: 'נכון או לא? — בוא נבדוק את האינטואיציה',
      gameCompleteSubtitle: 'אהבתי את האינטואיציה שלך — נמשיך?',
      gameMapSubtitle: 'ככה אני רואה את מה שסימנת מול מה שבאמת נכון',
      commitmentLetsTalk: 'בוא נדבר על ההתחייבות 💪',
      summaryLetsSummarize: 'בוא נסכם יחד את מה שעברנו — אני איתך עד הסוף.',
      summaryLearnSubtitle: 'אלה הנקודות שחשוב לי שתיקח מהשיעור',
      youAnswered: 'מה שענית',
      youMarked: 'מה שסימנת',
    };
  }
  if (gender === 'female') {
    return {
      letsStartTogether: 'בואי נתחיל יחד',
      videoIntro: 'אני מלווה אותך בסרטון — תרגישי בנוח, קחי נשימה, ונמשיך בקצב שלך.',
      watchedContinue: 'צפיתי, בואי נמשיך יחד!',
      watchedToQuestions: 'מעולה — בואי לשאלות',
      quizLetsCheck: 'שאלות הבנה — בואי נבדוק יחד',
      quizContinueTogether: 'אני כאן איתך — בואי נמשיך יחד',
      quizAnsweredCorrect: (score, total) =>
        `ענית נכון על ${score} מתוך ${total} — אני גאה בך.`,
      quizMapSubtitle: 'ככה אני רואה את מה שענית בכל שאלה',
      gameLetsCheck: 'נכון או לא? — בואי נבדוק את האינטואיציה',
      gameCompleteSubtitle: 'אהבתי את האינטואיציה שלך — נמשיך?',
      gameMapSubtitle: 'ככה אני רואה את מה שסימנת מול מה שבאמת נכון',
      commitmentLetsTalk: 'בואי נדבר על ההתחייבות 💪',
      summaryLetsSummarize: 'בואי נסכם יחד את מה שעברנו — אני איתך עד הסוף.',
      summaryLearnSubtitle: 'אלה הנקודות שחשוב לי שתיקחי מהשיעור',
      youAnswered: 'מה שענית',
      youMarked: 'מה שסימנת',
    };
  }
  return {
    letsStartTogether: 'בוא/י נתחיל יחד',
    videoIntro: 'אני מלווה אותך בסרטון — תרגיש/י בנוח, קח/י נשימה, ונמשיך בקצב שלך.',
    watchedContinue: 'צפיתי, בוא/י נמשיך יחד!',
    watchedToQuestions: 'מעולה — בוא/י לשאלות',
    quizLetsCheck: 'שאלות הבנה — בוא/י נבדוק יחד',
    quizContinueTogether: 'אני כאן איתך — בוא/י נמשיך יחד',
    quizAnsweredCorrect: (score, total) =>
      `ענית נכון על ${score} מתוך ${total} — אני גאה בך.`,
    quizMapSubtitle: 'ככה אני רואה את מה שענית בכל שאלה',
    gameLetsCheck: 'נכון או לא? — בוא/י נבדוק את האינטואיציה',
    gameCompleteSubtitle: 'אהבתי את האינטואיציה שלך — נמשיך?',
    gameMapSubtitle: 'ככה אני רואה את מה שסימנת מול מה שבאמת נכון',
    commitmentLetsTalk: 'בוא/י נדבר על ההתחייבות 💪',
    summaryLetsSummarize: 'בוא/י נסכם יחד את מה שעברנו — אני איתך עד הסוף.',
    summaryLearnSubtitle: 'אלה הנקודות שחשוב לי שתיקח/י מהשיעור',
    youAnswered: 'מה שענית',
    youMarked: 'מה שסימנת',
  };
}
