/**
 * Regex-only response classifier — safe for client bundles (no AI SDK / API keys).
 */

export type ResponseCategory =
  | 'done'
  | 'partial'
  | 'failed'
  | 'skipped'
  | 'opted_out'
  | 'question'
  | 'unknown';

export type ResponseConfidence = 'high' | 'medium' | 'low';

export type ResponseClassification = {
  category: ResponseCategory;
  confidence: ResponseConfidence;
  source: 'regex' | 'llm' | 'fallback';
  extractedNote?: string;
};

export type ResponseClassifierContext = {
  itemTitle: string;
  itemKind: 'habit' | 'task';
  frequencyLabel?: string;
};

const NORMALIZE_RE = /\s+/g;
function normalize(t: string): string {
  return t.replace(NORMALIZE_RE, ' ').trim();
}

const OPTED_OUT_RE =
  /(?:אני\s+לא\s+רוצה\s+(?:את\s+)?(?:ההרגל|המשימה|זה)\s+(?:הזה|הזאת)?|תוריד(?:י|ו)?\s+(?:לי\s+)?(?:את\s+)?(?:ההרגל|המשימה|זה)|זה\s+לא\s+מתאים\s+לי(?:\s+בכלל)?|לא\s+רלוונטי\s+לי|מוותר(?:ת)?\s+על\s+(?:ההרגל|המשימה)\s+(?:הזה|הזאת|לגמרי)|אני\s+פורש\s+מ(?:ההרגל|המשימה)|תפסיק(?:י|ו)?\s+(?:לבקש|להזכיר)\s+(?:לי\s+)?(?:את\s+)?(?:ההרגל|המשימה|זה))/i;

const SKIPPED_RE =
  /(?:לא\s+היום|מדלג(?:ת|ים)?\s+(?:היום|על\s+זה\s+היום)|מוותר(?:ת)?\s+על\s+(?:זה\s+)?היום|בוא\s+נדלג\s+היום|אקח\s+הפסקה\s+היום|פסיכי\s+לי\s+היום|לא\s+(?:אעשה|אשתה)\s+(?:את\s+זה\s+)?היום|day\s*off)/i;

const FAILED_RE =
  /(?:ניסיתי(?:\s+אבל)?\s+(?:לא\s+(?:הצלחתי|הספקתי)|לא\s+יצא)|השתדלתי(?:\s+אבל)?\s+לא|כמעט\s+הצלחתי\s+אבל|התחלתי\s+אבל\s+(?:לא\s+(?:סיימתי|יכולתי|הגעתי|הצלחתי)|נשבר)|שכחתי\s+(?:לשתות|לעשות|לבצע|את\s+ה)|לא\s+הספקתי\s+אבל\s+ניסיתי|לא\s+הצלחתי\s+(?:להגיע|לעשות|לבצע)|נשבר\s+לי|פאשלתי|כשלון|רציתי\s+אבל\s+לא\s+(?:יצא|הצלחתי)|נפלתי\s+אבל)/i;

const NEGATED_ACTION_RE =
  /(?:לא\s+(?:שתיתי|שתינו|שתית|עשיתי|ביצעתי|סימנתי|סיימתי|הצלחתי|אכלתי|הלכתי)(?:\s+עדיין)?|עדיין\s+לא\s+(?:שתיתי|עשיתי|ביצעתי|סימנתי|סיימתי))/i;

const FUTURE_OR_ADVICE_RE =
  /(?:^(?:אשתה|אעשה|אבצע)\s+מחר|צריך\s+(?:לשתות|לעשות|לבצע)\s+יותר)/i;

const PARTIAL_QUANTIFIERS_RE =
  /(?:קצת|מעט|חצי|רק\s+(?:פעם\s+אחת|אחת|פעמיים|כוס\s+אחת|אחד|שתיים)|חלקית|לא\s+הכל|חלק|רק\s+\d+(?:\s+מתוך\s+\d+)?|\d+\s+מתוך\s+\d+|לא\s+במלואו|לא\s+לגמרי)/i;

const PARTIAL_ACTIONS_RE =
  /(?:שתיתי|שתינו|שתית|עשיתי|ביצעתי|סיימתי|הצלחתי|אכלתי|הלכתי|התחלתי|זרמתי)/i;

const QUESTION_OPENER_RE =
  /^\s*(?:איך|למה|מה(?:\s+ה|\s+זה|\s+כדאי|\s+ההמלצה|\s+ההבדל)|מתי(?:\s+כדאי|\s+אני)?|האם|למי|מי|איפה|כמה(?:\s+פעמים|\s+מים)?|לאיזה)/i;

const DONE_ACTION_RE =
  /(?:^|[\s.,!])(?:שתיתי|שתינו|שתית|עשיתי|ביצעתי|סימנתי|סיימתי|הצלחתי|סגרתי|בוצע|כבר\s+עשיתי|כן\s+עשיתי|נעשה|אכלתי|הלכתי)(?!\s+(?:קצת|מעט|חצי|רק|חלק|חלקית|\d))/i;

const SHORT_AFFIRMATIVE_RE = /^(?:כן|✅|✓|נעשה|done|בוצע|סגור|אלוף)\s*[!.?]*\s*$/i;

export function classifyResponseFast(userMessage: string): ResponseClassification | null {
  const t = normalize(userMessage);
  if (t.length < 1) return null;

  if (OPTED_OUT_RE.test(t)) {
    return { category: 'opted_out', confidence: 'high', source: 'regex' };
  }

  if (SKIPPED_RE.test(t)) {
    return { category: 'skipped', confidence: 'high', source: 'regex' };
  }

  if (FAILED_RE.test(t)) {
    return { category: 'failed', confidence: 'high', source: 'regex' };
  }

  if (NEGATED_ACTION_RE.test(t)) {
    return { category: 'failed', confidence: 'high', source: 'regex' };
  }

  if (FUTURE_OR_ADVICE_RE.test(t)) {
    return null;
  }

  if (PARTIAL_QUANTIFIERS_RE.test(t) && PARTIAL_ACTIONS_RE.test(t)) {
    const quantMatch = t.match(PARTIAL_QUANTIFIERS_RE);
    const note = quantMatch?.[0]?.trim();
    return {
      category: 'partial',
      confidence: 'high',
      source: 'regex',
      ...(note ? { extractedNote: note } : {}),
    };
  }

  if (QUESTION_OPENER_RE.test(t) || /\?\s*$/.test(t)) {
    if (!PARTIAL_ACTIONS_RE.test(t) || /\?\s*$/.test(t)) {
      return { category: 'question', confidence: 'medium', source: 'regex' };
    }
  }

  if (SHORT_AFFIRMATIVE_RE.test(t) || DONE_ACTION_RE.test(t)) {
    return { category: 'done', confidence: 'high', source: 'regex' };
  }

  return null;
}

export type TaskExecutionOutcomeFromCategory =
  | 'completed'
  | 'partial'
  | 'attempt_failed'
  | 'skipped';

export function outcomeFromCategory(
  category: ResponseCategory
): TaskExecutionOutcomeFromCategory | null {
  switch (category) {
    case 'done':
      return 'completed';
    case 'partial':
      return 'partial';
    case 'failed':
      return 'attempt_failed';
    case 'skipped':
      return 'skipped';
    default:
      return null;
  }
}

export function isReportingCategory(category: ResponseCategory): boolean {
  return (
    category === 'done' ||
    category === 'partial' ||
    category === 'failed' ||
    category === 'skipped' ||
    category === 'opted_out'
  );
}
