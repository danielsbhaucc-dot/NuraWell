/**
 * Structured PII detectors for the outbound guard (Hebrew + English).
 * Each detector returns spans; checksum/validity filters keep false positives (amounts, weights,
 * plan dates, food words) out. Names inside words are never touched ("נועה" ≠ "תנועה").
 */
export type PiiKind =
  | 'CARD' | 'IBAN' | 'IP' | 'PHONE' | 'ID' | 'PASSPORT' | 'BANK_ACCOUNT' | 'BIRTHDATE' | 'ADDRESS' | 'PERSON';

export const PII_KIND_PLACEHOLDER: Record<PiiKind, string> = {
  CARD: '[[USER_CARD]]',
  IBAN: '[[USER_IBAN]]',
  IP: '[[USER_IP]]',
  PHONE: '[[USER_PHONE]]',
  ID: '[[USER_ID]]',
  PASSPORT: '[[USER_PASSPORT]]',
  BANK_ACCOUNT: '[[USER_BANK_ACCOUNT]]',
  BIRTHDATE: '[[USER_BIRTHDATE]]',
  ADDRESS: '[[USER_ADDRESS]]',
  PERSON: '[[PERSON]]',
};

const H = '\\u05D0-\\u05EA';
const digits = (s: string) => s.replace(/\D/g, '');

export function luhnValid(num: string): boolean {
  const d = digits(num);
  if (d.length < 13 || d.length > 19 || /^(\d)\1+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i += 1) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

export function israeliIdValid(raw: string): boolean {
  const d = digits(raw);
  if (d.length < 5 || d.length > 9 || /^0+$/.test(d)) return false;
  const p = d.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    let n = Number(p[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

export function ibanValid(raw: string): boolean {
  const s = raw.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  if (s.startsWith('IL') && s.length !== 23) return false;
  const re = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let m = 0;
  for (const ch of re) m = (m * 10 + Number(ch)) % 97;
  return m === 1;
}

type Det = { kind: PiiKind; re: RegExp; valid?: (m: string, groups: string[]) => boolean; group?: number };

const NOT_DIGIT_BEFORE = '(?<![\\w.,/]|[0-9a-fA-F]-)';
const NOT_DIGIT_AFTER = '(?![\\w]|-[0-9a-fA-F])';

const BIRTH_YEAR_MAX = new Date().getFullYear() - 8;
const HE_MONTHS = 'ינואר|פברואר|מרץ|מרס|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר';
const EN_MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

const birthYearOk = (y: string) => {
  const n = Number(y);
  if (y.length === 2) return false; // 2-digit years are too ambiguous to call a birth date
  return n >= 1900 && n <= BIRTH_YEAR_MAX;
};

/** Words that follow naming phrases but are not names. */
const NOT_A_NAME = new Set(['לי', 'לו', 'לה', 'להם', 'לך', 'זה', 'את', 'אותו', 'אותה', 'הוא', 'היא', 'כך', 'ככה', 'the', 'a', 'an', 'not', 'just']);

export const DETECTORS: Det[] = [
  // credit cards (Luhn) — before phones/ids so their digits are not split
  { kind: 'CARD', re: new RegExp(`${NOT_DIGIT_BEFORE}(?:\\d[ -]?){12,18}\\d${NOT_DIGIT_AFTER}`, 'g'), valid: (m) => luhnValid(m) },
  // IBAN (mod-97); IL = 23 chars
  { kind: 'IBAN', re: /\b[A-Za-z]{2}\d{2}(?:[ -]?[A-Za-z0-9]{2,4}){3,8}\b/g, valid: (m) => ibanValid(m) },
  // IPv4 (valid octets) / IPv6 (full or compressed with ≥3 groups)
  { kind: 'IP', re: /(?<!(?:version|גרסה|v)\s?)\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g },
  { kind: 'IP', re: /\b(?:[0-9a-fA-F]{1,4}:){2,7}(?::?[0-9a-fA-F]{1,4}){1,7}\b/g, valid: (m) => (m.match(/:/g) ?? []).length >= 3 && /\d/.test(m) },
  // Israeli phones: mobile/landline/+972/972/(0X)/1-800/1-700; also generic international +CC…
  { kind: 'PHONE', re: new RegExp(`${NOT_DIGIT_BEFORE}(?:\\+?972[\\s-]?\\(?0?\\)?|\\(?0)(?:5\\d|7\\d|[23489])\\)?[\\s-]?\\d{3}[\\s-]?\\d{3,4}${NOT_DIGIT_AFTER}`, 'g') },
  { kind: 'PHONE', re: new RegExp(`${NOT_DIGIT_BEFORE}1[\\s-]?(?:800|700|599)[\\s-]?\\d{2,3}[\\s-]?\\d{3,4}${NOT_DIGIT_AFTER}`, 'g') },
  { kind: 'PHONE', re: new RegExp(`(?<![\\w+])\\+(?!972)[1-9]\\d{0,2}[\\s-]?(?:\\(?\\d{1,4}\\)?[\\s-]?){2,4}\\d{2,4}${NOT_DIGIT_AFTER}`, 'g'), valid: (m) => digits(m).length >= 8 && digits(m).length <= 15 },
  // Israeli ID: 9 digits (or 8+check with dash), checksum-validated
  { kind: 'ID', re: new RegExp(`${NOT_DIGIT_BEFORE}\\d{8}-?\\d${NOT_DIGIT_AFTER}`, 'g'), valid: (m) => israeliIdValid(m) },
  // ID by keyword even when shorter (ת"ז 1234567-8)
  { kind: 'ID', re: new RegExp(`(?:ת[."״']?ז|תעודת זהות|ת\\.ז\\.|\\bID\\b)\\s*[:#]?\\s*(\\d{5,9}(?:-\\d)?)`, 'gi'), group: 1, valid: (_m, g) => israeliIdValid(g[0]) },
  // passports by keyword
  { kind: 'PASSPORT', re: /(?:דרכון|passport)(?:\s*(?:מספר|מס['׳]?|no\.?|number|#))?\s*[:#]?\s*([A-Za-z]{0,2}\d{6,9})\b/gi, group: 1 },
  // bank account by keyword (חשבון/ח-ן/account/סניף)
  { kind: 'BANK_ACCOUNT', re: new RegExp(`(?:מספר חשבון|חשבון(?: בנק)?|ח[-"״']ן|account(?: number| no\\.?)?|acct\\.?)\\s*[:#]?\\s*(\\d{2,4}[\\s/-]?\\d{3,4}[\\s/-]?\\d{2,9})${NOT_DIGIT_AFTER}`, 'gi'), group: 1, valid: (_m, g) => digits(g[0]).length >= 5 },
  // exact birth-like dates (full date with a year ≤ now-8): 12/03/1985, 12.3.1985, 1985-03-12, 12 במרץ 1985, March 12, 1985
  { kind: 'BIRTHDATE', re: new RegExp(`${NOT_DIGIT_BEFORE}(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4})${NOT_DIGIT_AFTER}`, 'g'), valid: (_m, g) => Number(g[0]) <= 31 && Number(g[1]) <= 12 && birthYearOk(g[2]) },
  { kind: 'BIRTHDATE', re: new RegExp(`${NOT_DIGIT_BEFORE}(\\d{4})-(\\d{1,2})-(\\d{1,2})${NOT_DIGIT_AFTER}`, 'g'), valid: (_m, g) => birthYearOk(g[0]) && Number(g[1]) <= 12 },
  { kind: 'BIRTHDATE', re: new RegExp(`${NOT_DIGIT_BEFORE}\\d{1,2}\\s+(?:ב|ל)?(?:${HE_MONTHS}),?\\s+(\\d{4})${NOT_DIGIT_AFTER}`, 'g'), valid: (_m, g) => birthYearOk(g[0]) },
  { kind: 'BIRTHDATE', re: new RegExp(`\\b(?:(?:${EN_MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+(\\d{4})|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${EN_MONTHS})\\.?,?\\s+(\\d{4}))\\b`, 'gi'), valid: (_m, g) => birthYearOk(g[0] ?? g[1]) },
  // street addresses: Hebrew street keyword + name + number; English number + name + suffix
  { kind: 'ADDRESS', re: new RegExp(`(?:רחוב|רח['׳]|שדרות|שד['׳]|דרך|סמטת|סמ['׳]|כיכר|ככר)\\s+[${H}"״'׳\\-]+(?:\\s+[${H}"״'׳\\-]+){0,3}\\s+\\d{1,4}[א-ת]?(?:\\s*(?:\\/|דירה|ד['׳])\\s*\\d{1,4})?(?:\\s*,\\s*[${H}\\-]+(?:\\s+[${H}\\-]+){0,2})?`, 'g') },
  { kind: 'ADDRESS', re: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Ln|Lane|Dr|Drive|Way|Ct|Court)\b\.?/g },
  // names the user introduces explicitly: "קוראים לי X", "שמי X", "בשם X", "קוראים לו/לה X", "my name is X", "named X"
  {
    kind: 'PERSON',
    re: new RegExp(`(?:(?:^|[^${H}])(?:קוראים\\s+(?:לי|לו|לה)|(?:שמי|שמו|שמה)(?=\\s*(?::|הוא|היא))\\s*(?:הוא|היא)?|בשם|השם\\s+(?:שלי|שלו|שלה)\\s+(?:הוא|היא)?)\\s*[:\\-]?\\s+([${H}]{2,}(?:\\s+[${H}]{2,})?))|\\b(?:my name is|i am called|named|called)\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)`, 'gi'),
    group: 1,
    valid: (_m, g) => {
      const v = (g[0] ?? g[1] ?? '').trim();
      return v.length >= 2 && !NOT_A_NAME.has(v.split(/\s+/)[0].toLowerCase());
    },
  },
];

/** Applies all detectors; `onMatch` returns the placeholder for a detected value. */
export function applyPiiDetectors(text: string, onMatch: (value: string, kind: PiiKind) => string): string {
  let out = text;
  for (const d of DETECTORS) {
    d.re.lastIndex = 0;
    const nCaps = (new RegExp(`${d.re.source}|`).exec('')?.length ?? 1) - 1;
    out = out.replace(d.re, (...args: unknown[]) => {
      const m = args[0] as string;
      const caps = args.slice(1, 1 + nCaps) as (string | undefined)[];
      if (m.includes('[[')) return m;
      if (d.valid && !d.valid(m, caps.filter((c): c is string => typeof c === 'string'))) return m;
      if (d.group) {
        const val = caps.find((c): c is string => typeof c === 'string' && c.trim().length > 0)?.trim();
        if (!val) return m;
        const idx = m.lastIndexOf(val);
        return m.slice(0, idx) + onMatch(val, d.kind) + m.slice(idx + val.length);
      }
      const lead = m.match(/^\s*/)?.[0] ?? '';
      return lead + onMatch(m.trim(), d.kind);
    });
  }
  return out;
}
