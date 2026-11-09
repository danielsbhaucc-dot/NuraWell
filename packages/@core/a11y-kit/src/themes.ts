/** ערכות נושא מוכנות למוצרים. כל אחת עוברת defineA11yTheme ⇒ ניגודיות נבדקת בטעינה. */
import { defineA11yTheme } from './core.ts';

/**
 * NuraWell: זכוכית ירוקה־כהה/טורקיז, Heebo לגוף ו־Rubik לכותרות (המארח מאחסן בעצמו דרך next/font,
 * ולכן קודם משתנה ה־CSS של next/font ואחריו השם עצמו), כפתור צף עגול טורקיז בתחילת השורה.
 */
export const NURAWELL_THEME = defineA11yTheme({
  id: 'nurawell',
  colors: {
    bg: '#071A17', surface: '#0E2A25', fg: '#EEF8F5', fgMuted: '#A7CEC5',
    // design-lint-allow: danger/HC text color on a dark surface (contrast-checked by validateTheme), not a light surface
    primary: '#2BB5A3', onPrimary: '#03201B', focus: '#FFD166', link: '#8BE9DA', danger: '#FFA8A8',
  },
  fonts: {
    body: 'var(--font-heebo), "Heebo", system-ui, sans-serif',
    heading: 'var(--font-rubik), "Rubik", "Heebo", system-ui, sans-serif',
  },
  radius: { sm: 10, md: 16, lg: 24, pill: 999 },
  panel: { side: 'start', maxWidth: 400, maxZoom: 1.25 },
  fab: { size: 56, gap: 16 },
  glass: true,
});

/** Nehora: מקום שמור — טוקנים זמניים עד שיאושר עיצוב. */
export const NEHORA_THEME = defineA11yTheme({
  id: 'nehora',
  colors: {
    bg: '#14111F', surface: '#1F1A2E', fg: '#F6F2FF', fgMuted: '#C4BBDA',
    // design-lint-allow: danger/HC text color on a dark surface (contrast-checked by validateTheme), not a light surface
    primary: '#F2B84B', onPrimary: '#1A1405', focus: '#8FD3FF', link: '#C9B8FF', danger: '#FF9E9E',
  },
  fonts: { body: '"Assistant", system-ui, sans-serif', heading: '"Assistant", system-ui, sans-serif' },
  panel: { side: 'start', maxWidth: 380, maxZoom: 1.25 },
});

export const THEMES = { nurawell: NURAWELL_THEME, nehora: NEHORA_THEME } as const;
