# @core/a11y-kit

ערכת נושא לתפריט הנגישות. כל פרויקט וכל לקוח פרטי מקבל צבעים, גופנים, פינות, ריווח, כיוון (RTL/LTR) וגודל טקסט משלו, בלי לפצל קוד. כל ערכה עוברת בדיקת ניגודיות לפני שהיא נכנסת לשימוש.

## הגדרת ערכה לפרויקט / ללקוח
```ts
import { defineA11yTheme, themeToCss } from '@core/a11y-kit';

export const vetTheme = defineA11yTheme({
  id: 'vet-clinic',                       // a-z, 0-9, מקף
  colors: { primary: '#0A5C44', onPrimary: '#FFFFFF', focus: '#FFD166' },
  fonts: { body: '"Assistant", system-ui, sans-serif' },
  radius: { md: 4 },                      // px
  spacing: { tileGap: 12 },               // px
  dir: 'rtl', lang: 'he',
  fontScale: { default: 1, max: 1.6, steps: 4 },
  panel: { side: 'end', maxWidth: 380, maxZoom: 1.25 },
  features: ['readingGuide', 'readingMask', 'dyslexiaFont'], // רצפת החובה נוספת אוטומטית
});

document.head.append(Object.assign(document.createElement('style'), {
  textContent: themeToCss(vetTheme, '[data-a11y-theme="vet-clinic"]'),
}));
```
- מה שלא הוגדר נלקח מ־`DEFAULT_THEME`. מפתחות לא מוכרים ו־`__proto__` נזרקים.
- ערכה לא תקינה זורקת `A11yThemeError` עם `issues: [{ path, reason }]` בעברית.
- אפשר לרשת מערכה אחרת: `defineA11yTheme({ id: 'client-b', colors: {...} }, vetTheme)`.

## טוקנים
| קבוצה | שדות |
|---|---|
| `colors` | `bg surface fg fgMuted primary onPrimary focus link danger` (hex) |
| `highContrast` | `blackYellow`, `light` — כל אחד `bg fg link focus` |
| `fonts` | `body heading dyslexia` (font-family) |
| `radius` | `sm md lg pill` (px) |
| `spacing` | `unit panelPadding tileGap` (px) |
| `dir` / `lang` | `'rtl' \| 'ltr'` / BCP-47 |
| `fontScale` | `default min max steps` (min = 1, max ≥ 1.32) |
| `panel` | `side maxWidth maxZoom` |
| `features` | רשימת כלים מתוך `FEATURES` |

משתני CSS שנוצרים: `--a11y-bg`, `--a11y-on-primary`, `--a11y-hc-light-bg`, `--a11y-font-body`, `--a11y-radius-md`, `--a11y-tile-gap`, `--a11y-panel-max-width`, `--a11y-font-scale` ועוד (`themeToCssVars`).

## בדיקת ניגודיות
| זוג | סף |
|---|---|
| fg/bg, fg/surface, fgMuted/surface, onPrimary/primary, link/surface, danger/surface | 4.5:1 |
| focus/bg, focus/surface | 3:1 |
| מצבי ניגודיות גבוהה (fg, link, focus מול bg) | 7:1 |

מצב "בהיר" חייב רקע בהיר באמת (לא היפוך צבעים).

## אפשרויות קונסולה בסיסיות
```ts
import { applyConsoleOverrides, CONSOLE_FIELDS } from '@core/a11y-kit';

const { theme, applied, rejected } = applyConsoleOverrides(vetTheme, {
  primary: '#5B3FD6', radius: 24, dir: 'ltr', tileGap: 12,
  fg: '#20263A',            // נדחה: ניגודיות נמוכה, נשאר הצבע הקודם
  features: ['readingGuide'] // רצפת החובה נשארת פעילה, מתועד ב־rejected
});
```
`CONSOLE_FIELDS` מתאר את הטופס: `primary onPrimary bg surface fg focus link` (צבע), `fontBody` (רשימה סגורה), `radius` (חד/רגיל/עגול), `tileGap`, `dir`, `side`, `fontScaleDefault`, `features` (עם `locked`).
הפונקציה לא זורקת: כל שדה נבדק לבד, ושדה שנכשל לא נכנס.

## רצפת חובה ו־gating
`LEGAL_FLOOR = keyboardNav, highlightFocus, fontSize, contrast, stopAnimations, statement` תמיד פעילים.
`effectiveFeatures(theme, gate)` — הכלים שמוצגים בפועל; אם `gate` נופל, הכלי נשאר פעיל (fail-open), ורצפת החובה תמיד למעלה.

## עזרים
- `panelZoom(theme, fontScale)` — zoom לפאנל, מוגבל ל־1…`panel.maxZoom`, כדי שלא יגלוש ב־320px.
- `contrastRatio(a, b)`, `validateTheme(t)`.

## אבטחה
אין קריאות רשת. צבעים רק hex, גופנים בלי `; { } < >`, סלקטור של `themeToCss` מסונן.

## הווידג'ט המלא (0.2.0)
ערכה עצמאית בלי React ובלי תלויות: כפתור צף עגול, גיליון תחתון שנסגר בהחלקה למטה, ו־12 התיקונים של מעשר ישר (PR #6).
```ts
import { mountA11yWidget, NURAWELL_THEME, fabReserveCss } from '@core/a11y-kit';

const a11y = mountA11yWidget({
  theme: NURAWELL_THEME,          // או NEHORA_THEME / ערכה משלך
  fontBase: '/a11y-fonts',        // המארח מגיש את assets/fonts באותו מקור. בלי שירותי גופנים חיצוניים
  statementHref: '/accessibility',
});
// a11y.open() · close() · reset() · get() · set({ boldText: true }) · relayout() · destroy()
```
- **ערכות:** `NURAWELL_THEME` (זכוכית ירוק־כהה/טורקיז, Heebo/Rubik דרך `var(--font-heebo)`/`var(--font-rubik)` של המארח, כפתור טורקיז עגול בפינת ההתחלה), `NEHORA_THEME` (מקום שמור), `THEMES`.
- **קיצורים:** Alt/Option+A פותח וסוגר, Alt+R מאפס. ההתאמה לפי `e.code`, אז עובד גם במקלדת עברית וב־Mac.
- **שמירה:** `localStorage` במפתח `core-a11y:v1:<id>`, וכל ערך מסונן בטעינה.

### כפתור צף בטוח (אזור שמור)
שורש הבעיה "הכפתור מכסה את כפתור הכניסה" נפתר בשתי שכבות:
1. **חוזה CSS:** הווידג'ט מפרסם על `<html>` את `--a11y-fab-reserve-block`, `--a11y-fab-reserve-inline` ו־`--a11y-fab-lift`. המארח מוסיף `fabReserveCss()` ואת המחלקה `.a11y-fab-safe` לתוכן הגולל, כדי שסוף הדף תמיד יוכל לגלול אל מחוץ לכפתור.
2. **הרמה אוטומטית:** סרגלים קבועים או דביקים בתחתית, `button[type=submit]`, `[data-a11y-primary]` ו־`[data-a11y-avoid]` נמדדים. הכפתור עולה מעליהם עם כל resize, גלילה, שינוי DOM ושינוי גודל טקסט או זום.
3. **בבדיקות:** `findFabOverlaps(document, { pinnedOnly: true })` בכל מצב, ו־`findFabOverlaps(document)` אחרי גלילה לסוף. מערך ריק = תקין.

### מיפוי מול מעשר ישר PR #6
| # | תיקון ב־Maaser #6 | בערכה |
|---|---|---|
| 1 | ניגודיות גבוהה בהירה אמיתית, ≥7:1 | פלטה מלאה (`#0033CC`/`#B00020`), גם בתוך הפאנל, + צבעי סטטוס HC |
| 2 | גופן דיסלקציה Alef מקומי | `assets/fonts` (OFL) + `dyslexiaFontFace` שחוסם מקור חיצוני |
| 3 | `role=switch` + `aria-checked`, Space | כפתור native, בלי keydown כפול |
| 4 | מחזוריים: `aria-pressed` + "רמה X מתוך N" | כנ"ל |
| 5 | אקורדיון `aria-expanded` | + `aria-controls` |
| 6 | בורר מקטעים `role=radio` | radiogroup + חצים (RTL) + roving tabindex |
| 7 | פוקוס בדיאלוג יציב | מלכודת Tab, ניסיון חוזר, החזרת פוקוס לכפתור |
| 8 | zoom לפאנל 1…1.25, `min(380px, 100vw/zoom)` | כנ"ל, לפי `panel.maxWidth` של הערכה |
| 9 | שקיפות מופחתת אמיתית | מיזוג rgba לרקע הערכה, הפיך |
| 10 | השתקת מדיה בלי הסתרה | muted + pause, שחזור ב־destroy |
| 11 | prefers-reduced-motion | תמיד פעיל |
| 12 | Alt+A לפי `e.code` | + Alt+R, + fallback לעברית |
| + | סגירה בגרירה, רוויה, ‏tablist | החלקה למטה (מגע ועכבר), רוויה, אקורדיון במקום tablist |

### שילוב ב־NuraWell (אחרי עבודת ההתחברות)
1. להעתיק את `packages/a11y-kit/assets/fonts` אל `public/a11y-fonts`.
2. רכיב client אחד ב־layout: `useEffect(() => { const w = mountA11yWidget({ theme: NURAWELL_THEME, fontBase: '/a11y-fonts', statementHref: '/accessibility' }); return () => w.destroy(); }, [])`.
3. להוסיף `fabReserveCss()` ל־CSS הגלובלי, ו־`.a11y-fab-safe` לעטיפת התוכן הגולל ולגיליונות עם כפתור בתחתית. כפתורים ראשיים מקבלים `data-a11y-primary`.
4. להסיר את הווידג'ט הישן.
5. להריץ את `demo/e2e.mjs` על הדפים האמיתיים: 320/360/390 × טקסט 130% / זום 130% ו־1440.

### הדגמה ובדיקות דפדפן
```sh
node packages/a11y-kit/demo/build.mjs
PW_DIR=/path/to/node_modules node packages/a11y-kit/demo/e2e.mjs packages/a11y-kit/demo/dist /tmp/a11y/shots
```
הבדיקות: axe WCAG 2.2 AA = 0 (סגור, פתוח, ניגודיות גבוהה), אין גלישה, אין חפיפה של הכפתור, מקלדת (Enter/Esc/Alt+R), החלקה לסגירה, אין בקשות רשת חיצוניות.
