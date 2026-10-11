/**
 * Gender-aware Hebrew copy. Use the user's profile gender; when unknown, a NEUTRAL (plural / impersonal)
 * phrasing — never slash forms like "לחץ/י" or "אליך/ אלייך".
 */
export type UserGender = string | null | undefined; // 'male' | 'female' | other → neutral

export function gx(gender: UserGender, forms: { m: string; f: string; n: string }): string {
  if (gender === 'male') return forms.m;
  if (gender === 'female') return forms.f;
  return forms.n;
}

/** Guard used by tests: user-facing copy must not contain gender slash forms. */
export const GENDER_SLASH_RE = /(?<![א-ת])(?:[א-ת]+\/\s?(?:י|ה|ת|ית|לה|ערה|הבאה|אלייך)|את\/ה|אתה\/את|אליך\/\s?אלייך)(?![א-ת])/;
