export type MealSlot = 'morning' | 'noon' | 'evening';

export type MealScheduleEntry = {
  time: string;
  slot: MealSlot;
  label: string;
};

const SLOT_LABEL: Record<MealSlot, string> = {
  morning: 'בוקר',
  noon: 'צהריים',
  evening: 'ערב',
};

/** ממפה שעת ארוחה לחלון יום (ישראל) */
export function classifyMealSlot(timeHHMM: string): MealSlot {
  const [h, m] = timeHHMM.split(':').map((p) => Number.parseInt(p, 10));
  const mins = (Number.isFinite(h) ? h : 12) * 60 + (Number.isFinite(m) ? m : 0);
  if (mins < 10 * 60 + 30) return 'morning';
  if (mins < 15 * 60 + 30) return 'noon';
  return 'evening';
}

export function mealSlotLabel(slot: MealSlot): string {
  return SLOT_LABEL[slot];
}

export function buildMealSchedule(times: string[]): MealScheduleEntry[] {
  return times
    .map((t) => t.trim())
    .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
    .map((time) => {
      const slot = classifyMealSlot(time);
      return { time, slot, label: mealSlotLabel(slot) };
    });
}

export function formatMealScheduleForPrompt(meals: MealScheduleEntry[]): string {
  if (!meals.length) return '';
  return meals.map((m, i) => `${i + 1}. ${m.time} (${m.label})`).join('; ');
}
