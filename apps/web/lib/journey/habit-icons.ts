import {
  Apple, Brain, Check, Cookie, Dumbbell, Footprints, GlassWater, HeartHandshake, Home, Leaf, Lock, Moon, Scale,
  ShieldCheck, Sprout, Sun, Users, Utensils, Egg, CupSoda, Timer, Gauge, ClipboardList, Carrot, Wind, type LucideIcon,
} from 'lucide-react';

/**
 * Habit key → line icon for the journey map. Admins set `journey_stations.habit_key`; unknown/empty keys
 * fall back to a title keyword match, then to a generic icon. Add new habits here (one line each).
 */
export const HABIT_ICONS: Record<string, LucideIcon> = {
  foundation: Sprout,
  water: GlassWater,
  sleep: Moon,
  movement: Dumbbell,
  walking: Footprints,
  meals: Utensils,
  nutrition: Apple,
  vegetables: Leaf,
  cravings: Cookie,
  emotional_eating: HeartHandshake,
  stress: Brain,
  mindfulness: Sun,
  environment: Home,
  social: Users,
  weighing: Scale,
  maintenance: ShieldCheck,
  // 14-station curriculum
  protein: Egg,
  drinks: CupSoda,
  slow_eating: Timer,
  hunger: Gauge,
  planning: ClipboardList,
  whole_food: Carrot,
  breathing: Wind,
};

const TITLE_HINTS: [RegExp, string][] = [
  [/בסיס|יסוד|התחל/, 'foundation'],
  [/שינה|לילה/, 'sleep'],
  [/מים|שתי/, 'water'],
  [/הליכה|צעדים/, 'walking'],
  [/תנועה|גוף|ספורט|פעיל/, 'movement'],
  [/ירק|פרי/, 'vegetables'],
  [/נשנוש|מתוק|חשק/, 'cravings'],
  [/רגש/, 'emotional_eating'],
  [/לחץ|נשימה|רוגע|מתח/, 'stress'],
  [/מודע|קשוב/, 'mindfulness'],
  [/סביבה|בית|מטבח/, 'environment'],
  [/חברה|משפחה|אירוע/, 'social'],
  [/שקיל|מדיד/, 'weighing'],
  [/שימור|לאורך זמן|שומרים/, 'maintenance'],
  [/ארוח|אכיל|צלחת|תפריט/, 'meals'],
];

export function resolveHabitKey(habitKey: string | null | undefined, title: string): string | null {
  if (habitKey && HABIT_ICONS[habitKey]) return habitKey;
  return TITLE_HINTS.find(([re]) => re.test(title))?.[1] ?? null;
}

export function habitIcon(habitKey: string | null | undefined, title: string, state: 'done' | 'current' | 'locked'): LucideIcon {
  if (state === 'locked') return Lock;
  const key = resolveHabitKey(habitKey, title);
  return (key && HABIT_ICONS[key]) || (state === 'done' ? Check : Sprout);
}
