export type ChallengeCelebration = {
  key: string;
  title: string;
  subtitle: string;
  emoji: string;
  variant: 'default' | 'water' | 'movement' | 'food' | 'moon' | 'day_complete';
};

const BY_TASK_KEY: Record<string, Omit<ChallengeCelebration, 'key'>> = {
  water_morning: {
    title: 'בוקר של אלופים!',
    subtitle: '2 כוסות מים — הגוף מתעורר נכון.',
    emoji: '💧',
    variant: 'water',
  },
  water_before_meals: {
    title: 'מים לפני — בול!',
    subtitle: 'הרגל קטן שמשנה את כל הארוחה.',
    emoji: '💧',
    variant: 'water',
  },
  eating_window: {
    title: 'עמדת בחלון!',
    subtitle: '12:12 זה לא דיאטה — זו משמעת חכמה.',
    emoji: '⏰',
    variant: 'default',
  },
  walk_after_meal: {
    title: 'תנועה אחרי ארוחה!',
    subtitle: '10 דקות — והגוף מודה לך.',
    emoji: '🚶',
    variant: 'movement',
  },
  clean_meal: {
    title: 'ארוחה נקייה!',
    subtitle: 'בלי סוכר מיותר — זו ניצחון אמיתי.',
    emoji: '🌿',
    variant: 'food',
  },
  protein_veg: {
    title: 'חלבון + ירק!',
    subtitle: 'הצלחת לבנות ארוחה מאוזנת.',
    emoji: '🥗',
    variant: 'food',
  },
  sleep_buffer: {
    title: 'מרווח לפני שינה!',
    subtitle: 'הגוף צריך זמן לעכל — עשית נכון.',
    emoji: '🌙',
    variant: 'moon',
  },
};

const BY_CELEBRATION_KEY: Record<string, Omit<ChallengeCelebration, 'key'>> = {
  droplets: BY_TASK_KEY.water_morning,
  clock: BY_TASK_KEY.eating_window,
  footprints: BY_TASK_KEY.walk_after_meal,
  leaf: BY_TASK_KEY.clean_meal,
  salad: BY_TASK_KEY.protein_veg,
  moon: BY_TASK_KEY.sleep_buffer,
  sparkle: {
    title: 'עוד הצלחה!',
    subtitle: 'כל סימון קטן נספר — אלמוג רואה.',
    emoji: '✨',
    variant: 'default',
  },
};

export function getCelebrationForTask(params: {
  taskKey: string;
  celebrationKey?: string | null;
  slotLabel?: string | null;
  dayComplete?: boolean;
  dayIndex?: number;
}): ChallengeCelebration {
  if (params.dayComplete && params.dayIndex) {
    return {
      key: 'day_complete',
      title: `יום ${params.dayIndex} הושלם!`,
      subtitle: 'כל המשימות של היום — זו הצלחה אמיתית.',
      emoji: '🏆',
      variant: 'day_complete',
    };
  }

  const base =
    BY_TASK_KEY[params.taskKey] ??
    (params.celebrationKey ? BY_CELEBRATION_KEY[params.celebrationKey] : null) ??
    BY_CELEBRATION_KEY.sparkle;

  if (params.slotLabel) {
    return {
      key: `${params.taskKey}:${params.slotLabel}`,
      title: base.title,
      subtitle: `${params.slotLabel} — ${base.subtitle}`,
      emoji: base.emoji,
      variant: base.variant,
    };
  }

  return { key: params.taskKey, ...base };
}
