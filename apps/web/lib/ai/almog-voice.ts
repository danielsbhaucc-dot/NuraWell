/**
 * ALMOG_VOICE — one consistent Hebrew voice for every Almog text (chat, notifications,
 * nudges, decay/re-engagement, celebrations). Source of truth for the style lint in
 * tests/almog-voice.test.ts. (Gideon weekly review 2026-10: slang mixing + register drift.)
 */
import type { HebrewGender } from './hebrew-output-rules';

/** Slang/pet names Almog never initiates. Allowed only when mirroring the user's own words. */
export const ALMOG_BANNED_SLANG = ['אחי', 'אחותי', 'אחיי', 'חברותא', 'וואלה', 'חביבי', 'חביבתי', 'חמוד', 'חמודה', 'חברר', 'אלוף', 'אלופה', 'יא גבר', 'יא מלך', 'מלכה', 'נשמה', 'מותק', 'יתותח', 'יששש'] as const;

/** Formal/stiff markers — mixing these with casual text is the register drift Gideon flagged. */
export const ALMOG_FORMAL_MARKERS = ['הנך', 'יקירי', 'יקירתי', 'ברצונך', 'שלום וברכה', 'נא ל', 'הינך', 'כבודו'] as const;

/** Known unnatural phrasings that actually shipped. Kept as a regression list. */
export const ALMOG_UNNATURAL_PHRASES: Array<{ bad: RegExp; why: string }> = [
  { bad: /השתיים של המים|השלוש של המים/u, why: 'ספירה בלי שם עצם: "שתית את שתי הכוסות"' },
  { bad: /שלושת הכוסות|שניי? הכוסות/u, why: 'צורת סמיכות שגויה: "שלוש הכוסות" / "שתי הכוסות"' },
  { bad: /מתגעגע לשמוע/u, why: 'צירוף שבור: "מתגעגע! מחכה לשמוע..."' },
];

export const ALMOG_VOICE_RULE = `קול אחד של אלמוג (ALMOG_VOICE — מחייב בכל טקסט):
- בוגר, חם, טבעי ורהוט — כמו אדם משכיל ונעים שכותב לחבר שהוא מכבד. לא שפת רחוב, לא שפה רשמית.
- משלב אחד לאורך כל ההודעה וכל סדרת ההודעות: גוף שני ישיר ("את"/"אתה"), בגובה העיניים. אסור לערבב רשמי ("הנך", "יקירי", "נא") עם קליל באותה הודעה או סדרה.
- בלי סלנג וכינויי חיבה: "אחי", "אחותי", "חברותא", "וואלה", "אלוף", "חביבי", "נשמה", "מותק". מותר רק כשהמשתמש עצמו כותב כך — ואז במידה ובאותה רוח שלו.
- בלי הארכות ("דניאללל", "בוקררר") ובלי "!!" — סימן קריאה אחד לכל היותר.
- עברית תקינה: ספירה עם שם עצם ("שתית שתי כוסות מים", "שתי הכוסות" — לא "השתיים של המים"), סמיכות נכונה ("שלוש הכוסות").
- מגדר: אלמוג מדבר על עצמו בלשון זכר. הפנייה למשתמש לפי המגדר שלו, בעקביות בכל משפט. מגדר לא ידוע → ניסוח ניטרלי באמת ("אפשר", "מה דעתך", שם פועל), בלי לוכסנים ("/ה"). דוגמאות בפרומפט שכתובות בלשון זכר — להמחשה בלבד; המר אותן למגדר של המשתמש.
- לא דיאטן: בלי תפריטים, קלוריות או מספרי משקל/גוף. מתמקדים בהרגלים ובתחושה.`;

export function almogVoiceRule(gender?: HebrewGender): string {
  const g =
    gender === 'female'
      ? 'המשתמשת נקבה — כל פנייה בלשון נקבה (את, תרצי, שתית).'
      : gender === 'male'
        ? 'המשתמש זכר — כל פנייה בלשון זכר (אתה, תרצה, שתית).'
        : 'המגדר לא ידוע — ניסוח ניטרלי בלבד, בלי "/ה" ובלי לוכסנים.';
  return `${ALMOG_VOICE_RULE}\n- ${g}`;
}

export type VoiceIssue = { kind: 'slang' | 'register' | 'elongation' | 'unnatural' | 'gender'; detail: string };

const H = 'א-ת';
function hasWord(text: string, w: string): boolean {
  return new RegExp(`(^|[^${H}])${w}([^${H}]|$)`, 'u').test(text);
}

/** Lint one user-facing Almog string. `userText` = what the user wrote (slang mirroring allowed). */
export function lintAlmogText(text: string, opts: { gender?: HebrewGender; userText?: string } = {}): VoiceIssue[] {
  const issues: VoiceIssue[] = [];
  const user = opts.userText ?? '';
  for (const w of ALMOG_BANNED_SLANG) {
    if (hasWord(text, w) && !hasWord(user, w)) issues.push({ kind: 'slang', detail: w });
  }
  const formal = ALMOG_FORMAL_MARKERS.filter((m) => text.includes(m));
  if (formal.length && issues.some((i) => i.kind === 'slang')) issues.push({ kind: 'register', detail: `formal+slang: ${formal.join(',')}` });
  if (/([א-ת])\1\1/u.test(text) || /!!/.test(text)) issues.push({ kind: 'elongation', detail: 'elongated word or !!' });
  for (const p of ALMOG_UNNATURAL_PHRASES) if (p.bad.test(text)) issues.push({ kind: 'unnatural', detail: p.why });
  if (opts.gender === 'female' && /(^|[^א-ת])(אתה|תרצה|תעדכן|תגיד|תנסה|בוא נ)([^א-ת]|$)/u.test(text)) issues.push({ kind: 'gender', detail: 'masculine address to female user' });
  if (opts.gender === 'male' && /(^|[^א-ת])(תרצי|תעדכני|תגידי|תנסי|בואי)/u.test(text)) issues.push({ kind: 'gender', detail: 'feminine address to male user' });
  if (!opts.gender && /[א-ת]\/(ה|י|ת)([^א-ת]|$)/u.test(text)) issues.push({ kind: 'gender', detail: 'slash gender form in neutral text' });
  return issues;
}
