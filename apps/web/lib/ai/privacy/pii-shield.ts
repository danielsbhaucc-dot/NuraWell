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

type Replacement = { value: string; placeholder: string };

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+972[\-\s]?|0)(?:5[0-9]|[23489])[\-\s]?\d{3}[\-\s]?\d{4,5}/g;
const ISRAELI_ID_REGEX = /\b\d{9}\b/g;

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

  constructor(seed: PiiProfileSeed) {
    this.registerFromSeed(seed);
  }

  private register(value: string, placeholder: string) {
    const v = value.trim();
    if (v.length < 2) return;
    if (this.replacements.some((r) => r.value.toLowerCase() === v.toLowerCase())) return;
    this.replacements.push({ value: v, placeholder });
    this.sensitiveValues.push(v);
    this.replacements.sort((a, b) => b.value.length - a.value.length);
  }

  /**
   * בוחר פסיאודונים עברי יציב מהבריכה, תוך הימנעות מהתנגשות עם הערך האמיתי,
   * עם פסיאודונים שכבר בשימוש, או עם ערכים רגישים אחרים. אם הבריכה מוצתה
   * (נדיר מאוד) — נופלים חזרה לטוקן הברקטים כדי לא לאבד הגנה.
   */
  private allocatePseudonym(realValue: string, pool: readonly string[], fallback: string): string {
    const start = stableHash(realValue.toLowerCase()) % pool.length;
    for (let i = 0; i < pool.length; i += 1) {
      const cand = pool[(start + i) % pool.length];
      const lc = cand.toLowerCase();
      if (lc === realValue.toLowerCase()) continue;
      if (this.usedPseudonyms.has(lc)) continue;
      if (this.sensitiveValues.some((v) => v.toLowerCase() === lc)) continue;
      this.usedPseudonyms.add(lc);
      return cand;
    }
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
        this.firstNamePseudonym = pseudoFirst;
        this.register(first, pseudoFirst);
        // שם מלא: פסיאודונים עברי טבעי (שם פרטי בדוי + שם משפחה בדוי) כדי
        // שהמודל לעולם לא יראה את השם האמיתי, אך עדיין יקבל טקסט עברי שוטף.
        const lastPart = full.slice(first.length).trim();
        if (lastPart) {
          const pseudoLast = this.allocatePseudonym(
            lastPart,
            HEBREW_SURNAME_POOL,
            PII_PLACEHOLDERS.USER_FULL_NAME
          );
          this.register(full, `${pseudoFirst} ${pseudoLast}`);
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
        this.register(
          clean,
          this.allocatePseudonym(clean, HEBREW_PSEUDONYM_POOL, PII_PLACEHOLDERS.USER_FULL_NAME)
        );
      }
    });
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
      this.register(match, PII_PLACEHOLDERS.USER_EMAIL);
      return PII_PLACEHOLDERS.USER_EMAIL;
    });

    out = out.replace(PHONE_REGEX, (match) => {
      this.register(match, PII_PLACEHOLDERS.USER_PHONE);
      return PII_PLACEHOLDERS.USER_PHONE;
    });

    out = out.replace(ISRAELI_ID_REGEX, (match) => {
      this.register(match, PII_PLACEHOLDERS.USER_ID);
      return PII_PLACEHOLDERS.USER_ID;
    });

    for (const { value, placeholder } of this.replacements) {
      if (out.includes(value)) {
        out = out.split(value).join(placeholder);
      }
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
      if (out.includes(placeholder)) {
        out = out.split(placeholder).join(value);
      }
    }
    // מעבר נוסף: placeholders עם רווחים פנימיים שהמודל הוסיף.
    if (out.includes('[[')) {
      for (const { value, placeholder } of this.replacements) {
        const inner = placeholder.replace(/^\[\[/, '').replace(/\]\]$/, '');
        const re = new RegExp(`\\[\\[\\s*${escapeRegExp(inner)}\\s*\\]\\]`, 'g');
        out = out.replace(re, value);
      }
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
      if (value.length >= 3 && payload.includes(value)) {
        throw new Error('PII shield: blocked outbound request containing raw sensitive identifier');
      }
    }
  }

  get registeredCount(): number {
    return this.replacements.length;
  }
}

export function createPiiShield(seed: PiiProfileSeed): PiiShield {
  return new PiiShield(seed);
}

/** מודלים סיניים/חיצוניים שדורשים צנזור לפני שליחה */
export function modelRequiresPiiShield(model: string): boolean {
  const m = model.trim().toLowerCase();
  return m.startsWith('qwen/') || m.includes('qwen3');
}
