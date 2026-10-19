/**
 * ALMOG_VOICE — one consistent Hebrew voice for every Almog text (chat, notifications,
 * nudges, decay/re-engagement, celebrations). Source of truth for tests/almog-voice.test.ts.
 *
 * Daniel (2026-10-19): slang is GOOD — warm, personal, casual Israeli Hebrew. The real problems
 * were register mixing (formal + slang) and gender mismatch ("אחי" to a woman). So:
 *  - default = casual & warm with light slang, gender-matched;
 *  - mirror the user: a user who writes formally gets a toned-down register;
 *  - ONE register per user, persisted in profiles.almog_register (derived from their messages).
 */
import type { HebrewGender } from './hebrew-output-rules';

export type AlmogRegister = 'casual' | 'formal';

/** Masculine pet names / slang — OK for male users only (occasionally). */
export const MALE_ONLY_SLANG = ['אחי', 'אחיי', 'אחיה', 'גבר', 'יא גבר', 'אלוף', 'חביבי', 'יא מלך', 'מלך', 'חמוד'] as const;
/** Feminine pet names — OK for female users only. */
export const FEMALE_ONLY_SLANG = ['אחותי', 'אלופה', 'מלכה', 'חמודה', 'חביבתי'] as const;
/** Gender-neutral light slang — fine for everyone in the casual register. */
export const NEUTRAL_SLANG = ['וואלה', 'סבבה', 'יאללה', 'אחלה', 'תותח', 'מה קורה', 'מה המצב'] as const;
/** Never: odd/forced. */
export const ALWAYS_BANNED = ['חברותא', 'חברר', 'יתותח', 'יששש'] as const;
/** Back-compat export: everything that is gendered or banned. */
export const ALMOG_BANNED_SLANG = [...MALE_ONLY_SLANG, ...FEMALE_ONLY_SLANG, ...ALWAYS_BANNED] as const;

/** Formal/stiff markers — mixing these with slang is the register drift Gideon flagged. */
export const ALMOG_FORMAL_MARKERS = ['הנך', 'יקירי', 'יקירתי', 'ברצונך', 'שלום וברכה', 'נא ל', 'הינך', 'כבודו'] as const;

/** Known unnatural phrasings that actually shipped. Kept as a regression list. */
export const ALMOG_UNNATURAL_PHRASES: Array<{ bad: RegExp; why: string }> = [
  { bad: /השתיים של המים|השלוש של המים/u, why: 'ספירה בלי שם עצם: "שתית את שתי הכוסות"' },
  { bad: /שלושת הכוסות|שניי? הכוסות/u, why: 'צורת סמיכות שגויה: "שלוש הכוסות" / "שתי הכוסות"' },
  { bad: /מתגעגע לשמוע/u, why: 'צירוף שבור: "מתגעגע! מחכה לשמוע..."' },
];

export const ALMOG_VOICE_RULE = `קול אחד של אלמוג (ALMOG_VOICE — מחייב בכל טקסט):
- חם, אישי וקליל — עברית ישראלית יומיומית עם קצת סלנג טבעי ("וואלה", "סבבה", "יאללה", "אחלה"), כמו חבר קרוב שבאמת אכפת לו. לא רשמי, לא מליצי.
- מגדר הסלנג תואם למשתמש: לגבר — "אחי"/"אלוף" מדי פעם (לא בכל הודעה); לאישה — חום טבעי מקביל ("אלופה", "כל הכבוד לך") ולעולם לא "אחי"/"גבר"/"אלוף"; מגדר לא ידוע — קליל וניטרלי, בלי כינויי חיבה ממוגדרים.
- שיקוף: אם המשתמש כותב רשמי ומנומס — מורידים סלנג ונשארים חמים ופשוטים. אם הוא כותב סלנג — זורמים איתו.
- משלב אחד בלבד לאורך ההודעה וכל סדרת ההודעות לאותו משתמש. אסור לערבב רשמי ("הנך", "יקירי", "נא") עם סלנג.
- בלי הארכות ("דניאללל", "בוקררר") ובלי "!!" — סימן קריאה אחד לכל היותר. בלי "חברותא"/"חברר".
- עברית תקינה: ספירה עם שם עצם ("שתית שתי כוסות מים" — לא "השתיים של המים"), סמיכות נכונה ("שלוש הכוסות").
- מגדר: אלמוג מדבר על עצמו בלשון זכר. הפנייה למשתמש לפי המגדר שלו, בעקביות בכל משפט; מגדר לא ידוע → ניסוח ניטרלי באמת, בלי לוכסנים ("/ה"). דוגמאות בפרומפט בלשון זכר — להמחשה בלבד; המר למגדר של המשתמש.
- לא דיאטן: בלי תפריטים, קלוריות או מספרי משקל/גוף. מתמקדים בהרגלים ובתחושה.`;

const GENDER_EXAMPLES: Record<'male' | 'female' | 'neutral', string> = {
  male: 'דוגמאות לרוח (זכר): "וואלה אחי, יום שני ברצף עם המים 💧 איך זה מרגיש?" · "סבבה, יום עמוס. מה הדבר הקטן שאתה כן יכול היום?"',
  female: 'דוגמאות לרוח (נקבה): "וואלה, יום שני ברצף עם המים 💧 את אלופה. איך זה מרגיש?" · "סבבה, יום עמוס. מה הדבר הקטן שאת כן יכולה היום?"',
  neutral: 'דוגמאות לרוח (ניטרלי): "וואלה, יום שני ברצף עם המים 💧 איך זה מרגיש?" · "סבבה, יום עמוס. מה הדבר הקטן שאפשר לעשות היום?"',
};

export function almogVoiceRule(gender?: HebrewGender, register: AlmogRegister = 'casual'): string {
  const key = gender === 'female' ? 'female' : gender === 'male' ? 'male' : 'neutral';
  const g =
    key === 'female'
      ? 'המשתמשת נקבה — כל פנייה בלשון נקבה (את, תרצי, שתית). אף פעם לא "אחי".'
      : key === 'male'
        ? 'המשתמש זכר — כל פנייה בלשון זכר (אתה, תרצה, שתית).'
        : 'המגדר לא ידוע — ניסוח ניטרלי בלבד, בלי כינויי חיבה ממוגדרים ובלי לוכסנים.';
  return `${ALMOG_VOICE_RULE}\n- ${g}\n- ${almogRegisterHint(register)}\n- ${GENDER_EXAMPLES[key]}`;
}

export function almogRegisterHint(register: AlmogRegister | null | undefined): string {
  return register === 'formal'
    ? 'משלב קבוע למשתמש הזה: מנומס-חם. המשתמש כותב בצורה מסודרת — בלי סלנג ובלי כינויי חיבה, אבל עדיין אישי ופשוט (לא "הנך"/"יקירי").'
    : 'משלב קבוע למשתמש הזה: קליל-חם עם קצת סלנג (מותאם מגדר). שמור עליו בכל ההודעות.';
}

const H = 'א-ת';
function hasWord(text: string, w: string): boolean {
  return new RegExp(`(^|[^${H}])${w}([^${H}]|$)`, 'u').test(text);
}

/**
 * Derive the user's register from their own message. Sticky: returns `prev` unless there is a
 * clear signal (slang → casual; formal politeness without slang → formal).
 */
export function deriveAlmogRegister(userText: string, prev: AlmogRegister | null | undefined): AlmogRegister {
  const t = userText.trim();
  if (!t) return prev ?? 'casual';
  const slang = [...MALE_ONLY_SLANG, ...FEMALE_ONLY_SLANG, ...NEUTRAL_SLANG, 'חחח', 'אוף', 'נו'].some((w) => hasWord(t, w));
  if (slang) return 'casual';
  const formal = /(שלום רב|בברכה|אודה ל|אשמח אם תוכל|האם ניתן|הנני|ברצוני|תודה רבה לך על)/u.test(t);
  if (formal && t.length > 25) return 'formal';
  return prev ?? 'casual';
}

export type VoiceIssue = { kind: 'slang' | 'register' | 'elongation' | 'unnatural' | 'gender'; detail: string };

/** Lint one user-facing Almog string for a given user gender/register. */
export function lintAlmogText(
  text: string,
  opts: { gender?: HebrewGender; userText?: string; register?: AlmogRegister } = {},
): VoiceIssue[] {
  const issues: VoiceIssue[] = [];
  const user = opts.userText ?? '';
  const mirrored = (w: string) => hasWord(user, w);
  const disallowed: string[] = [...ALWAYS_BANNED];
  if (opts.gender !== 'male') disallowed.push(...MALE_ONLY_SLANG);
  if (opts.gender !== 'female') disallowed.push(...FEMALE_ONLY_SLANG);
  if (opts.register === 'formal') disallowed.push(...NEUTRAL_SLANG);
  for (const w of disallowed) if (hasWord(text, w) && !mirrored(w)) issues.push({ kind: 'slang', detail: w });
  const formal = ALMOG_FORMAL_MARKERS.filter((m) => text.includes(m));
  const anySlang = [...MALE_ONLY_SLANG, ...FEMALE_ONLY_SLANG, ...NEUTRAL_SLANG].some((w) => hasWord(text, w));
  if (formal.length && anySlang) issues.push({ kind: 'register', detail: `formal+slang: ${formal.join(',')}` });
  if (/([א-ת])\1\1/u.test(text) || /!!/.test(text)) issues.push({ kind: 'elongation', detail: 'elongated word or !!' });
  for (const p of ALMOG_UNNATURAL_PHRASES) if (p.bad.test(text)) issues.push({ kind: 'unnatural', detail: p.why });
  if (opts.gender === 'female' && /(^|[^א-ת])(אתה|תרצה|תעדכן|תגיד|תנסה|בוא נ)([^א-ת]|$)/u.test(text)) issues.push({ kind: 'gender', detail: 'masculine address to female user' });
  if (opts.gender === 'male' && /(^|[^א-ת])(תרצי|תעדכני|תגידי|תנסי|בואי)/u.test(text)) issues.push({ kind: 'gender', detail: 'feminine address to male user' });
  if (!opts.gender && /[א-ת]\/(ה|י|ת)([^א-ת]|$)/u.test(text)) issues.push({ kind: 'gender', detail: 'slash gender form in neutral text' });
  return issues;
}

/** A message series must stay in one register (no formal message next to slang ones). */
export function seriesRegisterConsistent(texts: string[]): boolean {
  const kinds = texts.map((t) => (ALMOG_FORMAL_MARKERS.some((m) => t.includes(m)) ? 'formal' : 'casual'));
  return new Set(kinds).size <= 1;
}
