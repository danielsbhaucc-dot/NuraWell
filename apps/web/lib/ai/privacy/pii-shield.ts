/**
 * PII Shield — פסידונימיזציה הפיכה לפני שליחה למודלים חיצוניים (Qwen).
 * Edge-safe: regex + Map בלבד, ללא תלות ב-Node APIs.
 */

export const PII_PLACEHOLDERS = {
  USER_FIRST_NAME: '[[USER_FIRST_NAME]]',
  USER_FULL_NAME: '[[USER_FULL_NAME]]',
  USER_PHONE: '[[USER_PHONE]]',
  USER_EMAIL: '[[USER_EMAIL]]',
  USER_ADDRESS: '[[USER_ADDRESS]]',
  USER_ID: '[[USER_ID]]',
} as const;

export type PiiProfileSeed = {
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  known_person_names?: string[];
};

import { applyPiiDetectors, PII_KIND_PLACEHOLDER } from './pii-patterns';

type Replacement = { value: string; placeholder: string };

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * אורך מרבי של placeholder (כולל סוגריים ורווחים). משמש את ה-stream detokenizer
 * כדי לא להחזיק טקסט לנצח כש-`[[` מופיע בלי `]]` סוגר (היה גורם ל"תקיעה"/איטיות).
 */
const MAX_PLACEHOLDER_LEN = 48;

/**
 * בריכת שמות עבריים לפסיאודונימיזציה. במקום להחליף את השם הפרטי בטוקן לטיני
 * (`[[USER_FIRST_NAME]]`) — שמכריח את המודל לכתוב סוגריים מרובעים באמצע משפט
 * עברי, שובר דקדוק/מין וזורם רע — מחליפים בשם עברי טבעי. כך Qwen "חושב" בעברית
 * תקינה, והשם האמיתי משוחזר בשרת לפני שליחה ללקוח. השמות נבחרים דטרמיניסטית
 * (hash) כדי להישאר עקביים לאורך השיחה.
 */
const HEBREW_PSEUDONYM_POOL = [
  'דנה',
  'מאי',
  'רוני',
  'גלי',
  'עומר',
  'נועם',
  'שיר',
  'אורי',
  'טל',
  'יואב',
  'ליאן',
  'עדן',
  'איתי',
  'רותם',
  'ניצן',
  'עמית',
  'הילה',
  'ירדן',
  'אלון',
  'מור',
] as const;

/** בריכת שמות-משפחה עבריים לפסיאודונים של שם מלא. */
const HEBREW_SURNAME_POOL = [
  'כהן',
  'לוי',
  'מזרחי',
  'פרץ',
  'ביטון',
  'דהן',
  'אבני',
  'שרון',
  'גל',
  'ברק',
] as const;

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractFirstName(fullName: string): string | null {
  const trimmed = fullName.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

/** hash דטרמיניסטי (FNV-ish) לבחירת פסיאודונים יציב לכל ערך אמיתי. */
function stableHash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (h * 31 + value.charCodeAt(i)) >>> 0;
  }
  return h;
}

export class PiiShield {
  private replacements: Replacement[] = [];
  private sensitiveValues: string[] = [];
  private usedPseudonyms = new Set<string>();
  private firstNamePseudonym: string | null = null;
  /** perf: O(1) lookups instead of scanning `replacements` (directory shields hold thousands of names). */
  private byValueLower = new Map<string, string>();
  private usedPlaceholders = new Set<string>();
  private nextSuffix = new Map<string, number>();
  private deferSort = false;

  constructor(seed: PiiProfileSeed) {
    this.deferSort = true;
    this.registerFromSeed(seed);
    this.deferSort = false;
    this.replacements.sort((a, b) => b.value.length - a.value.length);
  }

  /** Registers value→placeholder; placeholders are unique per value (`[[USER_EMAIL_2]]` …). */
  private register(value: string, placeholder: string): string {
    const v = value.trim();
    if (v.length < 2) return placeholder;
    const key = v.toLowerCase();
    const existing = this.byValueLower.get(key);
    if (existing) return existing;
    const base = placeholder;
    let ph = base;
    // placeholders are never removed, so resuming from the last used suffix finds the same first free one
    for (let n = this.nextSuffix.get(base) ?? 2; this.usedPlaceholders.has(ph); n += 1) {
      ph = base.replace(/\]\]$/, `_${n}]]`);
      this.nextSuffix.set(base, n + 1);
    }
    placeholder = ph;
    this.replacements.push({ value: v, placeholder });
    this.byValueLower.set(key, placeholder);
    this.usedPlaceholders.add(placeholder);
    this.sensitiveValues.push(v);
    if (!this.deferSort) this.replacements.sort((a, b) => b.value.length - a.value.length);
    return placeholder;
  }

  /**
   * בוחר פסיאודונים עברי יציב מהבריכה, תוך הימנעות מהתנגשות עם הערך האמיתי,
   * עם פסיאודונים שכבר בשימוש, או עם ערכים רגישים אחרים. אם הבריכה מוצתה
   * (נדיר מאוד) — נופלים חזרה לטוקן הברקטים כדי לא לאבד הגנה.
   */
  /**
   * Names become bracket tokens, never Hebrew fake names: a fake name can collide with a real word
   * (גל/טל/מור) and be "restored" wrongly. Uniqueness is enforced in register().
   */
  private allocatePseudonym(_realValue: string, _pool: readonly string[], fallback: string): string {
    return fallback;
  }

  private registerFromSeed(seed: PiiProfileSeed) {
    if (seed.full_name?.trim()) {
      const full = seed.full_name.trim();
      const first = extractFirstName(full);
      if (first) {
        const pseudoFirst = this.allocatePseudonym(
          first,
          HEBREW_PSEUDONYM_POOL,
          PII_PLACEHOLDERS.USER_FIRST_NAME
        );
        this.firstNamePseudonym = this.register(first, pseudoFirst);
        // שם מלא: פסיאודונים עברי טבעי (שם פרטי בדוי + שם משפחה בדוי) כדי
        // שהמודל לעולם לא יראה את השם האמיתי, אך עדיין יקבל טקסט עברי שוטף.
        const lastPart = full.slice(first.length).trim();
        if (lastPart) {
          this.register(full, PII_PLACEHOLDERS.USER_FULL_NAME);
          if (lastPart.length >= 2) this.register(lastPart, '[[USER_LAST_NAME]]');
        }
      } else {
        this.register(full, PII_PLACEHOLDERS.USER_FULL_NAME);
      }
    }
    if (seed.phone?.trim()) this.register(seed.phone.trim(), PII_PLACEHOLDERS.USER_PHONE);
    if (seed.email?.trim()) this.register(seed.email.trim(), PII_PLACEHOLDERS.USER_EMAIL);
    if (seed.address?.trim()) this.register(seed.address.trim(), PII_PLACEHOLDERS.USER_ADDRESS);
    seed.known_person_names?.forEach((name) => {
      const clean = name.trim();
      if (clean.length >= 2) {
        this.register(clean, '[[PERSON]]');
      }
    });
  }

  private placeholderIndex: { size: number; map: Map<string, string> } | null = null;
  private valueByPlaceholder(): Map<string, string> {
    if (!this.placeholderIndex || this.placeholderIndex.size !== this.replacements.length) {
      const map = new Map<string, string>();
      for (const r of this.replacements) if (!map.has(r.placeholder)) map.set(r.placeholder, r.value);
      this.placeholderIndex = { size: this.replacements.length, map };
    }
    return this.placeholderIndex.map;
  }

  /** הפסיאודונים העברי שהוקצה לשם הפרטי (לשימוש בהוראת הפרומפט). */
  get firstNamePlaceholder(): string | null {
    return this.firstNamePseudonym;
  }

  /** מחליף מזהים ידועים + דפוסים מובנים (אימייל/טלפון/ת.ז) */
  tokenizeText(text: string): string {
    if (!text) return text;
    let out = text;

    out = out.replace(EMAIL_REGEX, (match) => {
      return this.register(match, PII_PLACEHOLDERS.USER_EMAIL);
    });

    out = applyPiiDetectors(out, (value, kind) => this.register(value, PII_KIND_PLACEHOLDER[kind]));

    for (const { value, placeholder } of this.replacements) {
      if (out.includes(value)) out = replaceWord(out, value, placeholder);
    }

    return out;
  }

  tokenizeMessages<T extends { role: string; content: string }>(messages: T[]): T[] {
    return messages.map((m) => ({ ...m, content: this.tokenizeText(m.content) }));
  }

  /**
   * משחזר placeholders לערכים אמיתיים — רק בשרת, לפני שליחה ללקוח.
   * סובלני לווריאציות שמודלים קטנים מייצרים: רווחים פנימיים (`[[ USER_FIRST_NAME ]]`).
   */
  detokenizeText(text: string): string {
    if (!text) return text;
    let out = text;
    for (const { value, placeholder } of this.replacements) {
      if (out.includes(placeholder)) out = replaceWord(out, placeholder, value);
    }
    // מעבר נוסף: placeholders עם רווחים פנימיים שהמודל הוסיף.
    if (out.includes('[[')) {
      // one pass instead of one RegExp per registered value; only exact registered tokens are restored
      out = out.replace(/\[\[\s*([^\[\]]*?)\s*\]\]/g, (m, inner: string) => {
        const value = this.valueByPlaceholder().get(`[[${inner}]]`);
        return value ?? m;
      });
    }
    return out;
  }

  /**
   * Detokenizer stateful לסטרימינג — מטפל ב-placeholder/פסיאודונים שנחתך בין
   * chunks. הרעיון: מחזיקים בכל רגע רק את הסיומת הקצרה ביותר של ה-buffer שעדיין
   * *יכולה* להיות תחילתו של placeholder כלשהו (פסיאודונים עברי או טוקן ברקטים).
   * כל השאר נשלח מיד — כך אין השהיה ואין "תקיעה", וגם פסיאודונים שנחתך בדיוק
   * על הגבול בין chunks משוחזר נכון.
   */
  createStreamDetokenizer() {
    let buffer = '';
    const self = this;
    const placeholders = self.replacements.map((r) => r.placeholder);

    const holdLen = (buf: string): number => {
      let hold = 0;
      // (1) סיומת של ה-buffer שהיא prefix (חלקי) של placeholder כלשהו.
      for (const p of placeholders) {
        const max = Math.min(buf.length, p.length - 1);
        for (let k = max; k > hold; k -= 1) {
          if (buf.slice(-k) === p.slice(0, k)) {
            hold = k;
            break;
          }
        }
      }
      // (2) `[[` פתוח בלי `]]` סוגר — מכסה גם וריאציות עם רווחים פנימיים
      // שמודלים קטנים מייצרים. מוגבל ל-MAX_PLACEHOLDER_LEN כדי לא להיתקע.
      const lastOpen = buf.lastIndexOf('[[');
      if (lastOpen !== -1) {
        const tail = buf.slice(lastOpen);
        if (!tail.includes(']]') && tail.length <= MAX_PLACEHOLDER_LEN) {
          hold = Math.max(hold, tail.length);
        }
      }
      return Math.min(hold, buf.length);
    };

    return {
      push(chunk: string): string {
        buffer += chunk;
        const hold = holdLen(buffer);
        const head = buffer.slice(0, buffer.length - hold);
        buffer = buffer.slice(buffer.length - hold);
        return self.detokenizeText(head);
      },
      flush(): string {
        const out = self.detokenizeText(buffer);
        buffer = '';
        return out;
      },
    };
  }

  /** חוסם קריאה אם מזהה רגיש עדיין מופיע ב-payload שנשלח למודל חיצוני */
  assertNoRawPii(payload: string): void {
    for (const value of this.sensitiveValues) {
      // same whole-word rule as tokenizeText (Hebrew name inside another word, e.g. נועה in תנועה, is not PII);
      // a plain substring check here failed every chat whose context had such a word.
      if (value.length >= 3 && payload.includes(value) && replaceWord(payload, value, '\u0000') !== payload) {
        throw new Error('PII shield: blocked outbound request containing raw sensitive identifier');
      }
    }
  }

  get registeredCount(): number {
    return this.replacements.length;
  }
}

const HEB = '\\u05D0-\\u05EA';
/**
 * Hebrew names are replaced as whole words only (an optional 1-2 letter prefix like ל/ו/ש is allowed),
 * so "נועה" never hits the middle of "תנועה". Non-Hebrew values (phone/email/[[TOKENS]]) stay plain substring.
 */
function replaceWord(text: string, from: string, to: string): string {
  if (/^[A-Za-z][A-Za-z '\-]*$/.test(from)) {
    return text.replace(new RegExp(`(?<![A-Za-z])${escapeRegExp(from)}(?![A-Za-z])`, 'g'), to);
  }
  if (!/^[\u05D0-\u05EA][\u05D0-\u05EA '\-]*$/.test(from)) return text.split(from).join(to);
  const re = new RegExp(`(^|[^${HEB}]|(?:^|[^${HEB}])[ובכלמשה]{1,2})${escapeRegExp(from)}(?![${HEB}])`, 'g');
  return text.replace(re, (_m, pre: string) => `${pre}${to}`);
}

export function createPiiShield(seed: PiiProfileSeed): PiiShield {
  return new PiiShield(seed);
}

/** מודלים סיניים/חיצוניים שדורשים צנזור לפני שליחה */
export function modelRequiresPiiShield(model: string): boolean {
  const m = model.trim().toLowerCase();
  return m.startsWith('qwen/') || m.includes('qwen3');
}
