/**
 * Deterministic Hebrew phrasing guard for notification text (Almog voice).
 *
 * Why: ALMOG_VOICE rules (no elongations, single "!", "שתי כוסות", gender-matched slang, no slash
 * forms) lived only inside the generation prompts. Nothing enforced them, so defects shipped
 * ("בוקר אורר", "דניאללל", "שני כוסות", "וואלה אחי!!", a greeting with a *different* person's name).
 * This runs at generation time (inside validateNotifyText) and in the nightly sweep. Zero cost.
 *
 *  - fixes: safe, mechanical rewrites (applied silently)
 *  - issues: defects that need rephrasing → generation retries; nightly sweep sends to the LLM editor
 */
import { ALMOG_UNNATURAL_PHRASES, ALWAYS_BANNED, FEMALE_ONLY_SLANG, MALE_ONLY_SLANG } from '@/lib/module-api/agent/lib-ai-almog-voice';

export type NotifyGender = 'male' | 'female' | 'other' | null | undefined;

export type NotifyLintResult = { text: string; fixes: string[]; issues: string[] };

const HEB = '\\u05D0-\\u05EA';
/** common Israeli first names the models hallucinate into greetings (incl. prompt examples like "יוסי") */
const COMMON_NAMES = [
  'יוסי', 'יובל', 'דני', 'דנה', 'נועה', 'מיכל', 'רוני', 'עומר', 'איתי', 'אורי', 'שירה', 'תמר', 'נועם',
  'אלון', 'רון', 'גיא', 'עדי', 'מאיה', 'יעל', 'אביב', 'משה', 'דוד', 'שרה', 'רחל', 'ליאור', 'אמיר',
];

const NAME_SLOT = new RegExp(
  `(?:^|[\\s,.!?])(?:היי|הי|אהלן|שלום|בוקר\\s+(?:טוב|אור)|ערב\\s+טוב|צהריים\\s+טובים|לילה\\s+טוב|מה\\s+קורה|וואלה|יאללה)[\\s,]+([${HEB}]{2,})`,
  'gu'
);

function hasWord(text: string, word: string): boolean {
  return new RegExp(`(?:^|[^${HEB}])${word}(?=$|[^${HEB}])`, 'u').test(text);
}

export function lintNotifyHebrew(
  input: string,
  opts: { firstName?: string | null; gender?: NotifyGender } = {}
): NotifyLintResult {
  const fixes: string[] = [];
  const issues: string[] = [];
  let t = input;
  const first = opts.firstName?.trim() || '';

  const apply = (re: RegExp, to: string | ((...a: string[]) => string), label: string) => {
    const next = t.replace(re, to as never);
    if (next !== t) {
      t = next;
      fixes.push(label);
    }
  };

  // elongations: "דניאללל", "בוקררר", "טובבב" (3+ same Hebrew letter) → one letter
  apply(new RegExp(`([${HEB}])\\1{2,}`, 'gu'), '$1', 'elongation');
  // doubled final letter on greetings: "אורר", "בוקרר", "טובב"
  apply(/(?<![\u05D0-\u05EA])(בוקר|אור|טוב|ערב|היי)(ר|ב|י)(?![\u05D0-\u05EA])/gu, (m: string, w: string, d: string) =>
    w.endsWith(d) ? w : m, 'doubled_letter');
  // "!!" / "?!!" → single mark
  apply(/([!?])[!?]+/gu, '$1', 'multi_punct');
  // "כוס" is feminine: "שני כוסות" → "שתי כוסות", "שני הכוסות" → "שתי הכוסות"
  apply(/(?<![\u05D0-\u05EA])שני(\s+)(ה?כוסות)/gu, 'שתי$1$2', 'number_gender');
  apply(/(?<![\u05D0-\u05EA])שתיים(\s+)(ה?כוסות)/gu, 'שתי$1$2', 'number_form');
  // "ל-שתיית" style hyphen after a one-letter prefix
  apply(/(?<![\u05D0-\u05EA])([בלמכשהו])-(?=[\u05D0-\u05EA])/gu, '$1', 'prefix_hyphen');
  if (t !== input) t = t.replace(/\s{2,}/g, ' ').trim();

  for (const p of ALMOG_UNNATURAL_PHRASES) if (p.bad.test(t)) issues.push(`unnatural: ${p.why}`);
  if (/(?:^|\s)[\u05D0-\u05EA]+\/(?:ה|ת|י|ית|ים|ות|תי)(?=$|[\s,.!?])/u.test(t)) issues.push('slash gender form');
  for (const w of ALWAYS_BANNED) if (hasWord(t, `[והבלמכש]{0,2}${w}`)) issues.push(`banned word: ${w}`);
  if (opts.gender && opts.gender !== 'male') {
    for (const w of MALE_ONLY_SLANG) if (hasWord(t, w)) issues.push(`male slang for non-male user: ${w}`);
  }
  if (opts.gender && opts.gender !== 'female') {
    for (const w of FEMALE_ONLY_SLANG) if (hasWord(t, w)) issues.push(`female slang for non-female user: ${w}`);
  }
  for (const m of t.matchAll(NAME_SLOT)) {
    const name = m[1]!;
    if (COMMON_NAMES.includes(name) && name !== first && !issues.includes(`wrong name in greeting: ${name}`)) issues.push(`wrong name in greeting: ${name}`);
  }
  for (const n of COMMON_NAMES) {
    if (n === first || issues.some((i) => i.endsWith(`: ${n}`))) continue;
    if (new RegExp(`(?:^|[^${HEB}])${n}(?=[!,])`, 'u').test(t)) issues.push(`wrong name in greeting: ${n}`);
  }
  // the same greeting twice ("בוקר טוב ... בוקר טוב")
  if (/(בוקר טוב|ערב טוב|בוקר אור)[\s\S]*\1/u.test(t)) issues.push('repeated greeting');
  return { text: t, fixes, issues };
}

/** Map the Hebrew gender instruction used in prompts back to a gender value. */
export function genderFromInstruction(instruction?: string | null): NotifyGender {
  const s = (instruction ?? '').trim();
  if (s.startsWith('המשתמשת נקבה')) return 'female';
  if (s.startsWith('המשתמש זכר')) return 'male';
  return 'other';
}
