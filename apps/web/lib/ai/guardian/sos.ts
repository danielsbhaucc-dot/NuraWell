import {
  FRICTION_META,
  normalizeFrictionCategory,
  type FrictionCategory,
  type StrategyType,
} from '../almog-commitments/friction';
import type { GeneratedPivotResult } from '../almog-commitments/intervention-engine';

export const SOS_LLM_TIMEOUT_MS = 2000;
export const SOS_DAILY_SOFT_LIMIT = 6;
export const SOS_TIMEZONE = 'Asia/Jerusalem';

export type SosTrigger = FrictionCategory;

export type SosIntervention = {
  message: string;
  label: string;
  micro_step: string;
  strategy_type: StrategyType;
  category: FrictionCategory;
  used_fallback: boolean;
};

const FALLBACKS: Record<FrictionCategory, SosIntervention> = {
  emotional: {
    category: 'emotional',
    used_fallback: true,
    strategy_type: 'emotional_regulation',
    label: 'דקת נשימה',
    message: 'יופי שלחצת. זה רגע קשה, לא כישלון. אני פה איתך.',
    micro_step: 'בוא ניקח 3 נשימות איטיות, ואז נתרחק מהמקום לדקה אחת בלבד. בלי החלטות גדולות עכשיו.',
  },
  physiological: {
    category: 'physiological',
    used_fallback: true,
    strategy_type: 'physiological_adjustment',
    label: 'בדיקת גוף',
    message: 'טוב שעצרת רגע. הגוף לפעמים צועק, ואנחנו נענה לו בעדינות.',
    micro_step: 'בוא נשתה מים ונשאל בשקט: רעב, עייפות או לחץ? רק לזהות, לא לשפוט.',
  },
  logistical: {
    category: 'logistical',
    used_fallback: true,
    strategy_type: 'environment_design',
    label: 'שינוי מקום',
    message: 'מעולה שתפסת את זה בזמן. נקל על הרגע במקום להילחם בו.',
    micro_step: 'בוא נזוז לחדר אחר ל-60 שניות ונשים משהו קטן בינך לבין האוטומט.',
  },
  cognitive: {
    category: 'cognitive',
    used_fallback: true,
    strategy_type: 'micro_habit',
    label: 'צעד קטן',
    message: 'זה בסדר שזה מרגיש גדול. כרגע צריך רק צעד אחד קטן.',
    micro_step: 'בוא נבחר פעולה אחת של דקה: נשימה, מים, או הודעה לאדם קרוב. רק אחת.',
  },
  social: {
    category: 'social',
    used_fallback: true,
    strategy_type: 'social_accountability',
    label: 'לא לבד',
    message: 'זה רגע שקל להישאר בו לבד, וטוב שביקשת עזרה.',
    micro_step: 'בוא נשלח למישהו קרוב הודעה קצרה: "קצת קשה לי עכשיו, תהיה איתי רגע?".',
  },
  knowledge: {
    category: 'knowledge',
    used_fallback: true,
    strategy_type: 'how_to',
    label: 'פירוק פשוט',
    message: 'לא צריך להבין את כל היום עכשיו. רק את הדקה הקרובה.',
    micro_step: 'בוא נכתוב בשורה אחת מה קורה עכשיו, ואז נבחר צעד אחד שלא קשור לאוכל למשך דקה.',
  },
  motivational: {
    category: 'motivational',
    used_fallback: true,
    strategy_type: 'value_linking',
    label: 'למה קטן',
    message: 'אני איתך. לא צריך מוטיבציה גדולה כדי לעבור דקה אחת.',
    micro_step: 'בוא ניזכר במשפט אחד למה התחלת, ואז נעשה 60 שניות של מרחק מהאוטומט.',
  },
};

export function normalizeSosTrigger(trigger: unknown): SosTrigger {
  if (typeof trigger !== 'string') return 'emotional';
  if (trigger === 'stress' || trigger === 'לחוץ') return 'emotional';
  if (trigger === 'bored' || trigger === 'משעמם') return 'motivational';
  if (trigger === 'craving' || trigger === 'סתם מתחשק') return 'physiological';
  return normalizeFrictionCategory(trigger);
}

export function buildDeterministicSosFallback(trigger: unknown): SosIntervention {
  return FALLBACKS[normalizeSosTrigger(trigger)];
}

export function buildSosInterventionFromPivot(pivot: GeneratedPivotResult): SosIntervention {
  const category = normalizeFrictionCategory(pivot.category);
  const fallback = FALLBACKS[category];
  const empathy = pivot.empathy?.trim() || fallback.message;
  const microStep = pivot.proposal.micro_step?.trim() || fallback.micro_step;

  return {
    category,
    used_fallback: false,
    strategy_type: pivot.proposal.strategy_type,
    label: pivot.proposal.label?.trim() || FRICTION_META[category].labelHe,
    message: `${empathy}\n\n${microStep}`,
    micro_step: microStep,
  };
}

export function buildSosSlowDownMessage(): SosIntervention {
  return {
    category: 'emotional',
    used_fallback: true,
    strategy_type: 'social_accountability',
    label: 'אדם אמיתי',
    message:
      'אני שם לב שהיום ממש קשה. במקום עוד תרגיל, עדיף רגע להוריד הילוך ולדבר עם אדם אמיתי. אם יש סכנה מיידית התקשר/י ל-101 או 100, ואפשר גם לפנות לערן ב-1201.',
    micro_step: 'בוא נשלח עכשיו הודעה קצרה למישהו קרוב: "קשה לי היום, אפשר להיות איתי רגע?".',
  };
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs = SOS_LLM_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('SOS_LLM_TIMEOUT')), timeoutMs);
    }),
  ]);
}
