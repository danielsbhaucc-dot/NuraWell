import { CRISIS_ESCALATION_MESSAGE, ISRAEL_CRISIS_RESOURCES } from './crisis-resources';

export type CrisisSignalCategory =
  | 'suicidal_ideation'
  | 'self_harm'
  | 'immediate_danger'
  | 'eating_disorder'
  | 'severe_distress';

export type CrisisCategory =
  | 'suicidal_ideation'
  | 'self_harm'
  | 'eating_disorder_red_flag'
  | 'acute_distress'
  | 'none';

export type CrisisSeverity = 'none' | 'caution' | 'red_flag';

export type CrisisDetectionResult = {
  redFlag: boolean;
  severity: CrisisSeverity;
  category: CrisisSignalCategory | null;
  matchedText: string | null;
  escalationMessage: string | null;
  resources: typeof ISRAEL_CRISIS_RESOURCES | null;
};

export type CrisisDetection = {
  hasRedFlag: boolean;
  category: CrisisCategory;
  severity: CrisisSeverity;
  matchedPattern?: string;
  escalationMessage?: string;
  resources: typeof ISRAEL_CRISIS_RESOURCES;
};

type CrisisPattern = {
  category: CrisisSignalCategory;
  legacyCategory: Exclude<CrisisCategory, 'none'>;
  severity: Exclude<CrisisSeverity, 'none'>;
  regex: RegExp;
};

const HEBREW_NIKKUD = /[\u0591-\u05c7]/g;

const CRISIS_PATTERNS: CrisisPattern[] = [
  {
    category: 'suicidal_ideation',
    legacyCategory: 'suicidal_ideation',
    severity: 'red_flag',
    regex: /(רוצה|בא לי|מתכוונ(?:ן|נת)?|מתכננ(?:ת|ן)?|הולכ(?:ת|ך)?)\s+(?:פשוט\s+)?(למות|להתאבד|לסיים את החיים|לא להיות פה|להיעלם לתמיד)/i,
  },
  {
    category: 'suicidal_ideation',
    legacyCategory: 'suicidal_ideation',
    severity: 'red_flag',
    regex: /(אין לי (?:כוח|סיבה) לחיות|לא רוצה לחיות|לא מסוגל(?:ת)? לחיות|עדיף שאמות|הלוואי שלא אתעורר|הלוואי שלא הייתי קיים|הלוואי שלא הייתי קיימת)/i,
  },
  {
    category: 'self_harm',
    legacyCategory: 'self_harm',
    severity: 'red_flag',
    regex: /(לפגוע בעצמי|פוגע(?:ת)? בעצמי|חותכ(?:ת)? את עצמי|לחתוך את עצמי|חתכתי את עצמי|אחתוך את עצמי|להכאיב לעצמי|פגיעה עצמית)/i,
  },
  {
    category: 'immediate_danger',
    legacyCategory: 'acute_distress',
    severity: 'red_flag',
    regex: /(סכנה מיידית|אני בסכנה|מישהו מאיים עליי|מישהו פוגע בי|מישהו יפגע בי|אני לא בטוח(?:ה)? עכשיו|אני עומד(?:ת)? לעשות משהו מסוכן)/i,
  },
  {
    category: 'eating_disorder',
    legacyCategory: 'eating_disorder_red_flag',
    severity: 'red_flag',
    regex: /(מקיא(?:ה)? אחרי (?:אוכל|ארוחה)|להקיא אחרי (?:אוכל|ארוחה)|הקאתי|להקיא כדי|משלשל(?:ת|ים)? כדי לרדת|לקחת משלשלים|כדורי הרזיה|לשרוף קלוריות בכוח)/i,
  },
  {
    category: 'eating_disorder',
    legacyCategory: 'eating_disorder_red_flag',
    severity: 'red_flag',
    regex: /(לא (?:אוכל|אוכלת) כל היום|לא לאכול בכלל|מרעיב(?:ה)? את עצמי|להרעיב את עצמי|צמתי יומיים|חייב(?:ת)? לא לאכול)/i,
  },
  {
    category: 'severe_distress',
    legacyCategory: 'acute_distress',
    severity: 'caution',
    regex: /(אני קורס(?:ת)?|אני נשבר(?:ת)?|נשברתי|אני מתפרק(?:ת)?|לא מסוגל(?:ת)? יותר|לא יכול(?:ה)? יותר|אין לי אוויר|הכל גדול עליי|הכול חסר טעם|הכל חסר טעם)/i,
  },
  {
    category: 'eating_disorder',
    legacyCategory: 'eating_disorder_red_flag',
    severity: 'caution',
    regex: /(שונא(?:ת)? את הגוף שלי|מגעיל אותי הגוף שלי|סופר(?:ת)? כל קלוריה|סופרת כל קלוריה|פחד מאוכל|מפחד(?:ת)? לאכול)/i,
  },
  {
    category: 'suicidal_ideation',
    legacyCategory: 'suicidal_ideation',
    severity: 'red_flag',
    regex: /\b(i want to die|i want to kill myself|suicidal|suicide|end my life|don't want to live|dont want to live|no reason to live)\b/i,
  },
  {
    category: 'self_harm',
    legacyCategory: 'self_harm',
    severity: 'red_flag',
    regex: /\b(self[-\s]?harm|hurt myself|cut myself|harm myself)\b/i,
  },
  {
    category: 'eating_disorder',
    legacyCategory: 'eating_disorder_red_flag',
    severity: 'red_flag',
    regex: /\b(vomit|purge|laxatives|starve myself|not eat at all)\b/i,
  },
];

function normalizeForDetection(input: string): string {
  return input
    .normalize('NFKC')
    .replace(HEBREW_NIKKUD, '')
    .replace(/[״"׳']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findCrisisPattern(input: string): { pattern: CrisisPattern; matchedText: string } | null {
  const normalized = normalizeForDetection(input);
  if (!normalized) return null;

  for (const pattern of CRISIS_PATTERNS) {
    const match = normalized.match(pattern.regex);
    if (match?.[0]) {
      return { pattern, matchedText: match[0] };
    }
  }

  return null;
}

export function detectCrisisSignals(input: string | null | undefined): CrisisDetectionResult {
  const match = findCrisisPattern(input ?? '');

  if (!match) {
    return {
      redFlag: false,
      severity: 'none',
      category: null,
      matchedText: null,
      escalationMessage: null,
      resources: null,
    };
  }

  const { pattern, matchedText } = match;
  return {
    redFlag: pattern.severity === 'red_flag',
    severity: pattern.severity,
    category: pattern.category,
    matchedText,
    escalationMessage: pattern.severity === 'red_flag' ? CRISIS_ESCALATION_MESSAGE : null,
    resources: pattern.severity === 'red_flag' ? ISRAEL_CRISIS_RESOURCES : null,
  };
}

export function assertNoCrisisSignals(input: string | null | undefined): void {
  const result = detectCrisisSignals(input);
  if (result.redFlag) {
    throw new Error(`Crisis red flag detected: ${result.category}`);
  }
}

export function detectCrisis(input: string | null | undefined): CrisisDetection {
  const match = findCrisisPattern(input ?? '');

  if (!match) {
    return {
      hasRedFlag: false,
      category: 'none',
      severity: 'none',
      resources: ISRAEL_CRISIS_RESOURCES,
    };
  }

  const { pattern } = match;
  return {
    hasRedFlag: pattern.severity === 'red_flag',
    category: pattern.legacyCategory,
    severity: pattern.severity,
    matchedPattern: pattern.regex.source,
    escalationMessage: pattern.severity === 'red_flag' ? CRISIS_ESCALATION_MESSAGE : undefined,
    resources: ISRAEL_CRISIS_RESOURCES,
  };
}

export function buildCrisisEscalationResponse(): string {
  return CRISIS_ESCALATION_MESSAGE;
}
