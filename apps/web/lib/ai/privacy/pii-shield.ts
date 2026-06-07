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

function extractFirstName(fullName: string): string | null {
  const trimmed = fullName.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

export class PiiShield {
  private replacements: Replacement[] = [];
  private sensitiveValues: string[] = [];

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

  private registerFromSeed(seed: PiiProfileSeed) {
    if (seed.full_name?.trim()) {
      const full = seed.full_name.trim();
      this.register(full, PII_PLACEHOLDERS.USER_FULL_NAME);
      const first = extractFirstName(full);
      if (first) this.register(first, PII_PLACEHOLDERS.USER_FIRST_NAME);
    }
    if (seed.phone?.trim()) this.register(seed.phone.trim(), PII_PLACEHOLDERS.USER_PHONE);
    if (seed.email?.trim()) this.register(seed.email.trim(), PII_PLACEHOLDERS.USER_EMAIL);
    if (seed.address?.trim()) this.register(seed.address.trim(), PII_PLACEHOLDERS.USER_ADDRESS);
    seed.known_person_names?.forEach((name, i) => {
      const clean = name.trim();
      if (clean.length >= 2) this.register(clean, `[[PERSON_${i + 1}]]`);
    });
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

  /** משחזר placeholders לערכים אמיתיים — רק בשרת, לפני שליחה ללקוח */
  detokenizeText(text: string): string {
    if (!text) return text;
    let out = text;
    for (const { value, placeholder } of this.replacements) {
      if (out.includes(placeholder)) {
        out = out.split(placeholder).join(value);
      }
    }
    return out;
  }

  /** Detokenizer stateful לסטרימינג — מטפל ב-placeholder שנחתך בין chunks */
  createStreamDetokenizer() {
    let buffer = '';
    const self = this;
    return {
      push(chunk: string): string {
        buffer += chunk;
        const lastOpen = buffer.lastIndexOf('[[');
        if (lastOpen === -1) {
          const out = self.detokenizeText(buffer);
          buffer = '';
          return out;
        }
        const tail = buffer.slice(lastOpen);
        if (tail.includes(']]')) {
          const out = self.detokenizeText(buffer);
          buffer = '';
          return out;
        }
        const safePrefix = buffer.slice(0, lastOpen);
        buffer = buffer.slice(lastOpen);
        return self.detokenizeText(safePrefix);
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
